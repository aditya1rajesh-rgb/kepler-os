# Deploy runbook — staging backend

Manual equivalent of `.github/workflows/staging-backend.yml`, for when CI can't
run it (e.g. an expired `SUPABASE_ACCESS_TOKEN`).

**Target project:** `risoupsjfwnpawjltywh` — *KEPLER OS V2*
**Frontend:** already handled — Vercel rebuilds from the `staging` push. Nothing
to run here.

---

## 0. Before you start

```bash
cd /Users/apple/ai-marketing-platform
supabase link --project-ref risoupsjfwnpawjltywh
supabase migration list
```

`migration list` is the only reliable statement of what is actually pending —
everything below assumes 027–032 are unapplied, which is what the local repo and
the project notes imply, but the database is the authority.

---

## 1. Functions FIRST, then migrations

This order is deliberate and is the one thing not to swap.

Migration **028** schedules a `pg_cron` job that calls the `metrics-snapshot`
edge function. Its own header says *"Deploy the function first"* — apply the
schedule while the function is missing and pg_net posts 404s until you catch up.
The reverse order costs nothing: a function calling a table that doesn't exist
yet fails exactly as it already does today.

```bash
supabase functions deploy ai-proxy connector-proxy oauth-proxy meta-callbacks \
  send-scheduler inbox-monitor visibility-scanner metrics-snapshot search-console
```

**Two of these have never deployed.** `metrics-snapshot` and `search-console`
were missing from the workflow's explicit list, which is why metrics-snapshot has
been "code-complete but undeployed" since 028. Fixed in the workflow, but this
manual run is the first time they actually ship.

**Two carry changes from this session and must redeploy:**

| Function | Change |
|---|---|
| `send-scheduler` | E1 — records *why* a send was held and preserves `held_since` across re-holds |
| `oauth-proxy` | E29 — captures granted OAuth scopes into `meta.scopes` |

---

## 2. Migrations

```bash
supabase db push
```

Applies, in order:

| | | Notes |
|---|---|---|
| 027 | `workspace_events` | 030 writes to this — must land first |
| 028 | metrics-snapshot cron | needs Vault secrets, see §3 |
| 029 | prospect enrichment | Apollo email/phone reveal |
| 030 | sequence hold signal (E1) | **replaces `sequences_guard_approval`** |
| 031 | usage events (E4) | new table |
| 032 | goals (E2) | 4 tables + `campaigns.goal_id` + 2 triggers |

All additive — new tables and columns, no drops, no destructive DDL.

**The one to be deliberate about is 030.** It replaces a trigger function on the
live send path (`sequences_guard_approval`). Behaviour is a superset of the old
one: same demotion rules, plus recording what the sequence fell from. If any
workspace is actively running sequences, that's the change worth watching.

---

## 3. Prerequisites — only 028 needs anything

It reuses the send-scheduler Vault entries from migration 023, so if the
scheduler already runs there is **nothing new to provision**. If it doesn't:

```sql
-- Vault secrets (Supabase Dashboard → Project Settings → Vault)
project_url       = https://risoupsjfwnpawjltywh.supabase.co
scheduler_secret  = <the SCHEDULER_SECRET edge secret>
```

028 creates the `pg_cron` and `pg_net` extensions itself.

---

## 4. Verify

```sql
-- E1 · the held state is representable
select column_name from information_schema.columns
 where table_name = 'sequences' and column_name like 'held%';
-- expect: held_from_status, held_at, held_by

-- E4 · instrumentation, with actor_id defaulting server-side
select column_default from information_schema.columns
 where table_name = 'usage_events' and column_name = 'actor_id';
-- expect: auth.uid()

-- E2 · the goals spine
select table_name from information_schema.tables
 where table_name in ('goals','goal_checkpoints','goal_target_history','goal_links');
-- expect: 4 rows

select column_name from information_schema.columns
 where table_name = 'campaigns' and column_name = 'goal_id';

-- 028 · the cron job is scheduled
select jobname, schedule from cron.job where jobname = 'kepler-metrics-snapshot';
```

```bash
supabase functions list   # expect 9
supabase migration list   # expect no pending
```

---

## 5. After it's green

- **E29 scope visibility stays "unknown" on existing connections.** `meta.scopes`
  is written at connect time, so already-connected integrations show unknown
  capabilities until they are reconnected. That is correct — absent metadata is
  treated as unknown, never as "nothing granted" — but expect it rather than
  reading it as a bug.
- **E4 records nothing retroactively.** Usage data starts accruing from deploy.
- **028's first snapshot** lands at the next 05:00 UTC.

---

## 6. Fixing CI properly

The workflow failed at `supabase link` with `{"message":"Unauthorized"}` — the
token is reaching Supabase and being turned away.

1. Supabase Dashboard → Account → Access Tokens → generate
2. GitHub → `aditya1rajesh-rgb/kepler-os` → Settings → Secrets and variables → Actions
3. Update `SUPABASE_ACCESS_TOKEN`
4. Confirm `SUPABASE_PROJECT_REF` is `risoupsjfwnpawjltywh`

Then re-runs need no push:

```bash
gh workflow run staging-backend.yml --ref staging
```
