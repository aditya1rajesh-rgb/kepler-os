-- 033_change_events
--
-- E7 · scheduled detectors. Roadmap: "stateless jobs (teardowns, scans) discard
-- every run" — filed under entropy, because a job that looks at the world and
-- keeps nothing can only ever say what IS, never what CHANGED.
--
-- This table is the kept half. One row = one detected change, with the two
-- readings it was measured between, so every claim on screen can be argued with.
--
-- WHAT IS DELIBERATELY NOT HERE.
--
--   * No `goal_id`. Movement reaches a goal through its campaign, and a campaign
--     can be re-laddered to a different goal at any time — a denormalised goal_id
--     would be silently wrong from that moment on. Reads join through campaigns.
--     (This codebase's recurring defect is columns designed and never written, or
--     written once and never maintained; the cheapest fix is not adding them.)
--   * No `seen`/`dismissed` flag. Nothing in E7 needs one yet, and a notification
--     system is explicitly deferred until E5 proves what is worth notifying about.
--     Adding the column now would be designing for a feature nobody has specced.
--
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS public.change_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

    -- Which detector produced it. TEXT + CHECK rather than an enum so adding a
    -- detector is a code change, not a migration.
    kind TEXT NOT NULL CHECK (kind IN ('metric', 'search', 'visibility', 'outreach')),
    -- What moved: a measure label, a search query, an answer-engine prompt.
    subject TEXT NOT NULL DEFAULT '',
    direction TEXT NOT NULL CHECK (direction IN ('up', 'down')),

    -- Always positive; `direction` carries the sign. In `unit` — sessions,
    -- positions, replies — because a bare number is unreadable a week later.
    magnitude NUMERIC NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT '',
    -- NULL when the base was zero: that is an unknown percentage, not +100%.
    pct NUMERIC,
    value_from NUMERIC,
    value_to NUMERIC,

    -- The two readings compared. `compared_to` is what makes the event
    -- falsifiable, and campaign_metrics rows are trailing LEVELS, so the pair is
    -- a change in a trailing window and never a period total.
    observed_at TIMESTAMPTZ NOT NULL,
    compared_to TIMESTAMPTZ,

    -- Set for campaign-scoped movement; NULL for workspace-level signals (search,
    -- answer engines), which belong to the account rather than to one campaign.
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,

    -- Detector-specific proof: impressions behind a ranking move, which engine
    -- dropped the citation, which competitor was named instead.
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- 'scheduler' (pg_cron → detector-run) | 'manual' (a user pressed the button).
    -- Kept because "nothing moved" means different things when the schedule has
    -- not run for three days.
    detected_by TEXT NOT NULL DEFAULT 'scheduler',
    -- Same comparison detected twice is ONE event; this is what makes a re-run,
    -- or a manual run racing the cron, a no-op instead of a duplicate.
    dedupe_key TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS change_events_dedupe_uidx
    ON public.change_events (workspace_id, dedupe_key);

CREATE INDEX IF NOT EXISTS change_events_workspace_observed_idx
    ON public.change_events (workspace_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS change_events_campaign_idx
    ON public.change_events (campaign_id) WHERE campaign_id IS NOT NULL;

ALTER TABLE public.change_events ENABLE ROW LEVEL SECURITY;

-- Workspace-scoped access via the shared membership helper (matches every other
-- workspace table). The scheduler writes with the service role and bypasses this.
DROP POLICY IF EXISTS "change_events_workspace_member" ON public.change_events;
CREATE POLICY "change_events_workspace_member" ON public.change_events
    FOR ALL
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

NOTIFY pgrst, 'reload schema';
