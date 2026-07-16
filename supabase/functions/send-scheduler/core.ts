// send-scheduler CORE — pure, dependency-injected scheduling logic.
//
// Every §9.5 invariant is enforced HERE, in decide()/runScheduler(), not in UI:
//   * no send without approval          (sequence status gate)
//   * suppression honored at SEND time  (suppressed check per recipient)
//   * cold requires a verified domain   (mode gate)
//   * caps respected, overflow defers   (domain + warm workspace caps)
//   * window deferral                   (never sends at 3am — E2.1)
//   * tokens must resolve               (never send {{firstName}} literally — §9.4)
//   * everything logged                 (claim-before-send message row; the
//                                        unique (enrollment_id, step_idx) key
//                                        makes double-send impossible)
//
// No Deno / Supabase imports — this module is imported by the Deno shell
// (index.ts) AND by vitest (tests/scheduler.test.ts). Keep it that way.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SendWindow {
  tz?: string;
  days?: number[]; // 0=Sun … 6=Sat
  startHour?: number; // inclusive
  endHour?: number; // exclusive
}

export interface SequenceStep {
  idx: number;
  dayOffset: number;
  subject: string;
  body: string;
}

export interface SequenceRow {
  id: string;
  workspace_id: string;
  mode: "warm" | "cold";
  status: string;
  steps: SequenceStep[];
  send_window: SendWindow | null;
  sending_domain_id: string | null;
}

export interface ProspectRow {
  id: string;
  first_name: string;
  last_name: string;
  title: string;
  company: string;
  email: string;
}

export interface EnrollmentRow {
  id: string;
  workspace_id: string;
  sequence_id: string;
  prospect_id: string;
  status: string;
  current_step: number;
  next_send_at: string | null;
}

export interface DomainRow {
  id: string;
  status: string;
  daily_cap: number;
  sent_today: number;
  sent_today_date: string | null;
}

export interface MessageRow {
  id: string;
  status: string;
  attempt: number;
  error: string;
  updated_at: string;
}

export interface Bundle {
  enrollment: EnrollmentRow;
  sequence: SequenceRow | null;
  prospect: ProspectRow | null;
}

export interface SchedulerConfig {
  /** Per-workspace daily cap on warm CRM sends. */
  warmDailyCap: number;
  /** Max delivery attempts for a step before the enrollment pauses. */
  maxAttempts: number;
  /** Minutes before a stale 'queued' claim may be taken over. */
  retryAfterMinutes: number;
  /** Minutes to defer on a hold (unapproved / disconnected / cap edge). */
  holdMinutes: number;
  /** Max enrollments processed per run. */
  batchLimit: number;
}

export const DEFAULT_CONFIG: SchedulerConfig = {
  warmDailyCap: 100,
  maxAttempts: 3,
  retryAfterMinutes: 10,
  holdMinutes: 30,
  // Sequential provider calls at ~1s each must finish inside pg_net's HTTP
  // timeout (migration 023). 25 per 5-min run = plenty of headroom.
  batchLimit: 25,
};

export const DEFAULT_WINDOW: Required<SendWindow> = {
  tz: "UTC",
  days: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 17,
};

// ─── Send window (workspace-TZ business hours — E2.1/O6) ─────────────────────

const normalizeWindow = (w?: SendWindow | null): Required<SendWindow> => {
  const days = Array.isArray(w?.days) && w.days.length
    ? w.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : DEFAULT_WINDOW.days;
  const startHour = Number.isFinite(w?.startHour) ? Number(w?.startHour) : DEFAULT_WINDOW.startHour;
  const endHour = Number.isFinite(w?.endHour) ? Number(w?.endHour) : DEFAULT_WINDOW.endHour;
  return {
    tz: w?.tz || DEFAULT_WINDOW.tz,
    days: days.length ? days : DEFAULT_WINDOW.days,
    startHour: Math.min(Math.max(startHour, 0), 23),
    endHour: endHour > startHour ? Math.min(endHour, 24) : Math.min(startHour + 8, 24),
  };
};

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Local weekday + hour of `date` in `tz` (falls back to UTC on a bad tz id). */
const localParts = (date: Date, tz: string): { dow: number; hour: number } => {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hour12: false });
  } catch {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", hour: "numeric", hour12: false });
  }
  const parts = fmt.formatToParts(date);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "9") % 24;
  return { dow: DOW[wd] ?? 1, hour };
};

export const isWithinWindow = (date: Date, window?: SendWindow | null): boolean => {
  const w = normalizeWindow(window);
  const { dow, hour } = localParts(date, w.tz);
  return w.days.includes(dow) && hour >= w.startHour && hour < w.endHour;
};

/**
 * The next instant at/after `date` inside the window. Walks forward in 15-min
 * increments (tz-safe without a tz library); bounded at 2 weeks so a degenerate
 * window can't loop forever.
 */
export const deferToWindow = (date: Date, window?: SendWindow | null): Date => {
  if (isWithinWindow(date, window)) return date;
  const STEP = 15 * 60 * 1000;
  let t = Math.ceil(date.getTime() / STEP) * STEP;
  for (let i = 0; i < (14 * 24 * 4); i++) {
    const candidate = new Date(t);
    if (isWithinWindow(candidate, window)) return candidate;
    t += STEP;
  }
  return new Date(t);
};

// ─── Personalization tokens (§9.4 — resolve or block, never send literally) ──

const TOKEN_FIELDS: Record<string, keyof ProspectRow> = {
  firstname: "first_name",
  lastname: "last_name",
  fullname: "first_name", // resolved specially below
  company: "company",
  title: "title",
  email: "email",
};

export const resolveTokens = (
  text: string,
  prospect: ProspectRow,
): { text: string; missing: string[] } => {
  const missing: string[] = [];
  const out = String(text ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (raw, name: string) => {
    const key = name.toLowerCase();
    let value = "";
    if (key === "fullname") {
      value = [prospect.first_name, prospect.last_name].filter(Boolean).join(" ").trim();
    } else if (TOKEN_FIELDS[key]) {
      value = String(prospect[TOKEN_FIELDS[key]] ?? "").trim();
    }
    if (!value) {
      missing.push(raw);
      return raw;
    }
    return value;
  });
  return { text: out, missing: Array.from(new Set(missing)) };
};

/** Plain text → minimal safe HTML (Zoho send_mail is mail_format:'html'). */
export const textToHtml = (text: string): string =>
  String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r\n|\r|\n/g, "<br>");

// ─── The decision function (one enrollment → one action) ─────────────────────

export type Decision =
  | { action: "send"; stepIdx: number; subject: string; body: string; sendPath: string }
  | { action: "defer"; until: Date; reason: string }
  | { action: "hold"; reason: string }
  | { action: "stop"; status: string; reason: string }
  | { action: "complete" }
  | { action: "skip"; reason: string };

const SENDABLE_SEQUENCE_STATUSES = new Set(["approved", "scheduled", "active"]);

export const sendPathFor = (sequence: SequenceRow): string =>
  sequence.mode === "cold" ? "cold_domain" : "crm_zoho";

export function decide(args: {
  enrollment: EnrollmentRow;
  sequence: SequenceRow | null;
  prospect: ProspectRow | null;
  suppressed: boolean;
  domain: DomainRow | null;
  warmSentToday: number;
  now: Date;
  config: SchedulerConfig;
}): Decision {
  const { enrollment, sequence, prospect, suppressed, domain, warmSentToday, now, config } = args;

  if (enrollment.status !== "active") return { action: "skip", reason: `enrollment_${enrollment.status}` };
  if (!sequence) return { action: "stop", status: "paused", reason: "sequence_missing" };
  if (!prospect) return { action: "stop", status: "paused", reason: "prospect_missing" };

  // INVARIANT: no send without approval. Content edits reset sequences to
  // 'draft' (DB trigger), so an edited-but-unreapproved sequence lands here.
  if (sequence.status === "archived") return { action: "stop", status: "paused", reason: "sequence_archived" };
  if (!SENDABLE_SEQUENCE_STATUSES.has(sequence.status)) {
    return { action: "hold", reason: `sequence_${sequence.status}` };
  }

  const steps = Array.isArray(sequence.steps) ? sequence.steps : [];
  if (enrollment.current_step >= steps.length) return { action: "complete" };
  const step = steps[enrollment.current_step];

  const email = String(prospect.email ?? "").trim().toLowerCase();
  if (!email) return { action: "stop", status: "paused", reason: "missing_email" };

  // INVARIANT: suppression is checked at send time — enroll-time checks are a
  // courtesy, this is the law (D9).
  if (suppressed) return { action: "stop", status: "suppressed", reason: "suppression_list" };

  // INVARIANT: cold never sends without a verified dedicated domain (E1.3).
  if (sequence.mode === "cold") {
    if (!domain || domain.status !== "verified") {
      return { action: "hold", reason: "cold_domain_unverified" };
    }
    // Warmup/daily cap (E2.3/E6.2): overflow rolls forward, never bursts over.
    const today = now.toISOString().slice(0, 10);
    const sentToday = domain.sent_today_date === today ? domain.sent_today : 0;
    if (sentToday >= domain.daily_cap) {
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      return { action: "defer", until: deferToWindow(tomorrow, sequence.send_window), reason: "domain_cap" };
    }
  } else if (warmSentToday >= config.warmDailyCap) {
    const inAnHour = new Date(now.getTime() + 60 * 60 * 1000);
    return { action: "defer", until: deferToWindow(inAnHour, sequence.send_window), reason: "warm_cap" };
  }

  // INVARIANT: business-hours window — a due send outside it defers to the next
  // opening (E2.1: never 3am, never weekends by default).
  if (!isWithinWindow(now, sequence.send_window)) {
    return { action: "defer", until: deferToWindow(now, sequence.send_window), reason: "outside_window" };
  }

  // INVARIANT: every token must resolve from prospect fields, or the send blocks.
  const subject = resolveTokens(step?.subject ?? "", prospect);
  const body = resolveTokens(step?.body ?? "", prospect);
  const missing = [...subject.missing, ...body.missing];
  if (missing.length) {
    return { action: "stop", status: "paused", reason: `unresolved_tokens:${missing.join(",")}` };
  }
  if (!body.text.trim()) return { action: "stop", status: "paused", reason: "empty_step_body" };

  return {
    action: "send",
    stepIdx: enrollment.current_step,
    subject: subject.text,
    body: body.text,
    sendPath: sendPathFor(sequence),
  };
}

/** Next step's due time after a successful send (recomputed from sentAt — E2.4). */
export const computeNextSendAt = (
  sequence: SequenceRow,
  fromStepIdx: number,
  sentAt: Date,
): Date | null => {
  const steps = Array.isArray(sequence.steps) ? sequence.steps : [];
  const current = steps[fromStepIdx];
  const next = steps[fromStepIdx + 1];
  if (!next) return null;
  const gapDays = Math.max(
    1,
    Number(next.dayOffset ?? 0) - Number(current?.dayOffset ?? 0) || 2,
  );
  const due = new Date(sentAt.getTime() + gapDays * 24 * 60 * 60 * 1000);
  return deferToWindow(due, sequence.send_window);
};

// ─── Claim retry policy (idempotency without double-sends) ────────────────────

/**
 * May an existing message row (from a prior claim) be retried? Auth failures
 * retry forever (E1.1: token expiry HOLDS, never drops); transient failures
 * retry up to maxAttempts; a 'sent' row never retries (that step is done);
 * a fresh 'queued' row belongs to a live run — leave it alone.
 */
export const canRetryClaim = (
  existing: MessageRow,
  now: Date,
  config: SchedulerConfig,
): { retry: boolean; exhausted: boolean } => {
  if (existing.status === "sent" || existing.status === "bounced") return { retry: false, exhausted: false };
  const ageMs = now.getTime() - new Date(existing.updated_at).getTime();
  const stale = ageMs >= config.retryAfterMinutes * 60 * 1000;
  if (!stale) return { retry: false, exhausted: false };
  const isAuth = existing.error.startsWith("auth:");
  if (isAuth) return { retry: true, exhausted: false };
  if (existing.attempt >= config.maxAttempts) return { retry: false, exhausted: true };
  return { retry: true, exhausted: false };
};

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  /** Credential problem — hold and prompt reconnect, retry without attempt cap. */
  authError?: boolean;
  /** Unrecoverable for this recipient (e.g. invalid address) — no retry. */
  permanent?: boolean;
}

export interface SendAdapter {
  send(args: {
    workspaceId: string;
    prospect: ProspectRow;
    subject: string;
    body: string;
  }): Promise<SendResult>;
}

export interface SchedulerDb {
  dueEnrollments(nowIso: string, limit: number): Promise<Bundle[]>;
  isSuppressed(workspaceId: string, email: string): Promise<boolean>;
  warmSentToday(workspaceId: string): Promise<number>;
  getDomain(id: string): Promise<DomainRow | null>;
  /** Insert the claim row (status 'queued'); on conflict return the existing row. */
  claimStep(args: {
    enrollment: EnrollmentRow;
    sequenceId: string;
    stepIdx: number;
    sendPath: string;
    subject: string;
    sendingDomainId: string | null;
  }): Promise<{ inserted: boolean; messageId?: string; existing?: MessageRow }>;
  /** Re-arm an existing claim row for retry (status→queued, attempt+1). */
  rearmClaim(messageId: string, attempt: number): Promise<void>;
  finalizeMessage(messageId: string, patch: Record<string, unknown>): Promise<void>;
  updateEnrollment(id: string, patch: Record<string, unknown>): Promise<void>;
}

export interface RunSummary {
  processed: number;
  sent: number;
  deferred: number;
  held: number;
  stopped: number;
  completed: number;
  failed: number;
  errors: string[];
}

export async function runScheduler(deps: {
  db: SchedulerDb;
  adapters: Record<string, SendAdapter>;
  now?: Date;
  config?: Partial<SchedulerConfig>;
}): Promise<RunSummary> {
  const config: SchedulerConfig = { ...DEFAULT_CONFIG, ...(deps.config ?? {}) };
  const now = deps.now ?? new Date();
  const { db, adapters } = deps;
  const summary: RunSummary = {
    processed: 0, sent: 0, deferred: 0, held: 0, stopped: 0, completed: 0, failed: 0, errors: [],
  };

  const bundles = await db.dueEnrollments(now.toISOString(), config.batchLimit);
  // Per-run caches so caps hold across the batch, not just per enrollment.
  const warmCounts = new Map<string, number>();
  const domainCache = new Map<string, DomainRow | null>();

  for (const bundle of bundles) {
    summary.processed += 1;
    const { enrollment, sequence, prospect } = bundle;
    try {
      const workspaceId = enrollment.workspace_id;
      const email = String(prospect?.email ?? "").trim().toLowerCase();
      const suppressed = email ? await db.isSuppressed(workspaceId, email) : false;

      if (!warmCounts.has(workspaceId)) warmCounts.set(workspaceId, await db.warmSentToday(workspaceId));
      let domain: DomainRow | null = null;
      if (sequence?.sending_domain_id) {
        if (!domainCache.has(sequence.sending_domain_id)) {
          domainCache.set(sequence.sending_domain_id, await db.getDomain(sequence.sending_domain_id));
        }
        domain = domainCache.get(sequence.sending_domain_id) ?? null;
      }

      const decision = decide({
        enrollment, sequence, prospect, suppressed, domain,
        warmSentToday: warmCounts.get(workspaceId) ?? 0,
        now, config,
      });

      if (decision.action === "skip") continue;
      if (decision.action === "complete") {
        await db.updateEnrollment(enrollment.id, { status: "completed", next_send_at: null });
        summary.completed += 1;
        continue;
      }
      if (decision.action === "stop") {
        await db.updateEnrollment(enrollment.id, {
          status: decision.status, stop_reason: decision.reason, next_send_at: null,
        });
        summary.stopped += 1;
        continue;
      }
      if (decision.action === "defer") {
        await db.updateEnrollment(enrollment.id, { next_send_at: decision.until.toISOString() });
        summary.deferred += 1;
        continue;
      }
      if (decision.action === "hold") {
        await db.updateEnrollment(enrollment.id, {
          next_send_at: new Date(now.getTime() + config.holdMinutes * 60 * 1000).toISOString(),
        });
        summary.held += 1;
        continue;
      }

      // decision.action === 'send' — the ONLY path that reaches an adapter.
      const adapter = adapters[decision.sendPath];
      if (!adapter) {
        await db.updateEnrollment(enrollment.id, {
          next_send_at: new Date(now.getTime() + config.holdMinutes * 60 * 1000).toISOString(),
        });
        summary.held += 1;
        continue;
      }
      if (!sequence || !prospect) continue; // decide() guarantees these; belt-and-braces

      // Claim BEFORE send: the unique (enrollment_id, step_idx) row is both the
      // audit log and the double-send lock.
      const claim = await db.claimStep({
        enrollment,
        sequenceId: sequence.id,
        stepIdx: decision.stepIdx,
        sendPath: decision.sendPath,
        subject: decision.subject,
        sendingDomainId: sequence.sending_domain_id,
      });

      let messageId = claim.messageId;
      let attempt = 1;
      if (!claim.inserted) {
        const existing = claim.existing;
        if (!existing) continue;
        if (existing.status === "sent") {
          // Step already delivered by a prior run that died before advancing —
          // advance the enrollment now, without re-sending.
          const nextAt = computeNextSendAt(sequence, decision.stepIdx, now);
          await db.updateEnrollment(enrollment.id, nextAt
            ? { current_step: decision.stepIdx + 1, next_send_at: nextAt.toISOString() }
            : { current_step: decision.stepIdx + 1, status: "completed", next_send_at: null });
          continue;
        }
        const { retry, exhausted } = canRetryClaim(existing, now, config);
        if (exhausted) {
          await db.updateEnrollment(enrollment.id, {
            status: "paused", stop_reason: "send_failed", next_send_at: null,
          });
          summary.stopped += 1;
          continue;
        }
        if (!retry) continue; // fresh claim owned by another run
        attempt = existing.attempt + 1;
        await db.rearmClaim(existing.id, attempt);
        messageId = existing.id;
      }
      if (!messageId) continue;

      const result = await adapter.send({
        workspaceId, prospect, subject: decision.subject, body: decision.body,
      });

      if (result.ok) {
        const sentAtIso = now.toISOString();
        await db.finalizeMessage(messageId, {
          status: "sent",
          provider_message_id: result.providerMessageId ?? "",
          sent_at: sentAtIso,
          error: "",
          attempt,
        });
        const nextAt = computeNextSendAt(sequence, decision.stepIdx, now);
        await db.updateEnrollment(enrollment.id, nextAt
          ? { current_step: decision.stepIdx + 1, next_send_at: nextAt.toISOString() }
          : { current_step: decision.stepIdx + 1, status: "completed", next_send_at: null });
        warmCounts.set(workspaceId, (warmCounts.get(workspaceId) ?? 0) + 1);
        summary.sent += 1;
        continue;
      }

      // Failure paths — never a silent drop (E1.4): the row records the reason.
      const errText = String(result.error ?? "send failed").slice(0, 500);
      if (result.authError) {
        // E1.1: hold, never drop. Auth-prefixed errors retry without an attempt cap.
        await db.finalizeMessage(messageId, { status: "failed", error: `auth:${errText}`, attempt });
        await db.updateEnrollment(enrollment.id, {
          next_send_at: new Date(now.getTime() + config.holdMinutes * 60 * 1000).toISOString(),
        });
        summary.held += 1;
      } else if (result.permanent || attempt >= config.maxAttempts) {
        await db.finalizeMessage(messageId, { status: "failed", error: errText, attempt });
        await db.updateEnrollment(enrollment.id, {
          status: "paused", stop_reason: "send_failed", next_send_at: null,
        });
        summary.failed += 1;
      } else {
        // Transient: bounded retry with backoff (E1.5).
        await db.finalizeMessage(messageId, { status: "failed", error: errText, attempt });
        const backoffMs = config.retryAfterMinutes * 60 * 1000 * attempt;
        await db.updateEnrollment(enrollment.id, {
          next_send_at: new Date(now.getTime() + backoffMs).toISOString(),
        });
        summary.failed += 1;
      }
    } catch (e) {
      summary.errors.push(`${enrollment.id}: ${(e as Error).message}`);
    }
  }

  return summary;
}
