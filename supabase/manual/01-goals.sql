-- ═══════════════════════════════════════════════════════════════════════════
-- KEPLER · migration 032 — the goals tables. THIS IS THE GOALS FIX.
--
--   ►►► RUN THIS AGAINST PROJECT  dtqmgpznbomafrzptfca  ◄◄◄
--
--   Check your address bar: supabase.com/dashboard/project/dtqmgpznbomafrzptfca/sql
--
--   This matters more than anything else in this file. There are TWO Kepler
--   projects and they have diverged:
--     dtqmgpznbomafrzptfca  ← the DEPLOYED app queries this one. Missing 029-035.
--     risoupsjfwnpawjltywh  ← your .env.local. Already fully migrated.
--   The earlier attempts applied cleanly to the second one, which is why the
--   SQL kept "working" while the live screen kept failing.
--
-- Each migration is its own transaction, so one failure cannot discard the rest
-- and Postgres names the statement that broke. Everything is idempotent
-- (CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, DROP POLICY IF EXISTS then
-- CREATE POLICY): re-running is safe, and an already-applied migration is a
-- no-op. Nothing drops a table, drops a column, truncates, or deletes a row.
--
-- The LAST statement prints a pass/fail table. Read it - that is the confirmation
-- that was missing from the earlier attempts.
-- ═══════════════════════════════════════════════════════════════════════════


-- ┌───────────────────────────────────────────────────────────────────────┐
-- │  032_goals.sql
-- └───────────────────────────────────────────────────────────────────────┘
BEGIN;

-- 032_goals
--
-- E2 · the spine. Roadmap S1.
--
-- The whole thesis of the roadmap in one table: generated assets are orphans.
-- `content_items.campaign_id → campaigns → campaign_metrics` already carries
-- outcomes UPWARD for reporting (migrations 012 and 017). Two rungs were
-- missing — one above, one below. This is the one above.
--
-- Before this, `goal` existed only as a free-text column on campaigns (012:19).
-- Nothing persisted across campaigns, so nothing could accumulate toward a
-- target, and no asset could say what it was for.
--
-- TWO KINDS, per the roadmap's standing principle "structure is universal, math
-- is conditional":
--   * measured    — bound to a funnel measure Kepler can read. Gets baseline,
--                   forecast, progress, feasibility.
--   * directional — free text ("own the NAAC conversation"). Gets checkpoints
--                   the user defines and marks off.
-- BOTH organise real work and both take campaigns. Only measured goals get math,
-- and the UI says which is which. A directional goal can gain a measure later and
-- become measured, keeping its campaigns and history — hence one table, not two.
--
-- Safe to run repeatedly.

-- ─── goals ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',

    kind TEXT NOT NULL DEFAULT 'directional'
        CHECK (kind IN ('measured', 'directional')),

    -- NULL for directional goals. One of the measures in src/lib/goalFeasibility.js
    -- (sessions, conversions, crmRecords, meetings, revenue, shareOfVoice) — kept
    -- as TEXT rather than an enum so adding a measure is a code change, not a
    -- migration on a table that will be large.
    measure TEXT,
    target NUMERIC,

    -- What the measure read when the goal was set. Progress is target-minus-
    -- baseline, not the raw total, or a goal set mid-quarter starts at 60%.
    baseline JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- The rates and window the target was judged against at creation. Kept so the
    -- goal can say WHY it was thought reachable, months later, when the rates have
    -- moved — a forecast whose basis is invisible cannot be argued with.
    feasibility_basis JSONB NOT NULL DEFAULT '{}'::jsonb,

    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    -- Goals RESOLVE. Not a rolling horizon — a goal without an end never fails,
    -- and a target that cannot fail is not a target.
    end_date DATE NOT NULL,

    is_primary BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'achieved', 'missed', 'archived')),

    created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- A measured goal without a measure and target is just a directional goal
    -- wearing the wrong label; the constraint stops the two kinds blurring.
    CONSTRAINT goals_measured_needs_target
        CHECK (kind <> 'measured' OR (measure IS NOT NULL AND target IS NOT NULL)),
    CONSTRAINT goals_end_after_start CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS goals_workspace_idx
    ON public.goals (workspace_id, status, end_date);

-- Exactly one primary goal per workspace — it is the cockpit's hero (E5), and
-- two heroes is a bug the UI cannot resolve.
CREATE UNIQUE INDEX IF NOT EXISTS goals_one_primary_per_workspace
    ON public.goals (workspace_id)
    WHERE is_primary AND status = 'active';

-- ─── goal_checkpoints — how a DIRECTIONAL goal shows progress ────────────────
CREATE TABLE IF NOT EXISTS public.goal_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    done_at TIMESTAMPTZ,
    done_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS goal_checkpoints_goal_idx
    ON public.goal_checkpoints (goal_id, position);

-- ─── goal_target_history — a moved goalpost is a fact, not an edit ───────────
-- Without this, lowering a target silently turns a miss into a hit. The history
-- makes the change visible without blocking it (scaffold, not cage).
CREATE TABLE IF NOT EXISTS public.goal_target_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    target NUMERIC,
    previous_target NUMERIC,
    reason TEXT NOT NULL DEFAULT '',
    changed_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS goal_target_history_goal_idx
    ON public.goal_target_history (goal_id, changed_at DESC);

-- ─── goal_links — one parent, many links ─────────────────────────────────────
-- A campaign ladders to exactly ONE goal (campaigns.goal_id) so rollup maths is
-- unambiguous, but a launch serving both traffic and pipeline can be LINKED to
-- the second rather than being forced into a lie about which it serves.
CREATE TABLE IF NOT EXISTS public.goal_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    linked_type TEXT NOT NULL CHECK (linked_type IN ('goal', 'campaign')),
    linked_id UUID NOT NULL,
    relation TEXT NOT NULL DEFAULT 'supports',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (goal_id, linked_type, linked_id)
);

CREATE INDEX IF NOT EXISTS goal_links_goal_idx ON public.goal_links (goal_id);

-- ─── the ladder: campaigns hang off a goal ───────────────────────────────────
-- NULLable on purpose. Every campaign that exists today predates goals, and
-- forcing a parent would either invent one or block the migration. An unparented
-- campaign is a real state the UI names ("not laddered to a goal") rather than
-- a data error.
ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS campaigns_goal_idx ON public.campaigns (goal_id);

-- ─── RLS — same tenancy rule as every other table (migration 001) ────────────
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_target_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goals_workspace_member" ON public.goals;
CREATE POLICY "goals_workspace_member" ON public.goals
    FOR ALL USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "goal_checkpoints_workspace_member" ON public.goal_checkpoints;
CREATE POLICY "goal_checkpoints_workspace_member" ON public.goal_checkpoints
    FOR ALL USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "goal_target_history_workspace_member" ON public.goal_target_history;
CREATE POLICY "goal_target_history_workspace_member" ON public.goal_target_history
    FOR ALL USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "goal_links_workspace_member" ON public.goal_links;
CREATE POLICY "goal_links_workspace_member" ON public.goal_links
    FOR ALL USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

DROP TRIGGER IF EXISTS goals_updated_at ON public.goals;
CREATE TRIGGER goals_updated_at
    BEFORE UPDATE ON public.goals
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Record every target change automatically. Doing it in a trigger rather than
-- the client means a target cannot be moved without leaving a trace, whatever
-- path the write came from.
CREATE OR REPLACE FUNCTION public.goals_record_target_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.target IS DISTINCT FROM OLD.target THEN
        INSERT INTO public.goal_target_history (goal_id, workspace_id, target, previous_target, changed_by)
        VALUES (NEW.id, NEW.workspace_id, NEW.target, OLD.target, auth.uid());
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS goals_target_change ON public.goals;
CREATE TRIGGER goals_target_change
    AFTER UPDATE ON public.goals
    FOR EACH ROW EXECUTE FUNCTION public.goals_record_target_change();

NOTIFY pgrst, 'reload schema';

COMMIT;


-- PostgREST caches the schema. Without this the tables exist but the API keeps
-- answering PGRST205, which is the error on screen. Outside any transaction:
-- NOTIFY only fires on commit.
NOTIFY pgrst, 'reload schema';

-- ── DID IT WORK? Every row must say OK. ──────────────────────────────────
    SELECT 'goals' AS object,
           CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                             WHERE table_schema='public' AND table_name='goals')
                THEN 'OK' ELSE 'MISSING' END AS status
UNION ALL
    SELECT 'goal_checkpoints' AS object,
           CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                             WHERE table_schema='public' AND table_name='goal_checkpoints')
                THEN 'OK' ELSE 'MISSING' END AS status
UNION ALL
    SELECT 'goal_target_history' AS object,
           CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                             WHERE table_schema='public' AND table_name='goal_target_history')
                THEN 'OK' ELSE 'MISSING' END AS status
UNION ALL
    SELECT 'goal_links' AS object,
           CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                             WHERE table_schema='public' AND table_name='goal_links')
                THEN 'OK' ELSE 'MISSING' END AS status
UNION ALL
    SELECT 'campaigns.goal_id' AS object,
           CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                             WHERE table_schema='public' AND table_name='campaigns' AND column_name='goal_id')
                THEN 'OK' ELSE 'MISSING' END AS status
ORDER BY 1;

