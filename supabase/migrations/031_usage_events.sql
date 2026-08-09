-- 031_usage_events
--
-- E4 · Usage instrumentation.
--
-- The roadmap marks its entire jobs-to-be-done section as hypothesis, and
-- docs/RETENTION-MODEL.md §7 lists what could not be determined from the code:
-- whether anyone re-runs the stateless jobs, what the real session cadence is,
-- and which modules actually get opened. None of that is answerable from the
-- schema, because nothing has ever recorded it. This table exists to end that
-- blindness — it is the cheap enabler that turns E6 (does performance data
-- improve the next asset?) from a guess into a decision.
--
-- WHY NOT workspace_events. That table is a user-facing activity feed: it backs
-- the Dashboard "Latest Updates" panel and the header's unread dot, so every row
-- in it is something a human should care about. Surface views and job re-runs
-- are neither — writing them there would drown the feed it exists to serve.
-- Different audience, different retention, different table.
--
-- WHY NOT a third-party product analytics tool. Page-view analytics is
-- commodity and the roadmap's second principle says rent commodity. It is
-- rented for the questions it answers well. What it cannot do is the join E4
-- exists for: correlating a generation event with the campaign_metrics outcome
-- that followed it, both of which live here. Shipping that across a vendor
-- boundary is harder than one table and one insert. Add a vendor later for
-- funnels if the need appears; this is not competing with that.
--
-- actor_id DEFAULTS to auth.uid() rather than being passed by the client. The
-- client cannot forge it, no caller can forget it, and it does not repeat the
-- workspace_events mistake — that column is nullable, client-supplied, and to
-- this day never populated, which is why the activity feed structurally cannot
-- say who did anything.

CREATE TABLE IF NOT EXISTS public.usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    -- Populated by the database from the caller's JWT. Never trusted from input.
    actor_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    -- The screen or sub-screen: 'seo-aeo', 'measurement-paid', 'sequences-engine'.
    -- Matches ModuleScreen's moduleKey, so sub-tabs are distinguishable.
    surface TEXT NOT NULL,
    -- What happened there: 'view' | 'run' | 'generate' | 'export'.
    action TEXT NOT NULL,
    -- What was acted on, for 'run'/'generate': 'teardown', 'apollo_search'…
    -- Empty for plain views.
    subject TEXT NOT NULL DEFAULT '',
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The three questions this table exists to answer, in index form:
--   which surfaces get opened, and how often   → (workspace, surface, created_at)
--   does anyone RE-run a given job             → (workspace, subject, created_at)
CREATE INDEX IF NOT EXISTS usage_events_ws_surface_idx
    ON public.usage_events (workspace_id, surface, created_at DESC);

CREATE INDEX IF NOT EXISTS usage_events_ws_subject_idx
    ON public.usage_events (workspace_id, subject, created_at DESC)
    WHERE subject <> '';

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- Same tenancy rule as every other table (migration 001's is_workspace_member).
-- Instrumentation is not a reason to widen access to a workspace's behaviour.
DROP POLICY IF EXISTS "usage_events_workspace_member" ON public.usage_events;
CREATE POLICY "usage_events_workspace_member" ON public.usage_events
    FOR ALL
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

NOTIFY pgrst, 'reload schema';
