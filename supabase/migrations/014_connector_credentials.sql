-- 014_connector_credentials
--
-- Generalize workspace_integrations for the self-service connector framework:
--   * drop the provider CHECK — the app-side connector registry (src/lib/connectors.js)
--     is now the source of truth for valid providers, so no migration is needed
--     per new connector;
--   * add a generic server-side `credentials` JSONB (holds API keys / OAuth material
--     for non-GSC connectors);
--   * re-assert column privileges so BOTH `refresh_token` AND `credentials` stay
--     hidden from client roles — readable only by the service role inside edge
--     functions. The client can still read connection STATUS.
--
-- Safe to run repeatedly.

ALTER TABLE public.workspace_integrations
    DROP CONSTRAINT IF EXISTS workspace_integrations_provider_check;

ALTER TABLE public.workspace_integrations
    ADD COLUMN IF NOT EXISTS credentials JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Column privileges: grant SELECT on every column EXCEPT the two secret ones
-- (refresh_token, credentials). Any column not listed is unreadable by clients.
REVOKE ALL ON public.workspace_integrations FROM anon, authenticated;
GRANT SELECT (
    id, workspace_id, provider, property_url, status, meta,
    last_sync_at, last_error, created_at, updated_at
) ON public.workspace_integrations TO authenticated;

NOTIFY pgrst, 'reload schema';
