-- 013_workspace_integrations
--
-- External-provider connections (first: Google Search Console). One row per
-- workspace + provider. Holds the OAuth refresh_token, which is a long-lived
-- credential and MUST NOT be readable by the browser.
--
-- Security model:
--   * RLS restricts rows to workspace members (SELECT only from the client).
--   * Column privileges hide refresh_token from the `authenticated`/`anon`
--     roles — the client can read connection STATUS but never the token.
--   * All writes + token reads happen server-side in the search-console edge
--     function via the service role (which bypasses RLS + column grants).
--
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS public.workspace_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('gsc')),
    -- OAuth refresh token — server-side only (hidden from clients via column grants below).
    refresh_token TEXT NOT NULL DEFAULT '',
    -- The authorized GSC property (e.g. 'https://example.com/' or 'sc-domain:example.com').
    property_url TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'connected'
        CHECK (status IN ('connected', 'expired', 'invalid', 'disconnected')),
    -- Free-form: available properties, scopes, etc.
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_sync_at TIMESTAMPTZ,
    last_error TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_integrations_ws_provider_uidx
    ON public.workspace_integrations (workspace_id, provider);

ALTER TABLE public.workspace_integrations ENABLE ROW LEVEL SECURITY;

-- Clients may READ their workspace's connection (status/property), never write.
-- Writes + token reads are done by the edge function via the service role.
DROP POLICY IF EXISTS "workspace_integrations_select_member" ON public.workspace_integrations;
CREATE POLICY "workspace_integrations_select_member" ON public.workspace_integrations
    FOR SELECT
    USING (public.is_workspace_member(workspace_id));

-- Column privileges: hide refresh_token from the client roles. Grant SELECT on
-- every column EXCEPT refresh_token. (service_role bypasses this entirely.)
REVOKE ALL ON public.workspace_integrations FROM anon, authenticated;
GRANT SELECT (
    id, workspace_id, provider, property_url, status, meta,
    last_sync_at, last_error, created_at, updated_at
) ON public.workspace_integrations TO authenticated;

-- Keep updated_at fresh via the shared trigger function from 001_core_schema.
DROP TRIGGER IF EXISTS workspace_integrations_updated_at ON public.workspace_integrations;
CREATE TRIGGER workspace_integrations_updated_at
    BEFORE UPDATE ON public.workspace_integrations
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
