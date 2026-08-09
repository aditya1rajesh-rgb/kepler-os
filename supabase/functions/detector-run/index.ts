// detector-run — E7's scheduled detectors.
//
// Kepler's jobs looked at the world and kept nothing: every teardown, scan and
// Search Console pull was rendered once and discarded. This function is the kept
// half. Once a day it compares the newest readings against the previous ones and
// writes what CHANGED into `change_events`, which the cockpit's goal hero reads
// as "what moved".
//
// ORDERING MATTERS. pg_cron runs this at 06:00 UTC, an hour after
// metrics-snapshot (05:00). A detector compares the two most recent readings, so
// running it before the snapshot would compare yesterday's pair every day and
// report "nothing moved" forever. Migration 034 says the same thing.
//
// Auth is the shared SCHEDULER_SECRET header (verify_jwt=false in config.toml),
// the same pattern as send-scheduler and metrics-snapshot. Per-workspace
// try/catch so one tenant's failure never halts the run, and the dedupe index on
// change_events makes the whole thing idempotent: a re-run, or a manual run
// racing the cron, writes nothing new.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { googleAccessToken, gscByQuery } from "../_shared/googleData.ts";
import { deriveRunRate, projectGoal, type Snapshot } from "../_shared/goalMath.ts";
import {
  detectGoalDrift,
  detectMetricMoves,
  detectOutreachMoves,
  detectSearchMoves,
  detectVisibilityMoves,
  searchWindows,
  toRow,
  type ChangeEvent,
  type Reading,
} from "../_shared/detectors.ts";

const json = (payload: unknown, status: number) =>
  new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

const secretMatches = (given: string, expected: string): boolean => {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
};

/** The measures worth watching, and where each is written. */
const WATCHED = [
  { provider: "ga4", metricKey: "sessions", measure: "sessions", label: "Sessions", unit: "sessions" },
  { provider: "ga4", metricKey: "conversions", measure: "conversions", label: "Conversions", unit: "conversions" },
  { provider: "zoho", metricKey: "crmRecords", measure: "crmRecords", label: "CRM records", unit: "records" },
  { provider: "revenue", metricKey: "revenue", measure: "revenue", label: "Revenue", unit: "revenue" },
];

interface MetricRow { campaign_id: string | null; provider: string; metrics: Record<string, unknown>; captured_at: string }

/**
 * Distinct readings for one (provider, metric), bucketed by day and summed
 * across campaigns — or for one campaign when `campaignId` is given.
 *
 * By day rather than by exact instant because the writers insert one row per
 * campaign and each gets its own now(); by reading rather than by calendar
 * period because a period with no pull repeats the last level, and comparing
 * those two reports "flat" when the truth is "nobody looked".
 */
const readingsFor = (
  rows: MetricRow[],
  provider: string,
  metricKey: string,
  campaignId: string | null | undefined,
): Reading[] => {
  const byDay = new Map<string, { at: string; perCampaign: Map<string, { t: number; value: number }> }>();
  for (const r of rows) {
    if (r.provider !== provider) continue;
    if (campaignId !== undefined && (r.campaign_id ?? null) !== campaignId) continue;
    const at = new Date(r.captured_at);
    if (Number.isNaN(at.getTime())) continue;
    const day = at.toISOString().slice(0, 10);
    const bucket = byDay.get(day) ?? { at: at.toISOString(), perCampaign: new Map() };
    if (at.toISOString() > bucket.at) bucket.at = at.toISOString();
    const key = r.campaign_id ?? "__none__";
    const prev = bucket.perCampaign.get(key);
    const t = at.getTime();
    const value = Number(r.metrics?.[metricKey] ?? 0) || 0;
    if (!prev || t > prev.t) bucket.perCampaign.set(key, { t, value });
    byDay.set(day, bucket);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, b]) => ({
      at: b.at,
      value: [...b.perCampaign.values()].reduce((s, e) => s + e.value, 0),
    }));
};

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
  const schedulerSecret = Deno.env.get("SCHEDULER_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !schedulerSecret) {
    return json({ ok: false, error: "detector-run is not configured" }, 500);
  }

  const given = req.headers.get("x-scheduler-secret") ?? "";
  if (!secretMatches(given, schedulerSecret)) return json({ ok: false, error: "Unauthorized" }, 401);

  const svc = createClient(supabaseUrl, serviceRoleKey);
  const since = new Date(Date.now() - 45 * 86400000).toISOString();

  // Every workspace that has metric history — that is the only thing all four
  // detectors need a floor of.
  const { data: wsRows } = await svc
    .from("campaign_metrics")
    .select("workspace_id")
    .gte("captured_at", since);
  const workspaceIds = [...new Set((wsRows ?? []).map((r) => r.workspace_id))];

  const errors: Array<{ workspaceId: string; detector: string; error: string }> = [];
  let written = 0;

  for (const workspaceId of workspaceIds) {
    const events: ChangeEvent[] = [];

    // ── Metric movement, per campaign and workspace-wide ───────────────────
    try {
      const { data: metricRows } = await svc
        .from("campaign_metrics")
        .select("campaign_id, provider, metrics, captured_at")
        .eq("workspace_id", workspaceId)
        .gte("captured_at", since)
        .order("captured_at", { ascending: true });
      const rows = (metricRows ?? []) as MetricRow[];

      for (const w of WATCHED) {
        // Workspace-wide: campaign_id stays NULL, because the movement belongs
        // to the account rather than to one campaign.
        events.push(...detectMetricMoves(readingsFor(rows, w.provider, w.metricKey, undefined), {
          measure: w.measure, label: w.label, unit: w.unit, campaignId: null,
        }));

        // Per campaign: this is what makes change_events.campaign_id a column
        // that is actually written, and what lets the hero attribute movement to
        // the work under a goal.
        const campaignIds = [...new Set(rows.filter((r) => r.provider === w.provider && r.campaign_id).map((r) => r.campaign_id!))];
        for (const campaignId of campaignIds) {
          events.push(...detectMetricMoves(readingsFor(rows, w.provider, w.metricKey, campaignId), {
            measure: w.measure, label: w.label, unit: w.unit, campaignId,
          }));
        }
      }

      for (const metric of ["replied", "meetings"] as const) {
        events.push(...detectOutreachMoves(readingsFor(rows, "outreach", metric, undefined), { metric }));
      }
    } catch (e) {
      errors.push({ workspaceId, detector: "metric", error: String((e as Error).message) });
    }

    // ── Search movement (two GSC windows) ──────────────────────────────────
    try {
      const { data: gsc } = await svc
        .from("workspace_integrations")
        .select("refresh_token, property_url, status")
        .eq("workspace_id", workspaceId)
        .eq("provider", "gsc")
        .eq("status", "connected")
        .maybeSingle();
      if (gsc?.refresh_token && gsc?.property_url) {
        const token = await googleAccessToken(gsc.refresh_token);
        const [current, prior] = await Promise.all([
          gscByQuery(token, gsc.property_url, { days: 28 }),
          gscByQuery(token, gsc.property_url, { days: 28, offsetDays: 28 }),
        ]);
        // Window ends, not "now": the daily cron and a manual check must agree
        // on the key or the same ranking move lands twice.
        events.push(...detectSearchMoves(current, prior, searchWindows()));
      }
    } catch (e) {
      errors.push({ workspaceId, detector: "search", error: String((e as Error).message) });
    }

    // ── AI-visibility movement (last two scan runs) ────────────────────────
    try {
      const { data: scanRows } = await svc
        .from("visibility_scans")
        .select("scan_run_id, prompt, surface, status, brand_mentioned, brand_cited, competitor_mentions, captured_at")
        .eq("workspace_id", workspaceId)
        .order("captured_at", { ascending: false })
        .limit(400);
      const runs: string[] = [];
      for (const r of scanRows ?? []) {
        if (!runs.includes(r.scan_run_id)) runs.push(r.scan_run_id);
        if (runs.length === 2) break;
      }
      if (runs.length === 2) {
        const current = (scanRows ?? []).filter((r) => r.scan_run_id === runs[0]);
        const prior = (scanRows ?? []).filter((r) => r.scan_run_id === runs[1]);
        events.push(...detectVisibilityMoves(current, prior, {
          observedAt: current[0]?.captured_at ?? new Date().toISOString(),
          comparedTo: prior[0]?.captured_at ?? null as unknown as string,
        }));
      }
    } catch (e) {
      errors.push({ workspaceId, detector: "visibility", error: String((e as Error).message) });
    }

    // ── Goal drift (E10) — the standing of a goal changing ─────────────────
    //
    // The previous verdict is RECOMPUTED as of the previous reading rather than
    // stored. Remembering the last verdict would need a baseline written on the
    // first run, and a baseline nobody writes means drift is never detected at
    // all. This needs no state and cannot go stale — and it is the roadmap's
    // actual ask: the feasibility engine run again, not only at creation.
    try {
      const { data: goals } = await svc
        .from("goals")
        .select("id, name, measure, target, baseline, start_date, end_date, kind, status")
        .eq("workspace_id", workspaceId)
        .eq("status", "active")
        .eq("kind", "measured");

      for (const goal of goals ?? []) {
        const { data: goalCampaigns } = await svc
          .from("campaigns").select("id").eq("workspace_id", workspaceId).eq("goal_id", goal.id);
        const ids = (goalCampaigns ?? []).map((c) => c.id);
        if (!ids.length) continue;

        const { data: metricRows } = await svc
          .from("campaign_metrics")
          .select("metrics, captured_at")
          .eq("workspace_id", workspaceId)
          .in("campaign_id", ids)
          .order("captured_at", { ascending: true });

        // Merge providers per capture instant, exactly as goalsService does —
        // one reading carries GA4 and CRM metrics together.
        const byInstant = new Map<string, Snapshot>();
        for (const r of metricRows ?? []) {
          const entry = byInstant.get(r.captured_at) ?? { capturedAt: r.captured_at, metrics: {} };
          for (const [k, v] of Object.entries(r.metrics ?? {})) {
            entry.metrics[k] = (Number(entry.metrics[k]) || 0) + (Number(v) || 0);
          }
          byInstant.set(r.captured_at, entry);
        }
        const snapshots = [...byInstant.values()].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
        if (snapshots.length < 2) continue; // one reading is a baseline, not a change

        const project = (rows: Snapshot[], at: Date) => projectGoal({
          runRate: deriveRunRate(rows, goal.measure),
          baseline: Number(goal.baseline?.value ?? 0),
          target: goal.target,
          startDate: goal.start_date,
          endDate: goal.end_date,
          now: at,
        });

        const before = project(snapshots.slice(0, -1), new Date(snapshots[snapshots.length - 2].capturedAt));
        const current = project(snapshots, new Date());

        events.push(...detectGoalDrift({
          goalId: goal.id,
          name: goal.name,
          verdict: current.verdict,
          forecast: current.forecast,
          target: goal.target,
          observedAt: snapshots[snapshots.length - 1].capturedAt,
        }, before.verdict));
      }
    } catch (e) {
      errors.push({ workspaceId, detector: "goal", error: String((e as Error).message) });
    }

    // ── Write ──────────────────────────────────────────────────────────────
    if (events.length) {
      try {
        // onConflict on the dedupe index: the same comparison detected twice is
        // one event, so re-runs and a manual run racing the cron are both no-ops.
        const { error } = await svc
          .from("change_events")
          .upsert(events.map((e) => toRow(workspaceId, e, "scheduler")), {
            onConflict: "workspace_id,dedupe_key",
            ignoreDuplicates: true,
          });
        if (error) throw error;
        written += events.length;
      } catch (e) {
        errors.push({ workspaceId, detector: "write", error: String((e as Error).message) });
      }
    }
  }

  return json({ ok: true, workspaces: workspaceIds.length, detected: written, errors }, 200);
});
