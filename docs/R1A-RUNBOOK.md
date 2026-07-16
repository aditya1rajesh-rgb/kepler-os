# R1a Runbook — Warm Send Engine: Deploy, Verify, DoD

> Companion to [`ROADMAP-HANDOFF.md`](ROADMAP-HANDOFF.md) §7 (R1a). Everything in this
> runbook is per-environment (staging first, then production).

## 1. What shipped in this build

| Piece | Where |
|---|---|
| Execution schema (sequences, enrollments, messages, replies, suppression_list, sending_domains) + DB-enforced approval gate | `supabase/migrations/022_outreach_engine.sql` |
| pg_cron → pg_net invocation of the two engines | `supabase/migrations/023_send_scheduler_cron.sql` |
| send-scheduler (pure core + Deno shell; all §9.5 invariants) | `supabase/functions/send-scheduler/` |
| inbox-monitor (reply/OOO/bounce detection + transitions) | `supabase/functions/inbox-monitor/` |
| Shared Zoho helpers (send_mail, CurrentUser, contact emails) | `supabase/functions/_shared/zoho.ts` |
| Client services (sequences / enrollments / replies+suppression) | `src/services/{sequences,enrollments,replies}Service.js` |
| Outreach UI: Builder ⇄ **Send engine** tabs, Approve & schedule, Enroll, Inbox | `src/pages/workspace-modules/Outreach.jsx`, `src/components/outreach/OutreachEngine.jsx` |
| First automated tests (41) + CI gate | `tests/*.test.ts`, `.github/workflows/ci.yml` (`npm test`) |

**Send path (R1a):** warm only, Zoho CRM-native (`send_mail` from the connected user's
identity). Cold lane is schema-complete but gated: the scheduler blocks `mode='cold'`
until a `sending_domains` row is `verified` — the verifier is R1b.

## 2. One-time environment setup (order matters)

1. **Generate the scheduler secret** (any 64-hex string):
   `openssl rand -hex 32`
2. **Set edge secrets:**
   ```
   supabase secrets set SCHEDULER_SECRET=<hex>
   supabase secrets set WARM_DAILY_CAP=100        # optional, default 100
   ```
3. **Vault secrets** (SQL editor — pg_cron reads these to call the functions):
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   select vault.create_secret('<same hex as SCHEDULER_SECRET>', 'scheduler_secret');
   ```
4. **Deploy** — push to `staging` (staging-backend.yml runs `db push` + deploys
   `send-scheduler inbox-monitor` along with the existing functions), or manually:
   ```
   supabase db push
   supabase functions deploy send-scheduler inbox-monitor connector-proxy
   ```
5. **Reconnect Zoho with the wider scopes.** Existing connections lack send/read
   scopes. In Integrations, reconnect Zoho with a Self Client grant token generated for:
   `ZohoCRM.modules.contacts.ALL,ZohoCRM.modules.tasks.ALL,ZohoCRM.modules.emails.READ,ZohoCRM.send_mail.all.CREATE,ZohoCRM.users.READ`
   (already reflected in the connect modal help text).

## 3. Verify the plumbing

```sql
-- cron jobs exist
select jobname, schedule from cron.job where jobname like 'kepler-%';
-- recent invocations succeeded (pg_net responses, status 200)
select status_code, created from net._http_response order by created desc limit 5;
```

Manual invoke (bypasses cron, same auth):
```
curl -X POST https://<ref>.supabase.co/functions/v1/send-scheduler \
  -H "x-scheduler-secret: <hex>" -H "Content-Type: application/json" -d '{}'
```
Expect `{"ok":true,"summary":{...}}`. A `401` means vault/edge secret mismatch.

## 4. R1a DoD checklist (from handoff §7)

- [ ] One real workspace runs a ≥3-touch warm sequence end-to-end via Zoho send
- [x] Reply cancels remaining touches (inbox-monitor + tested transition)
- [x] Hard bounce auto-suppresses (tested transition; suppression is send-time law)
- [x] Every send/failure logged against contact + sequence + step (`messages` spine; claim-before-send)
- [x] **Provably zero sends without approval** — server-side: DB trigger resets edited sequences to draft; scheduler-core test proves the adapter is unreachable for unapproved sequences (`tests/scheduler.test.ts`)
- [x] Pause works mid-flight, resume recomputes from now (no catch-up flood)

The unchecked box is the live-fire gate: run our own agency book through it on staging.

## 5. Operational notes & known edges

- **Reply detection depends on Zoho seeing the reply.** CRM `send_mail` threads sends
  onto the contact; inbound replies appear on the contact's Emails list when the
  operator's mailbox is linked in Zoho (Zoho Mail add-on/IMAP). Onboarding must say
  this plainly. The manual "Replied elsewhere" action is the fallback.
- **Auth expiry holds, never drops** (E1.1): sends mark `auth:` failures, retry every
  30 min without an attempt cap, and flip the integration to `invalid` so the UI
  prompts reconnect.
- **Caps:** warm sends are capped per workspace per UTC day (`WARM_DAILY_CAP`).
  Domain warmup ramps (`+20%/day`) are R1b — the columns exist, the ramp updater doesn't.
- **Gmail (R2) long pole:** file Google sensitive-scope verification for `gmail.send`
  now (handoff §7: "file at R1a start").
- On R1a ship: update `PRODUCT.md` §10 + `CONTEXT.md` §7 (handoff §13).
