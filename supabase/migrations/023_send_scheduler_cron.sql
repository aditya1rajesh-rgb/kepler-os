-- 023_send_scheduler_cron
--
-- Scheduler transport (O4): pg_cron → pg_net → edge functions, staying inside
-- the existing Supabase-only architecture. Two jobs:
--   * send-scheduler  every 5 minutes  (due enrollments → sends)
--   * inbox-monitor   every 10 minutes (reply/OOO/bounce detection)
--
-- PREREQUISITES (one-time, per environment — see docs/R1A-RUNBOOK.md):
--   1. supabase secrets set SCHEDULER_SECRET=<random-64-hex>
--   2. In SQL editor:
--        select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--        select vault.create_secret('<same-random-64-hex>', 'scheduler_secret');
--
-- The jobs no-op gracefully (edge fn returns 401/500) if the secrets are absent
-- or mismatched — they never sit between an approved sequence and a silent drop:
-- enrollments simply stay due until the next successful run.
--
-- Safe to run repeatedly (unschedule-if-exists, then schedule).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kepler-send-scheduler') THEN
        PERFORM cron.unschedule('kepler-send-scheduler');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kepler-inbox-monitor') THEN
        PERFORM cron.unschedule('kepler-inbox-monitor');
    END IF;
END;
$$;

SELECT cron.schedule(
    'kepler-send-scheduler',
    '*/5 * * * *',
    $$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
               || '/functions/v1/send-scheduler',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-scheduler-secret',
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'scheduler_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
    );
    $$
);

SELECT cron.schedule(
    'kepler-inbox-monitor',
    '*/10 * * * *',
    $$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
               || '/functions/v1/inbox-monitor',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-scheduler-secret',
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'scheduler_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
    );
    $$
);
