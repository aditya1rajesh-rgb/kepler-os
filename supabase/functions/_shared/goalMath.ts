// Goal feasibility math for the scheduled runner (E10).
//
// ⚠️ MIRROR of the core of `src/lib/goalFeasibility.js` — `deriveRunRate` and
// `projectGoal` only, which is all the cron needs to decide whether a goal's
// STANDING changed. The proposal/range machinery stays in the browser copy,
// where the goal-setting form uses it.
//
// Same duplication rule as `_shared/detectors.ts` and `_shared/googleData.ts`:
// the scheduled function stays self-contained. The JS copy is the one with the
// tests (`tests/goal-feasibility.test.js`); change it first.
//
// The fact both copies are built on: campaign_metrics rows are trailing LEVELS
// (GA4 reports last-28-days), never per-day increments. A run rate is therefore
// a level divided by its own window, and everything downstream is an ESTIMATE.

const DAY_MS = 86400000;

const TRAILING_DAYS = 28;

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY_MS);

export interface Snapshot { capturedAt: string; metrics: Record<string, unknown> }

export interface RunRate {
  perDay: number | null;
  level: number | null;
  confidence: "none" | "low" | "medium" | "high";
}

/** One snapshot is a level with no trend behind it — that is 'low', always. */
const gradeConfidence = (count: number, spanDays: number): RunRate["confidence"] => {
  if (count === 0) return "none";
  if (count === 1) return "low";
  if (count >= 4 && spanDays >= 14) return "high";
  return "medium";
};

/** Share of voice is a percentage: it does not accumulate, so it has no per-day rate. */
const isFlowMeasure = (measureId: string) => measureId !== "shareOfVoice";

export const deriveRunRate = (snapshots: Snapshot[], measureId: string): RunRate => {
  const usable = (snapshots ?? [])
    .map((s) => ({ at: new Date(s?.capturedAt), value: num(s?.metrics?.[measureId]) }))
    .filter((s) => !Number.isNaN(s.at.getTime()) && s.value !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  if (!usable.length) return { perDay: null, level: null, confidence: "none" };

  const latest = usable[usable.length - 1];
  const spanDays = Math.max(0, daysBetween(usable[0].at, latest.at));

  return {
    perDay: isFlowMeasure(measureId) ? (latest.value as number) / TRAILING_DAYS : null,
    level: latest.value,
    confidence: gradeConfidence(usable.length, spanDays),
  };
};

const verdictFor = (forecast: number | null, target: number | null): string => {
  if (forecast === null || target === null || !target) return "unknown";
  const ratio = forecast / target;
  if (ratio >= 1) return "on-track";
  if (ratio >= 0.85) return "at-risk";
  return "off-pace";
};

/**
 * Where a goal stands. Numbers are null — never 0 — when they cannot be known:
 * a zero forecast is a claim about the business, "we cannot say" is the truth.
 *
 * Progress is measured from the BASELINE, not from zero, or a goal set
 * mid-quarter opens at 60% without anyone doing anything.
 */
export const projectGoal = (
  { runRate, baseline = 0, target, startDate, endDate, now = new Date() }: {
    runRate: RunRate;
    baseline?: number;
    target: number | null;
    startDate: string | null;
    endDate: string | null;
    now?: Date;
  },
): { forecast: number | null; verdict: string } => {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  const tgt = num(target);
  const base = num(baseline) ?? 0;

  if (!runRate || runRate.confidence === "none" || tgt === null) return { forecast: null, verdict: "unknown" };

  // A level, not a flow: the forecast is the current level held flat.
  if (runRate.perDay === null) {
    return { forecast: runRate.level, verdict: verdictFor(runRate.level, tgt) };
  }

  const totalDays = start && end ? Math.max(1, daysBetween(start, end)) : null;
  const forecast = totalDays === null ? null : runRate.perDay * totalDays;
  return { forecast, verdict: verdictFor(forecast, Math.max(0, tgt - base)) };
};
