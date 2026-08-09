# Deploy runbook — staging backend

Manual equivalent of `.github/workflows/staging-backend.yml`, for when CI can't
run it (e.g. an expired `SUPABASE_ACCESS_TOKEN`).

**Target project:** `risoupsjfwnpawjltywh` — *KEPLER OS V2*
**Frontend:** already handled — Vercel rebuilds from the `staging` push. Nothing
to run here.

**Verified state (2026-08-09):** remote is at migration **019**. Everything from
020 onward is unapplied — including the entire outreach engine. Do not trust the
project notes on this; run `supabase migration list`.

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

**Thirteen are pending — 020 through 032.** Remote is at 019 (016 is
intentionally absent; see docs/STAGING-DEPLOYMENT.md). This was verified with
`supabase migration list`, not inferred.

| | | Notes |
|---|---|---|
| 020 | data deletion requests | |
| 021 | channel posts | |
| **022** | **outreach engine** | sequences, enrollments, messages, replies, suppression_list, sending_domains — the whole R1a schema, never deployed |
| **023** | send-scheduler cron | **needs Vault setup — see §3** |
| 024 | ABM research | |
| 025 | prospect lists | |
| 026 | outreach attribution | |
| 027 | workspace_events | |
| **028** | metrics-snapshot cron | **needs the same Vault setup** |
| 029 | prospect enrichment | |
| 030 | sequence hold signal (E1) | alters `sequences` — depends on 022 |
| 031 | usage events (E4) | |
| 032 | goals (E2) | 4 tables + `campaigns.goal_id` + 2 triggers |

All additive. `db push` applies them in order, so a failure at 022 stops
everything after it rather than half-applying.

**030 is not the risky one after all.** It replaces `sequences_guard_approval`,
but 022 creates that function three migrations earlier in the same run — on this
database there is no live send path to disturb, because there are no sequences
yet.

---

## 3. Prerequisites — 023 and 028 both need Vault, and it is NOT already there

The scheduler has **never run on this project** (023 is unapplied), so the
one-time setup almost certainly does not exist. Do this BEFORE `db push`:

```bash
# 1. a random 64-hex secret, shared between the edge functions and Vault
openssl rand -hex 32
supabase secrets set SCHEDULER_SECRET=<that-value>
```

```sql
-- 2. in the SQL editor, the SAME value
select vault.create_secret('https://risoupsjfwnpawjltywh.supabase.co', 'project_url');
select vault.create_secret('<that-value>', 'scheduler_secret');
```

Skipping this is safe but inert: the jobs no-op (the edge function returns
401/500) and enrollments simply stay due until a successful run. Nothing is
dropped. You can provision the secrets later and the next tick picks up.

### ⚠️ What 022 + 023 together switch on

Once both land **and** the secrets are set, `kepler-send-scheduler` runs **every
5 minutes** and will send real email to real people — for any sequence that is
approved with active enrollments. On this database there are none yet (022 is
what creates the tables), so the first run has nothing to do. But this is the
deploy that arms the sender: after it, approving a sequence in the UI means mail
goes out on a 5-minute tick.

`kepler-inbox-monitor` also starts, every 10 minutes — read-only, it polls for
replies.

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
