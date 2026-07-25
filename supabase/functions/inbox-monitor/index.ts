// inbox-monitor — scheduled reply/OOO/bounce detection for CRM-native sends
// (E3.1/E3.3, R1a). Polls the Zoho email thread of every prospect KEPLER has
// recently messaged, classifies new inbound mail deterministically
// (classify.ts), writes `replies`, and fires the stop/reschedule/suppress
// transitions. Dedupe is the (workspace_id, provider_email_id) unique index —
// a re-poll can never re-fire a transition.
//
// Auth mirrors send-scheduler: shared secret header, never browser-callable.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyEmail, transitionFor } from "./classify.ts";
import { zohoAccessToken, zohoContactEmails, zohoCurrentUser, type ZohoSession } from "../_shared/zoho.ts";

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
  if (missing.length) throw new Error(`inbox-monitor is not configured: missing ${missing.join(", ")}`);
  return { supabaseUrl: supabaseUrl!, serviceRoleKey: serviceRoleKey!, schedulerSecret: schedulerSecret! };
};

const secretMatches = (given: string, expected: string): boolean => {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
};

const LOOKBACK_DAYS = 14;
const MAX_PROSPECTS_PER_RUN = 50;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: { message: "Method not allowed" } }, 405);

  let env;
  try { env = loadEnv(); } catch (e) { return json({ error: { message: (e as Error).message } }, 500); }
  if (!secretMatches(req.headers.get("x-scheduler-secret") ?? "", env.schedulerSecret)) {
    return json({ error: { message: "Unauthorized" } }, 401);
  }

  const svc = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date();
  const summary = { polled: 0, replies: 0, ooo: 0, bounces: 0, suppressed: 0, errors: [] as string[] };

  try {
    // Prospects messaged in the lookback window — covers active enrollments and
    // recently completed ones (late replies still stop nothing but must surface).
    const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent, error: mErr } = await svc.from("messages")
      .select("workspace_id, prospect_id, enrollment_id, id, sent_at")
      .eq("status", "sent").eq("send_path", "crm_zoho")
      .gte("sent_at", since)
      .order("sent_at", { ascending: false })
      .limit(500);
    if (mErr) throw mErr;

    // Latest message per prospect (the reply's join anchor), capped per run.
    const byProspect = new Map<string, { workspaceId: string; enrollmentId: string; messageId: string; firstSentAt: string }>();
    for (const m of recent ?? []) {
      const key = String(m.prospect_id);
      if (!byProspect.has(key)) {
        byProspect.set(key, {
          workspaceId: String(m.workspace_id),
          enrollmentId: String(m.enrollment_id),
          messageId: String(m.id),
          firstSentAt: String(m.sent_at),
        });
      } else {
        byProspect.get(key)!.firstSentAt = String(m.sent_at); // rows are desc → last seen is earliest
      }
      if (byProspect.size >= MAX_PROSPECTS_PER_RUN) break;
    }

    // One Zoho session + operator identity per workspace.
    const zohoCtx = new Map<string, { session: ZohoSession; operatorEmail: string } | null>();
    const getCtx = async (workspaceId: string) => {
      if (zohoCtx.has(workspaceId)) return zohoCtx.get(workspaceId)!;
      let ctx: { session: ZohoSession; operatorEmail: string } | null = null;
      const { data: row } = await svc.from("workspace_integrations")
        .select("credentials").eq("workspace_id", workspaceId).eq("provider", "zoho").maybeSingle();
      if (row?.credentials) {
        const at = await zohoAccessToken(row.credentials as Record<string, string>);
        if (at.ok && at.token) {
          const session: ZohoSession = { token: at.token, api: at.api! };
          const user = await zohoCurrentUser(session);
          ctx = { session, operatorEmail: user.ok ? user.user!.email : "" };
        }
      }
      zohoCtx.set(workspaceId, ctx);
      return ctx;
    };

    for (const [prospectId, anchor] of byProspect) {
      try {
        const ctx = await getCtx(anchor.workspaceId);
        if (!ctx) continue;

        const { data: prospect } = await svc.from("prospects")
          .select("id, email, meta").eq("id", prospectId).maybeSingle();
        const contactId = String((prospect?.meta as Record<string, unknown>)?.zohoContactId ?? "");
        const prospectEmail = String(prospect?.email ?? "").trim().toLowerCase();
        if (!contactId || !prospectEmail) continue;

        const thread = await zohoContactEmails(ctx.session, contactId);
        if (!thread.ok) { summary.errors.push(`${prospectId}: ${thread.error}`); continue; }
        summary.polled += 1;

        const inbound = (thread.emails ?? []).filter((e) => {
          const kind = classifyEmail({
            fromEmail: e.fromEmail, subject: e.subject,
            prospectEmail, operatorEmail: ctx.operatorEmail,
          });
          return kind === "reply" || kind === "ooo" || kind === "bounce";
        });
        if (!inbound.length) continue;

        // Dedupe against already-processed provider ids (single writer → no race).
        const ids = inbound.map((e) => e.providerEmailId);
        const { data: seenRows } = await svc.from("replies")
          .select("provider_email_id")
          .eq("workspace_id", anchor.workspaceId)
          .in("provider_email_id", ids);
        const seen = new Set((seenRows ?? []).map((r) => String(r.provider_email_id)));

        for (const email of inbound) {
          if (seen.has(email.providerEmailId)) continue;
          const kind = classifyEmail({
            fromEmail: email.fromEmail, subject: email.subject,
            prospectEmail, operatorEmail: ctx.operatorEmail,
          }) as "reply" | "ooo" | "bounce";

          const receivedAt = email.time && !Number.isNaN(Date.parse(email.time))
            ? new Date(email.time).toISOString()
            : now.toISOString();
          // Ignore thread history that predates our first touch in the window.
          if (receivedAt < anchor.firstSentAt) continue;

          const { error: rErr } = await svc.from("replies").insert({
            workspace_id: anchor.workspaceId,
            prospect_id: prospectId,
            enrollment_id: anchor.enrollmentId,
            message_id: anchor.messageId,
            kind,
            source: "zoho_poll",
            raw_snippet: email.subject.slice(0, 500),
            provider_email_id: email.providerEmailId,
            received_at: receivedAt,
          });
          if (rErr) {
            if (rErr.code === "23505") continue; // concurrent duplicate — already handled
            throw rErr;
          }

          // Surface a genuine reply on the dashboard feed (best-effort; never blocks).
          if (kind === "reply") {
            await svc.from("workspace_events").insert({
              workspace_id: anchor.workspaceId, kind: "outreach.reply", title: "New reply from a prospect", entity_type: "enrollment", entity_id: anchor.enrollmentId,
            }).then(() => {}, () => {});
          }

          const { data: enrollment } = await svc.from("enrollments")
            .select("id, status, next_send_at").eq("id", anchor.enrollmentId).maybeSingle();
          const t = transitionFor(kind, enrollment ?? null, now);
          if (t.enrollmentPatch) {
            await svc.from("enrollments").update(t.enrollmentPatch).eq("id", anchor.enrollmentId);
          }
          if (t.suppress) {
            await svc.from("suppression_list").upsert({
              workspace_id: anchor.workspaceId,
              email: prospectEmail,
              reason: "hard_bounce",
              source_message_id: anchor.messageId,
            }, { onConflict: "workspace_id,email", ignoreDuplicates: true });
            await svc.from("messages").update({ status: "bounced" }).eq("id", anchor.messageId);
            summary.suppressed += 1;
          }
          if (kind === "reply") summary.replies += 1;
          else if (kind === "ooo") summary.ooo += 1;
          else summary.bounces += 1;
        }
      } catch (e) {
        summary.errors.push(`${prospectId}: ${(e as Error).message}`);
      }
    }

    if (summary.errors.length) console.error("inbox-monitor errors:", summary.errors);
    return json({ ok: true, summary }, 200);
  } catch (e) {
    console.error("inbox-monitor run failed:", e);
    return json({ error: { message: (e as Error).message } }, 500);
  }
});
