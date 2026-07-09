-- 012_campaigns
--
-- Campaign becomes a first-class object: a goal → strategy → an ordered plan of
-- steps across the existing specialist modules → linked content_items. This is
-- the "team spine" — the manager layer that turns KEPLER from a studio of
-- generators into a coordinated marketing team. Steps live inside plan.steps[]
-- (JSONB), not their own table (kept to a single new table for Phase A).
--
-- Content items link back via a nullable campaign_id (added below), so a step's
-- generated asset is attributable to its campaign. Nullable ⇒ standalone
-- (non-campaign) generation is completely untouched.
--
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    goal TEXT NOT NULL DEFAULT '',
    -- Coarse taxonomy driving the strategy template.
    campaign_type TEXT NOT NULL DEFAULT 'launch'
        CHECK (campaign_type IN ('launch', 'lead-gen', 'awareness', 'fundraise', 'retention')),
    -- Lifecycle: draft (plan generated, unconfirmed) → active (user committed) →
    -- completed (all steps done/skipped) → archived (shelved). 'failed' reserved
    -- for a strategy-generation failure that produced no usable plan.
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'completed', 'archived', 'failed')),
    -- The structured plan object: { goal, strategySummary, channelMix[], steps[] }.
    plan JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- How it was created: 'strategy-engine' (one-shot AI) | 'intake' (conversational) | 'manual'.
    source TEXT NOT NULL DEFAULT 'strategy-engine',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaigns_workspace_status_idx
    ON public.campaigns (workspace_id, status, created_at DESC);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Workspace-scoped access via the shared membership helper (matches other tables).
DROP POLICY IF EXISTS "campaigns_workspace_member" ON public.campaigns;
CREATE POLICY "campaigns_workspace_member" ON public.campaigns
    FOR ALL
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

-- Keep updated_at fresh via the shared trigger function from 001_core_schema.
DROP TRIGGER IF EXISTS campaigns_updated_at ON public.campaigns;
CREATE TRIGGER campaigns_updated_at
    BEFORE UPDATE ON public.campaigns
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Link generated assets back to their campaign + step. ON DELETE SET NULL means
-- deleting a campaign orphans its assets back into the Library rather than
-- destroying user work.
ALTER TABLE public.content_items
    ADD COLUMN IF NOT EXISTS campaign_id UUID
        REFERENCES public.campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.content_items
    ADD COLUMN IF NOT EXISTS campaign_step_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS content_items_campaign_idx
    ON public.content_items (campaign_id) WHERE campaign_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
