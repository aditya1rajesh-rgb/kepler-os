// metrics-snapshot — scheduled writer of campaign_metrics history.
//
// Today snapshots only accrue when a user clicks "Refresh"/"Pull latest". This
// function (pg_cron → pg_net, migration 028) writes a daily snapshot per connected
// workspace so period-over-period trends and the lead/conversion chart fill in on
// their own. Providers covered here: GA4 (conversions/sessions), GSC (search CTR —
// the KPI's only automatic source), and Outreach (sent/replied/meetings from the
// view). Zoho leads/revenue stay on the manual Refresh path (its attribution is
// heavier and already covered there).
//
// Auth is the shared SCHEDULER_SECRET header (verify_jwt=false in config.toml) — the
// same pattern as send-scheduler. Per-workspace try/catch so one tenant's failure
// never halts the run; a per-day idempotency guard makes re-runs safe.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { googleAccessToken, ga4CampaignReport, gscTotals } from "../_shared/googleData.ts";
import { matchCampaign } from "../_shared/attribution.ts";

const json = (payload: unknown, status: number) =>
  new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

const secretMatches = (given: string, expected: string): boolean => {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
};

const startOfTodayIso = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
};

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
  const schedulerSecret = Deno.env.get("SCHEDULER_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !schedulerSecret) {
    return json({ ok: false, error: "metrics-snapshot is not configured" }, 500);
  }

  const given = req.headers.get("x-scheduler-secret") ?? "";
  if (!secretMatches(given, schedulerSecret)) return json({ ok: false, error: "Unauthorized" }, 401);

  const svc = createClient(supabaseUrl, serviceRoleKey);
  const todayStart = startOfTodayIso();

  // A provider is already snapshotted today?
  const snapshotExists = async (workspaceId: string, provider: string) => {
    const { data } = await svc
      .from("campaign_metrics")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("provider", provider)
      .gte("captured_at", todayStart)
      .limit(1);
    return Boolean(data?.length);
  };

  // Workspaces with a connected GA4 or GSC integration (Outreach runs for all —
  // the view returns rows only where sequences exist).
  const { data: integrations } = await svc
    .from("workspace_integrations")
    .select("workspace_id, provider, refresh_token, property_url, status")
    .in("provider", ["ga4", "gsc"])
    .eq("status", "connected");

  const byWorkspace = new Map<string, { ga4?: any; gsc?: any }>();
  for (const row of integrations ?? []) {
    const entry = byWorkspace.get(row.workspace_id) ?? {};
    entry[row.provider as "ga4" | "gsc"] = row;
    byWorkspace.set(row.workspace_id, entry);
  }

  // Also include workspaces that have outreach sequences but no GA4/GSC.
  const { data: outreachWs } = await svc.from("v_outreach_sequence_metrics").select("workspace_id");
  for (const row of outreachWs ?? []) {
    if (!byWorkspace.has(row.workspace_id)) byWorkspace.set(row.workspace_id, {});
  }

  const errors: Array<{ workspaceId: string; provider: string; error: string }> = [];
  let snapshots = 0;

  for (const [workspaceId, conns] of byWorkspace.entries()) {
    try {
      const { data: campaigns } = await svc
        .from("campaigns")
        .select("id, title, goal")
        .eq("workspace_id", workspaceId);
      const camps = campaigns ?? [];

      // ── GA4 ──────────────────────────────────────────────────────────────
      if (conns.ga4?.refresh_token && conns.ga4?.property_url && !(await snapshotExists(workspaceId, "ga4"))) {
        try {
          const token = await googleAccessToken(conns.ga4.refresh_token);
          const { rows } = await ga4CampaignReport(token, conns.ga4.property_url);
          const agg: Record<string, { campaignId: string | null; sessions: number; users: number; conversions: number }> = {};
          for (const r of rows) {
            const c = matchCampaign(r.campaign, camps);
            const key = c ? c.id : "__none__";
            const a = agg[key] || (agg[key] = { campaignId: c ? c.id : null, sessions: 0, users: 0, conversions: 0 });
            a.sessions += r.sessions || 0;
            a.users += r.users || 0;
            a.conversions += r.conversions || 0;
          }
          const inserts = Object.values(agg).map((a) => ({
            workspace_id: workspaceId, campaign_id: a.campaignId, provider: "ga4",
            metrics: { sessions: a.sessions, users: a.users, conversions: a.conversions },
          }));
          if (inserts.length) { await svc.from("campaign_metrics").insert(inserts); snapshots += inserts.length; }
        } catch (e) { errors.push({ workspaceId, provider: "ga4", error: String((e as Error).message) }); }
      }

      // ── GSC (search CTR — the KPI's only automatic writer) ───────────────
      if (conns.gsc?.refresh_token && conns.gsc?.property_url && !(await snapshotExists(workspaceId, "gsc"))) {
        try {
          const token = await googleAccessToken(conns.gsc.refresh_token);
          const totals = await gscTotals(token, conns.gsc.property_url);
          await svc.from("campaign_metrics").insert({
            workspace_id: workspaceId, campaign_id: null, provider: "gsc", metrics: totals,
          });
          snapshots += 1;
        } catch (e) { errors.push({ workspaceId, provider: "gsc", error: String((e as Error).message) }); }
      }

      // ── Outreach (from the aggregation view) ─────────────────────────────
      if (!(await snapshotExists(workspaceId, "outreach"))) {
        try {
          const { data: seqRows } = await svc
            .from("v_outreach_sequence_metrics")
            .select("campaign_id, enrolled, sent, replied, meetings")
            .eq("workspace_id", workspaceId);
          const agg: Record<string, any> = {};
          for (const r of seqRows ?? []) {
            const key = r.campaign_id ?? "__none__";
            const a = agg[key] || (agg[key] = { campaignId: r.campaign_id ?? null, enrolled: 0, sent: 0, replied: 0, meetings: 0 });
            a.enrolled += r.enrolled || 0; a.sent += r.sent || 0; a.replied += r.replied || 0; a.meetings += r.meetings || 0;
          }
          const inserts = Object.values(agg)
            .filter((a: any) => a.enrolled || a.sent || a.replied || a.meetings)
            .map((a: any) => ({
              workspace_id: workspaceId, campaign_id: a.campaignId, provider: "outreach",
              metrics: { enrolled: a.enrolled, sent: a.sent, replied: a.replied, meetings: a.meetings },
            }));
          if (inserts.length) { await svc.from("campaign_metrics").insert(inserts); snapshots += inserts.length; }
        } catch (e) { errors.push({ workspaceId, provider: "outreach", error: String((e as Error).message) }); }
      }

      // Activity event (best-effort).
      await svc.from("workspace_events").insert({
        workspace_id: workspaceId, kind: "metrics.pulled", title: "Daily metrics snapshot", entity_type: "metrics",
      });
    } catch (e) {
      errors.push({ workspaceId, provider: "workspace", error: String((e as Error).message) });
    }
  }

  return json({ ok: true, workspaces: byWorkspace.size, snapshots, errors }, 200);
});
