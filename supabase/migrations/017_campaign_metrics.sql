-- 017_campaign_metrics
--
-- Measurement/attribution snapshots: each row is a point-in-time reading of a
-- campaign's outcomes from a provider (GA4 today; CRM later). campaign_id is
-- NULL for the "unattributed" bucket (traffic/leads not matched to a KEPLER
-- campaign). Snapshots (vs live-only) give trends over time + fast reports.
--
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS public.campaign_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    -- Nullable: NULL = outcomes not attributable to a specific KEPLER campaign.
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'ga4',
    -- { sessions, users, conversions, ... } — provider-shaped outcome metrics.
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_metrics_ws_idx
    ON public.campaign_metrics (workspace_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS campaign_metrics_campaign_idx
    ON public.campaign_metrics (campaign_id);

ALTER TABLE public.campaign_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign_metrics_workspace_member" ON public.campaign_metrics;
CREATE POLICY "campaign_metrics_workspace_member" ON public.campaign_metrics
    FOR ALL
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

NOTIFY pgrst, 'reload schema';
