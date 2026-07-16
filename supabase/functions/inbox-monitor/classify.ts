// inbox-monitor CORE — pure classification + transition logic (E3.1/E3.3).
//
// Deterministic header/pattern rules first (the handoff's order); ai-proxy
// assist for ambiguous cases and meeting-intent classification arrive in R2.
// No Deno imports — unit-tested by vitest alongside the scheduler core.

export type EmailKind = "reply" | "ooo" | "bounce" | "outbound" | "ignore";

const BOUNCE_FROM = /mailer-daemon|postmaster|mail delivery (?:subsystem|system)/i;
const BOUNCE_SUBJECT =
  /undeliver|delivery (?:status notification|failure|has failed|incomplete)|returned mail|failure notice|message not delivered|address not found/i;
const OOO_SUBJECT =
  /out of (?:the )?office|auto[- ]?reply|automatic reply|autoreply|away from|on (?:annual |parental )?leave|vacation|abwesenheit|absence/i;

/**
 * Classify one email from a prospect's CRM thread.
 * `operatorEmail` is the connected Zoho user (our sends); anything neither from
 * the prospect nor a bounce daemon is ignored (colleagues CC'd, etc.).
 */
export const classifyEmail = (args: {
  fromEmail: string;
  subject: string;
  prospectEmail: string;
  operatorEmail: string;
}): EmailKind => {
  const from = String(args.fromEmail ?? "").trim().toLowerCase();
  const subject = String(args.subject ?? "");
  const prospect = String(args.prospectEmail ?? "").trim().toLowerCase();
  const operator = String(args.operatorEmail ?? "").trim().toLowerCase();

  if (BOUNCE_FROM.test(from) || BOUNCE_SUBJECT.test(subject)) return "bounce";
  if (operator && from === operator) return "outbound";
  if (prospect && from === prospect) {
    return OOO_SUBJECT.test(subject) ? "ooo" : "reply";
  }
  return "ignore";
};

export interface EnrollmentLike {
  id: string;
  status: string;
  next_send_at: string | null;
}

export interface Transition {
  enrollmentPatch: Record<string, unknown> | null;
  suppress: boolean; // add the prospect's address to suppression_list (hard_bounce)
}

/**
 * The state transition an inbound email triggers on the prospect's enrollment.
 *  - reply  → remaining touches cancel instantly (E2.2), flag for attention
 *  - ooo    → NOT a reply: next touch reschedules +7d (E3.3 default)
 *  - bounce → stop + auto-suppress (E1.5)
 */
export const transitionFor = (
  kind: EmailKind,
  enrollment: EnrollmentLike | null,
  now: Date,
): Transition => {
  if (!enrollment) return { enrollmentPatch: null, suppress: kind === "bounce" };
  const active = enrollment.status === "active";
  if (kind === "reply") {
    return {
      enrollmentPatch: active
        ? { status: "stopped_reply", stop_reason: "replied", next_send_at: null }
        : null,
      suppress: false,
    };
  }
  if (kind === "bounce") {
    return {
      enrollmentPatch: active
        ? { status: "stopped_bounce", stop_reason: "hard_bounce", next_send_at: null }
        : null,
      suppress: true,
    };
  }
  if (kind === "ooo" && active) {
    const plus7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const current = enrollment.next_send_at ? new Date(enrollment.next_send_at) : now;
    const next = current > plus7 ? current : plus7;
    return { enrollmentPatch: { next_send_at: next.toISOString() }, suppress: false };
  }
  return { enrollmentPatch: null, suppress: false };
};
