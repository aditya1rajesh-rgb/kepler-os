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
