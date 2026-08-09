// Detector rules for the scheduled runner (E7).
//
// ⚠️ MIRROR OF `src/lib/detectors.js`. The browser runs the JS copy (the manual
// "Check for changes" path); pg_cron runs this one. They are duplicated rather
// than shared for the same reason `_shared/googleData.ts` duplicates oauth-proxy
// and `_shared/attribution.ts` duplicates `src/lib/tracking.js`: the scheduled
// function stays self-contained, and a refactor of the browser build cannot
// break the cron. THE RULES AND THE FLOORS MUST STAY IN SYNC — the JS copy is the
// one with the test suite; change it first, then bring this across.

export interface ChangeEvent {
  kind: "metric" | "search" | "visibility" | "outreach" | "goal";
  subject: string;
  direction: "up" | "down";
  magnitude: number;
  pct: number | null;
  unit: string;
  from: number | null;
  to: number | null;
  observedAt: string;
  comparedTo: string | null;
  campaignId: string | null;
  evidence: Record<string, unknown>;
  dedupeKey: string;
}

export const FLOORS = {
  metric: { abs: 20, pct: 0.05 },
  search: { positions: 1.5, impressions: 50 },
  outreach: { abs: 3, pct: 0.15 },
};

export const MAX_PER_KIND = 5;

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// A percentage against a zero base is unknown, not +100%.
const pctChange = (from: number, to: number): number | null =>
  from === 0 ? null : Math.round(((to - from) / Math.abs(from)) * 1000) / 10;

const clean = (v: unknown, max = 200) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const mkEvent = (
  e: Omit<ChangeEvent, "dedupeKey" | "magnitude"> & { magnitude: number; identity?: string },
): ChangeEvent => {
  const { identity, ...rest } = e;
  return {
    ...rest,
    magnitude: Math.abs(Math.round(e.magnitude * 100) / 100),
    // The campaign is part of the identity — workspace-wide "Sessions" and a
    // campaign's "Sessions" otherwise share a key and the unique index keeps one.
    // So is the surface for visibility: one prompt on two engines is two facts.
    dedupeKey: `${e.kind}|${e.campaignId ?? "workspace"}|${clean(identity ?? e.subject, 140)}|${e.observedAt}|${e.comparedTo ?? ""}`,
  };
};

export interface Reading { at: string; value: number }

/** Movement between the last two readings. One reading is a level, not a move. */
export const detectMetricMoves = (
  readings: Reading[],
  { measure, label, unit, campaignId = null }: { measure: string; label: string; unit: string; campaignId?: string | null },
): ChangeEvent[] => {
  const usable = (readings ?? []).filter((r) => r?.at && num(r.value) !== null);
  if (usable.length < 2) return [];

  const latest = usable[usable.length - 1];
  const prior = usable[usable.length - 2];
  const delta = latest.value - prior.value;
  const pct = pctChange(prior.value, latest.value);

  if (Math.abs(delta) < FLOORS.metric.abs) return [];
  if (pct !== null && Math.abs(pct) < FLOORS.metric.pct * 100) return [];

  return [mkEvent({
    kind: "metric",
    subject: label,
    direction: delta > 0 ? "up" : "down",
    magnitude: delta,
    pct,
    unit,
    from: prior.value,
    to: latest.value,
    observedAt: latest.at,
    comparedTo: prior.at,
    campaignId,
    evidence: { measure, basis: "trailing-level" },
  })];
};

export interface GscRow { query: string; position: number; impressions: number; clicks: number }

/**
 * The two window ends a search comparison is between. Stamping "now" breaks
 * dedupe — the cron and a manual check would write the same move under two keys.
 * The 3-day offset is Search Console's own reporting lag.
 */
export const searchWindows = ({ now = new Date(), days = 28, lagDays = 3 }: { now?: Date; days?: number; lagDays?: number } = {}) => {
  const endOfDay = (d: Date) => `${d.toISOString().slice(0, 10)}T00:00:00.000Z`;
  const currentEnd = new Date(now.getTime() - lagDays * 86400000);
  return {
    observedAt: endOfDay(currentEnd),
    comparedTo: endOfDay(new Date(currentEnd.getTime() - days * 86400000)),
  };
};

/**
 * Query-level position movement.
 *
 * In Search Console a LOWER position number is better, so a gain is
 * `was - now`. Getting this backwards produces a detector that reports every
 * improvement as a decline, and the sentence reads perfectly either way.
 */
export const detectSearchMoves = (
  current: GscRow[],
  prior: GscRow[],
  { observedAt, comparedTo, limit = MAX_PER_KIND }: { observedAt: string; comparedTo: string; limit?: number },
): ChangeEvent[] => {
  const priorByQuery = new Map<string, GscRow>();
  for (const r of prior ?? []) {
    const q = clean(r?.query, 120).toLowerCase();
    if (q) priorByQuery.set(q, r);
  }

  const out: ChangeEvent[] = [];
  for (const r of current ?? []) {
    const q = clean(r?.query, 120);
    if (!q) continue;
    const was = priorByQuery.get(q.toLowerCase());
    if (!was) continue; // no prior reading — not a change

    const nowPos = num(r.position);
    const wasPos = num(was.position);
    if (nowPos === null || wasPos === null) continue;
    if ((num(r.impressions) ?? 0) < FLOORS.search.impressions) continue;

    const move = wasPos - nowPos;
    if (Math.abs(move) < FLOORS.search.positions) continue;

    out.push(mkEvent({
      kind: "search",
      subject: q,
      direction: move > 0 ? "up" : "down",
      magnitude: move,
      pct: null,
      unit: "positions",
      from: wasPos,
      to: nowPos,
      observedAt,
      comparedTo,
      campaignId: null,
      evidence: {
        impressions: num(r.impressions),
        clicks: num(r.clicks),
        enteredPageOne: wasPos > 10 && nowPos <= 10,
        leftPageOne: wasPos <= 10 && nowPos > 10,
      },
    }));
  }

  return out
    .sort((a, b) =>
      (Number(b.evidence.impressions) || 0) * b.magnitude - (Number(a.evidence.impressions) || 0) * a.magnitude)
    .slice(0, limit);
};

export interface ScanRow {
  prompt: string;
  surface: string;
  status: string;
  brand_mentioned: boolean;
  brand_cited: boolean;
  competitor_mentions?: Array<{ name?: string; mentioned?: boolean }>;
  captured_at?: string;
}

/** Prompts where the brand gained or lost a mention/citation. Losses first. */
export const detectVisibilityMoves = (
  current: ScanRow[],
  prior: ScanRow[],
  { observedAt, comparedTo, limit = MAX_PER_KIND }: { observedAt: string; comparedTo: string; limit?: number },
): ChangeEvent[] => {
  const key = (r: ScanRow) => `${clean(r?.prompt, 160).toLowerCase()}|${clean(r?.surface, 40)}`;
  const priorByKey = new Map<string, ScanRow>();
  for (const r of prior ?? []) {
    if (r?.status && r.status !== "ok") continue;
    priorByKey.set(key(r), r);
  }

  const out: ChangeEvent[] = [];
  for (const r of current ?? []) {
    if (r?.status && r.status !== "ok") continue;
    const was = priorByKey.get(key(r));
    if (!was) continue;

    let change: { direction: "up" | "down"; what: string } | null = null;
    if (r.brand_cited && !was.brand_cited) change = { direction: "up", what: "cited" };
    else if (!r.brand_cited && was.brand_cited) change = { direction: "down", what: "cited" };
    else if (r.brand_mentioned && !was.brand_mentioned) change = { direction: "up", what: "mentioned" };
    else if (!r.brand_mentioned && was.brand_mentioned) change = { direction: "down", what: "mentioned" };
    if (!change) continue;

    out.push(mkEvent({
      kind: "visibility",
      subject: clean(r.prompt, 160),
      identity: `${clean(r.prompt, 120)}@${clean(r.surface, 40)}`,
      direction: change.direction,
      magnitude: 1,
      pct: null,
      unit: change.what,
      from: null,
      to: null,
      observedAt,
      comparedTo,
      campaignId: null,
      evidence: {
        surface: clean(r.surface, 40),
        what: change.what,
        competitors: (r.competitor_mentions ?? [])
          .filter((c) => c?.mentioned)
          .map((c) => clean(c?.name, 60))
          .slice(0, 4),
      },
    }));
  }

  return out
    .sort((a, b) => (a.direction === b.direction ? 0 : a.direction === "down" ? -1 : 1))
    .slice(0, limit);
};

/** Replies and meetings. Same two-reading rule, same twin floors. */
export const detectOutreachMoves = (readings: Reading[], { metric }: { metric: "replied" | "meetings" }): ChangeEvent[] => {
  const usable = (readings ?? []).filter((r) => r?.at && num(r.value) !== null);
  if (usable.length < 2) return [];

  const latest = usable[usable.length - 1];
  const prior = usable[usable.length - 2];
  const delta = latest.value - prior.value;
  const pct = pctChange(prior.value, latest.value);

  if (Math.abs(delta) < FLOORS.outreach.abs) return [];
  if (pct !== null && Math.abs(pct) < FLOORS.outreach.pct * 100) return [];

  return [mkEvent({
    kind: "outreach",
    subject: metric === "meetings" ? "Meetings" : "Replies",
    direction: delta > 0 ? "up" : "down",
    magnitude: delta,
    pct,
    unit: metric,
    from: prior.value,
    to: latest.value,
    observedAt: latest.at,
    comparedTo: prior.at,
    campaignId: null,
    evidence: { metric },
  })];
};

// ── Goal drift (E10) ─────────────────────────────────────────────────────────

const VERDICT_RANK: Record<string, number> = { "on-track": 0, "at-risk": 1, "off-pace": 2 };
const VERDICT_LABEL: Record<string, string> = { "on-track": "on track", "at-risk": "at risk", "off-pace": "behind" };

export interface GoalStanding {
  goalId: string;
  name: string;
  verdict: string;
  forecast: number | null;
  target: number | null;
  observedAt: string;
}

/**
 * A goal's standing changing — what makes the recommendation continuous rather
 * than something you find by visiting.
 *
 * Movement into or out of 'unknown' is not drift: that is data arriving or
 * drying up, and reporting it would blame the user for a missing snapshot. No
 * previous standing means no change — a first observation is a baseline.
 */
export const detectGoalDrift = (current: GoalStanding, previousVerdict: string | null): ChangeEvent[] => {
  if (!current?.goalId || !current.verdict) return [];
  if (current.verdict === "unknown" || previousVerdict === "unknown") return [];
  if (!previousVerdict || previousVerdict === current.verdict) return [];

  const from = VERDICT_RANK[previousVerdict];
  const to = VERDICT_RANK[current.verdict];
  if (from === undefined || to === undefined) return [];

  return [mkEvent({
    kind: "goal",
    subject: clean(current.name, 160),
    identity: `${clean(current.name, 100)}@${previousVerdict}->${current.verdict}`,
    direction: to < from ? "up" : "down",
    magnitude: Math.abs(to - from),
    pct: null,
    unit: "standing",
    from: null,
    to: null,
    observedAt: current.observedAt,
    comparedTo: null,
    campaignId: null,
    evidence: {
      goalId: current.goalId,
      from: previousVerdict,
      to: current.verdict,
      fromLabel: VERDICT_LABEL[previousVerdict],
      toLabel: VERDICT_LABEL[current.verdict],
      forecast: current.forecast,
      target: current.target,
    },
  })];
};

/** The row shape `change_events` expects. */
export const toRow = (workspaceId: string, e: ChangeEvent, detectedBy = "scheduler") => ({
  workspace_id: workspaceId,
  kind: e.kind,
  subject: e.subject,
  direction: e.direction,
  magnitude: e.magnitude,
  unit: e.unit,
  pct: e.pct,
  value_from: e.from,
  value_to: e.to,
  observed_at: e.observedAt,
  compared_to: e.comparedTo,
  campaign_id: e.campaignId,
  evidence: e.evidence,
  detected_by: detectedBy,
  dedupe_key: e.dedupeKey,
});
