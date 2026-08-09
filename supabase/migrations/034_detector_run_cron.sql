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
