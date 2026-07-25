-- 027_workspace_events
--
-- Append-only activity stream per workspace. Powers the Dashboard "Latest Updates"
-- feed and the header bell's unread indicator. Rows are written at mutation points
-- across the app (content generated, campaign steps done, sequences approved,
-- connectors connected, publishes, metric pulls, AEO scans).
--
-- Members read + insert; no update/delete (append-only, like outreach `messages`).
-- Service-role writers (edge functions: inbox-monitor, oauth-/connector-proxy,
-- metrics-snapshot) bypass RLS.
--
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS public.workspace_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- e.g. content.created | content.completed | campaign.created | campaign.step_done |
    -- campaign.completed | sequence.approved | sequence.enrolled | outreach.reply |
    -- outreach.meeting | connector.connected | social.published | metrics.pulled | aeo.scanned
    kind TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    entity_type TEXT NOT NULL DEFAULT '',
    entity_id UUID,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_events_ws_created_idx
    ON public.workspace_events (workspace_id, created_at DESC);

-- Period-over-period trend + weekly/monthly/quarterly series queries scan
-- campaign_metrics by (workspace, provider) over time; this composite index serves them.
CREATE INDEX IF NOT EXISTS campaign_metrics_ws_provider_time_idx
    ON public.campaign_metrics (workspace_id, provider, captured_at DESC);

ALTER TABLE public.workspace_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_events_select_member" ON public.workspace_events;
CREATE POLICY "workspace_events_select_member" ON public.workspace_events
    FOR SELECT
    USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "workspace_events_insert_member" ON public.workspace_events;
CREATE POLICY "workspace_events_insert_member" ON public.workspace_events
    FOR INSERT
    WITH CHECK (public.is_workspace_member(workspace_id));

NOTIFY pgrst, 'reload schema';
