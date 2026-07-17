// send-scheduler — the single server-side choke point for ALL outreach sends
// (mirrors how ai-proxy is the single AI gateway; the browser never sends email).
//
// Invoked on a schedule (pg_cron → pg_net, migration 023) or manually. Auth is a
// shared secret header (verify_jwt=false in config.toml): pg_net can't mint user
// JWTs, and this function must never be callable by browsers.
//
// All decision logic lives in core.ts (pure, unit-tested). This shell only:
// authenticates the trigger, adapts Postgres + Zoho into the core's interfaces,
// and reports a run summary.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  runScheduler,
  textToHtml,
  type Bundle,
  type DomainRow,
  type MessageRow,
  type ProspectRow,
  type SchedulerDb,
  type SendAdapter,
  type SendResult,
} from "./core.ts";
import { zohoAccessToken, zohoCurrentUser, zohoSendMail, zohoUpsertContact, type ZohoSession } from "../_shared/zoho.ts";

const json = (payload: unknown, status: number) =>
  new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

const loadEnv = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
  const schedulerSecret = Deno.env.get("SCHEDULER_SECRET");
  const missing = [
    ["SUPABASE_URL", supabaseUrl],
    ["SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey],
    ["SCHEDULER_SECRET", schedulerSecret],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`send-scheduler is not configured: missing ${missing.join(", ")}`);
  return { supabaseUrl: supabaseUrl!, serviceRoleKey: serviceRoleKey!, schedulerSecret: schedulerSecret! };
};

// Constant-time-ish comparison (secrets are short; avoid trivial timing leaks).
const secretMatches = (given: string, expected: string): boolean => {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
};

// ─── Zoho send adapter (warm CRM-native path — E1.1) ─────────────────────────

interface ZohoWorkspaceCtx {
  session: ZohoSession;
  fromEmail: string;
  fromName: string;
}

const makeZohoAdapter = (svc: ReturnType<typeof createClient>): SendAdapter => {
  // Per-run caches: one token mint + one CurrentUser read per workspace.
  const ctxCache = new Map<string, ZohoWorkspaceCtx | { error: string; authError: boolean }>();

  const workspaceCtx = async (workspaceId: string) => {
    const cached = ctxCache.get(workspaceId);
    if (cached) return cached;
    const { data: row } = await svc.from("workspace_integrations")
      .select("credentials").eq("workspace_id", workspaceId).eq("provider", "zoho").maybeSingle();
    let result: ZohoWorkspaceCtx | { error: string; authError: boolean };
    if (!row?.credentials) {
      result = { error: "Zoho is not connected for this workspace.", authError: true };
    } else {
      const at = await zohoAccessToken(row.credentials as Record<string, string>);
      if (!at.ok || !at.token) {
        result = { error: at.error ?? "Zoho token refresh failed.", authError: true };
        // Surface the broken connection so the UI prompts reconnect (E1.1).
        await svc.from("workspace_integrations")
          .update({ status: "invalid", last_error: result.error })
          .eq("workspace_id", workspaceId).eq("provider", "zoho");
      } else {
        const session: ZohoSession = { token: at.token, api: at.api! };
        const user = await zohoCurrentUser(session);
        if (!user.ok || !user.user) {
          result = { error: user.error ?? "Could not read the Zoho user.", authError: true };
        } else {
          result = { session, fromEmail: user.user.email, fromName: user.user.fullName };
        }
      }
    }
    ctxCache.set(workspaceId, result);
    return result;
  };

  return {
    send: async ({ workspaceId, prospect, subject, body, campaignId }): Promise<SendResult> => {
      const ctx = await workspaceCtx(workspaceId);
      if ("error" in ctx) return { ok: false, error: ctx.error, authError: ctx.authError };

      // Resolve (or create) the Zoho contact — cached on the prospect row so the
      // inbox-monitor can poll the same record's email thread.
      const { data: pRow } = await svc.from("prospects")
        .select("meta").eq("id", prospect.id).maybeSingle();
      const meta = (pRow?.meta ?? {}) as Record<string, unknown>;
      let contactId = String(meta.zohoContactId ?? "");
      if (!contactId) {
        // First send to this prospect: stamp the campaign id8 into the new Contact's
        // Description so measurement can attribute engine sends (matchByText scans
        // it), complementing the reliable zohoContactId->campaign reverse-join. Only
        // set on create (we're here because we have no zohoContactId yet).
        const campaignTag = campaignId ? `campaign-${String(campaignId).slice(0, 8)}` : "";
        const up = await zohoUpsertContact(ctx.session, {
          firstName: prospect.first_name,
          lastName: prospect.last_name,
          email: prospect.email,
          description: campaignTag,
        });
        if (!up.ok || !up.contactId) return { ok: false, error: up.error ?? "Zoho contact upsert failed." };
        contactId = up.contactId;
        await svc.from("prospects")
          .update({ meta: { ...meta, zohoContactId: contactId } })
          .eq("id", prospect.id);
      }

      const sent = await zohoSendMail(ctx.session, {
        contactId,
        from: { email: ctx.fromEmail, name: ctx.fromName },
        to: { email: prospect.email, name: [prospect.first_name, prospect.last_name].filter(Boolean).join(" ") },
        subject,
        content: textToHtml(body),
      });
      if (!sent.ok) return { ok: false, error: sent.error, authError: sent.authError };
      return { ok: true, providerMessageId: sent.providerMessageId ?? "" };
    },
  };
};

// ─── SchedulerDb over PostgREST ───────────────────────────────────────────────

const makeDb = (svc: ReturnType<typeof createClient>): SchedulerDb => ({
  dueEnrollments: async (nowIso, limit) => {
    const { data, error } = await svc.from("enrollments")
      .select("*, sequence:sequences(*), prospect:prospects(id, first_name, last_name, title, company, email)")
      .eq("status", "active")
      .lte("next_send_at", nowIso)
      .order("next_send_at", { ascending: true }) // oldest-first (E2.3)
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      enrollment: {
        id: row.id,
        workspace_id: row.workspace_id,
        sequence_id: row.sequence_id,
        prospect_id: row.prospect_id,
        status: row.status,
        current_step: row.current_step,
        next_send_at: row.next_send_at,
      },
      sequence: row.sequence ?? null,
      prospect: row.prospect ?? null,
    })) as Bundle[];
  },

  // Emails are normalized to lowercase at every write site; compare lowercased.
  isSuppressed: async (workspaceId, email) => {
    const { data, error } = await svc.from("suppression_list")
      .select("id").eq("workspace_id", workspaceId).eq("email", email.toLowerCase()).maybeSingle();
    if (error) throw error;
    return Boolean(data);
  },

  warmSentToday: async (workspaceId) => {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count, error } = await svc.from("messages")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("send_path", "crm_zoho")
      .eq("status", "sent")
      .gte("sent_at", dayStart.toISOString());
    if (error) throw error;
    return count ?? 0;
  },

  getDomain: async (id) => {
    const { data, error } = await svc.from("sending_domains").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data ?? null) as DomainRow | null;
  },

  claimStep: async ({ enrollment, sequenceId, stepIdx, sendPath, subject, sendingDomainId }) => {
    const { data, error } = await svc.from("messages").insert({
      workspace_id: enrollment.workspace_id,
      enrollment_id: enrollment.id,
      prospect_id: enrollment.prospect_id,
      sequence_id: sequenceId,
      step_idx: stepIdx,
      send_path: sendPath,
      sending_domain_id: sendingDomainId,
      subject,
      status: "queued",
    }).select("id").single();
    if (!error && data) return { inserted: true, messageId: data.id as string };
    if (error && error.code !== "23505") throw error;
    const { data: existing, error: exErr } = await svc.from("messages")
      .select("id, status, attempt, error, updated_at")
      .eq("enrollment_id", enrollment.id).eq("step_idx", stepIdx).maybeSingle();
    if (exErr) throw exErr;
    return { inserted: false, existing: (existing ?? undefined) as MessageRow | undefined };
  },

  rearmClaim: async (messageId, attempt) => {
    const { error } = await svc.from("messages")
      .update({ status: "queued", attempt, error: "" }).eq("id", messageId);
    if (error) throw error;
  },

  finalizeMessage: async (messageId, patch) => {
    const { error } = await svc.from("messages").update(patch).eq("id", messageId);
    if (error) throw error;
  },

  updateEnrollment: async (id, patch) => {
    const { error } = await svc.from("enrollments").update(patch).eq("id", id);
    if (error) throw error;
  },
});

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: { message: "Method not allowed" } }, 405);

  let env;
  try { env = loadEnv(); } catch (e) { return json({ error: { message: (e as Error).message } }, 500); }

  const given = req.headers.get("x-scheduler-secret") ?? "";
  if (!secretMatches(given, env.schedulerSecret)) {
    return json({ error: { message: "Unauthorized" } }, 401);
  }

  const svc = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const summary = await runScheduler({
      db: makeDb(svc),
      adapters: { crm_zoho: makeZohoAdapter(svc) },
      config: {
        warmDailyCap: Number(Deno.env.get("WARM_DAILY_CAP")) || 100,
      },
    });
    if (summary.errors.length) console.error("send-scheduler errors:", summary.errors);
    return json({ ok: true, summary }, 200);
  } catch (e) {
    console.error("send-scheduler run failed:", e);
    return json({ error: { message: (e as Error).message } }, 500);
  }
});
