-- ═══════════════════════════════════════════════════════════════════════════
-- KEPLER · pg_cron schedules (028, 034) — OPTIONAL, and inert for now
--
-- WHY THIS EXISTS: the `staging-backend` Action has failed every run since
-- 2026-08-04 on an expired SUPABASE_ACCESS_TOKEN, so migrations 029-035 never
-- reached the database. (027 DID apply, on the last good run - verified: the
-- REST API answers 200 for public.workspace_events and 404 for public.goals.)
--
-- EACH MIGRATION IS ITS OWN TRANSACTION. The previous version of this script
-- wrapped all nine in one BEGIN/COMMIT, so a single error rolled back the entire
-- batch and nothing landed. Per-migration atomicity is also how `supabase db
-- push` behaves: if one fails, the ones before it stay applied and you get told
-- exactly which one broke.
--
-- Everything is idempotent - CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- DROP POLICY IF EXISTS then CREATE POLICY - so re-running is safe and an
-- already-applied migration is a no-op. Nothing drops a table, drops a column,
-- truncates, or deletes a row.
-- ═══════════════════════════════════════════════════════════════════════════


-- ┌───────────────────────────────────────────────────────────────────────┐
-- │  028_metrics_snapshot_cron.sql
-- └───────────────────────────────────────────────────────────────────────┘
BEGIN;

-- 028_metrics_snapshot_cron
--
-- Daily campaign_metrics history accrual: pg_cron → pg_net → metrics-snapshot edge
-- function. Until now snapshots only accrued on a manual "Refresh"/"Pull latest",
-- so period-over-period trends and the dashboard chart had no history to draw on.
-- This job writes one snapshot per connected workspace per day (GA4 + GSC + Outreach),
-- which is what makes the Dashboard's "vs last month" deltas and the Lead Conversion
-- chart fill in on their own.
--
-- Runs at 05:00 UTC — after GSC's ~3-day-lagged data has settled for the day. The
-- function's per-day idempotency guard makes a re-run a no-op.
--
-- PREREQUISITES (reuses the send-scheduler Vault entries from migration 023 — no new
-- one-time setup if those are already provisioned):
--   * Vault secret 'project_url'      = https://<project-ref>.supabase.co
--   * Vault secret 'scheduler_secret' = the SCHEDULER_SECRET edge secret
--   * Deploy the function first:  supabase functions deploy metrics-snapshot
--     (until then pg_net posts 404 harmlessly; no history accrues).
--
-- Safe to run repeatedly (unschedule-if-exists, then schedule).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kepler-metrics-snapshot') THEN
        PERFORM cron.unschedule('kepler-metrics-snapshot');
    END IF;
END;
$$;

SELECT cron.schedule(
    'kepler-metrics-snapshot',
    '0 5 * * *',
    $$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
               || '/functions/v1/metrics-snapshot',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-scheduler-secret',
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'scheduler_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
    );
    $$
);

COMMIT;

-- ┌───────────────────────────────────────────────────────────────────────┐
-- │  034_detector_run_cron.sql
-- └───────────────────────────────────────────────────────────────────────┘
BEGIN;

-- 034_detector_run_cron
--
-- E7 · the schedule. pg_cron → pg_net → the detector-run edge function, once a
-- day, writing change_events.
--
-- RUNS AT 06:00 UTC — one hour AFTER metrics-snapshot (migration 028, 05:00).
-- That ordering is the whole point: a detector compares the newest reading with
-- the one before it, so running before the snapshot would compare yesterday's
-- pair every day and report "nothing moved" forever. If 028's time changes, this
-- one moves with it.
--
-- PREREQUISITES (reuses the Vault entries from migrations 023/028 — no new
-- one-time setup if those are already provisioned):
--   * Vault secret 'project_url'      = https://<project-ref>.supabase.co
--   * Vault secret 'scheduler_secret' = the SCHEDULER_SECRET edge secret
--   * Deploy the function first:  supabase functions deploy detector-run
--     (until then pg_net posts 404 harmlessly; no events accrue, and the app's
--     manual "Check for changes" path still works.)
--
-- Safe to run repeatedly (unschedule-if-exists, then schedule).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kepler-detector-run') THEN
        PERFORM cron.unschedule('kepler-detector-run');
    END IF;
END;
$$;

SELECT cron.schedule(
    'kepler-detector-run',
    '0 6 * * *',
    $$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
               || '/functions/v1/detector-run',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-scheduler-secret',
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'scheduler_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
    );
    $$
);

COMMIT;


-- These POST to the edge functions `metrics-snapshot` and `detector-run`, which
-- the same failed Action deploys. Until those ship, both jobs 404 once a day.
-- Scheduling still succeeds: the job body is a string, evaluated at fire time,
-- so a missing Vault secret or function surfaces as a failing job, not an error
-- here. There is no reason to run this file before the token is fixed.

