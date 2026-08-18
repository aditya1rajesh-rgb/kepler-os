-- ═══════════════════════════════════════════════════════════════════════════
-- KEPLER · pending migrations 027–035, for MANUAL application
--
-- Generated because the `staging-backend` Action has failed every run since
-- 2026-08-04 on an expired SUPABASE_ACCESS_TOKEN, so nothing here has reached
-- the database. Symptom: Goals renders
--     PGRST205 · Could not find the table 'public.goals' in the schema cache
--
-- HOW TO RUN: paste into the Supabase SQL Editor and run. Every statement is
-- idempotent (CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- DROP POLICY IF EXISTS then CREATE POLICY), so re-running is safe and applying
-- an already-applied migration is a no-op. Nothing here drops a table, drops a
-- column, truncates, or deletes a row.
--
-- PART 1 is the schema, and is all Goals needs. Run it and Goals works.
-- PART 2 is two pg_cron schedules. They POST to edge functions that are ALSO
--        undeployed (the same Action deploys those), so those jobs will 404
--        daily until the functions ship. Skip Part 2 unless you want the
--        schedules in place now.
-- PART 3 records these versions in Supabase's own migration history, so that
--        when the token is fixed `supabase db push` does not try to replay them.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  PART 1 · SCHEMA — this is what Goals needs                           ║
-- ╚═══════════════════════════════════════════════════════════════════════╝


-- ─────────────────────────────────────────────────────────────────────────
-- 027_workspace_events.sql
-- ─────────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────────
-- 029_prospect_enrichment.sql
-- ─────────────────────────────────────────────────────────────────────────

-- 029_prospect_enrichment
--
-- Apollo email/phone enrichment for prospects. Search returns no emails/phones
-- (a separate, credit-based Apollo call reveals them), so these fill in when the
-- user enriches a list. `email` already exists (015); add `phone` + a timestamp of
-- the last successful reveal. Enrichment writes are done client-side via
-- prospectsService.updateEnrichment after the connector-proxy `enrich` action
-- returns; no RLS change (inherits the prospects policies).
--
-- Safe to run repeatedly.

ALTER TABLE public.prospects
    ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';

ALTER TABLE public.prospects
    ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';


-- ─────────────────────────────────────────────────────────────────────────
-- 030_sequence_hold_signal.sql
-- ─────────────────────────────────────────────────────────────────────────

-- 030_sequence_hold_signal
--
-- E1 · The silent stop, made visible.
--
-- Editing a sendable sequence trips sequences_guard_approval (022): status is
-- knocked back to 'draft' and the approval stamp cleared. send-scheduler then
-- HOLDS every enrollment on it — core.ts decide() returns 'hold' for any status
-- outside (approved, scheduled, active) — pushing next_send_at forward 30
-- minutes at a time, indefinitely. Outreach stops.
--
-- Nothing recorded that any of this happened. The demotion destroyed its own
-- evidence: it overwrote the status it fell from and cleared approved_by /
-- approved_at, so a held sequence and a never-approved draft became the same
-- row. No screen could say that sending had stopped, when, who caused it, or
-- how many sends were waiting. The invariant (no send without approval) is
-- correct and stays; what was missing was the signal.
--
-- Two records, one per side of the stop:
--   sequences.held_*    — WHY the sequence stopped being sendable, and who
--   enrollments.hold_*  — that the scheduler actually held this send, and since when
--
-- The second is deliberately written by the scheduler rather than inferred by
-- the UI from sequence status: a hold is something that happened, and the count
-- shown to an operator should come from the thing that did it.
--
-- Safe to run repeatedly.

-- ─── The sequence side: what it fell from ────────────────────────────────────

ALTER TABLE public.sequences
    ADD COLUMN IF NOT EXISTS held_from_status TEXT NOT NULL DEFAULT '';

ALTER TABLE public.sequences
    ADD COLUMN IF NOT EXISTS held_at TIMESTAMPTZ;

ALTER TABLE public.sequences
    ADD COLUMN IF NOT EXISTS held_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sequences.held_from_status IS
    'E1: the sendable status this sequence was demoted FROM by an edit. Empty '
    'means it is a genuine draft that has never been approved — the distinction '
    'the UI could not previously make.';

-- ─── The enrollment side: that a send was actually held ──────────────────────

ALTER TABLE public.enrollments
    ADD COLUMN IF NOT EXISTS hold_reason TEXT NOT NULL DEFAULT '';

ALTER TABLE public.enrollments
    ADD COLUMN IF NOT EXISTS held_since TIMESTAMPTZ;

COMMENT ON COLUMN public.enrollments.held_since IS
    'E1: when the CURRENT hold began — set on the first hold and preserved '
    'across subsequent 30-minute re-holds, so "held for 3 days" is answerable. '
    'Cleared on the next successful send.';

-- ─── The trigger: record the demotion instead of silently applying it ────────

CREATE OR REPLACE FUNCTION public.sequences_guard_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (NEW.steps IS DISTINCT FROM OLD.steps
        OR NEW.mode IS DISTINCT FROM OLD.mode
        OR NEW.channel IS DISTINCT FROM OLD.channel
        OR NEW.sending_domain_id IS DISTINCT FROM OLD.sending_domain_id)
       AND OLD.status IN ('approved', 'scheduled', 'active', 'paused')
       AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        NEW.status := 'draft';
        NEW.approved_by := NULL;
        NEW.approved_at := NULL;

        -- E1: the demotion now leaves a trace. Keep the FIRST fall — re-editing
        -- an already-held sequence must not rewrite it to 'draft', which would
        -- lose the fact that it was live when the operator first broke it.
        IF OLD.held_from_status = '' THEN
            NEW.held_from_status := OLD.status;
        END IF;
        NEW.held_at := now();
        NEW.held_by := COALESCE(auth.uid(), OLD.held_by);

        -- Only 'active' and 'scheduled' had sends in flight; 'approved' and
        -- 'paused' were not sending anyway, so this is not a stop for them.
        IF OLD.status IN ('active', 'scheduled') THEN
            INSERT INTO public.workspace_events (workspace_id, actor_id, kind, title, entity_type, entity_id, meta)
            VALUES (
                NEW.workspace_id,
                auth.uid(),
                'sequence.needs_reapproval',
                COALESCE(NULLIF(NEW.name, ''), 'Sequence') || ' stopped sending — edited copy needs approval',
                'sequence',
                NEW.id,
                jsonb_build_object('heldFromStatus', OLD.status)
            );
        END IF;
    END IF;

    IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
        -- Approving edited content in the same statement is still an approval
        -- of what's in NEW — stamp it.
        NEW.approved_by := COALESCE(auth.uid(), NEW.approved_by);
        NEW.approved_at := now();
        -- Re-approval resolves the hold: the sequence is sendable again and is
        -- no longer "was active, now stopped".
        NEW.held_from_status := '';
        NEW.held_at := NULL;
        NEW.held_by := NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sequences_guard_approval ON public.sequences;
CREATE TRIGGER sequences_guard_approval
    BEFORE UPDATE ON public.sequences
    FOR EACH ROW EXECUTE FUNCTION public.sequences_guard_approval();

NOTIFY pgrst, 'reload schema';


-- ─────────────────────────────────────────────────────────────────────────
-- 031_usage_events.sql
-- ─────────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────────
-- 032_goals.sql
-- ─────────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────────
-- 033_change_events.sql
-- ─────────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────────
-- 035_change_events_goal_kind.sql
-- ─────────────────────────────────────────────────────────────────────────

-- 035_change_events_goal_kind
--
-- E10 · the continuous half. A goal's STANDING changing — on track slipping to
-- behind — is a change like any other, and it is the one the roadmap cares most
-- about: "the goal actively asks for work" only works if a goal that starts
-- slipping reaches the user without being visited.
--
-- So `change_events.kind` gains 'goal'. Widening a CHECK rather than editing
-- 033: 033 may already be applied somewhere by the time this lands, and a
-- migration that has run is not a file you edit.
--
-- Safe to run repeatedly.

ALTER TABLE public.change_events
    DROP CONSTRAINT IF EXISTS change_events_kind_check;

ALTER TABLE public.change_events
    ADD CONSTRAINT change_events_kind_check
    CHECK (kind IN ('metric', 'search', 'visibility', 'outreach', 'goal'));

-- The subject of a goal event is the goal, so the campaign column stays NULL and
-- the goal is carried in `evidence.goalId`. No goal_id column, for the reason
-- 033 gives: a denormalised parent that nothing maintains goes stale silently.

NOTIFY pgrst, 'reload schema';


COMMIT;

-- PostgREST caches the schema. Without this reload the new tables exist but the
-- API still answers PGRST205 - which is the exact error that started this.
NOTIFY pgrst, 'reload schema';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  PART 2 · CRON SCHEDULES — optional, and inert until the functions ship    ║
-- ║                                                                           ║
-- ║  Both jobs read Vault secrets `project_url` and `scheduler_secret`, and    ║
-- ║  POST to edge functions (metrics-snapshot, detector-run) that the same     ║
-- ║  failed Action deploys. Scheduling succeeds regardless - the body is only  ║
-- ║  evaluated when the job fires - so a missing secret or function shows up   ║
-- ║  as a failing daily job, not as an error here.                             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝


-- ─────────────────────────────────────────────────────────────────────────
-- 028_metrics_snapshot_cron.sql
-- ─────────────────────────────────────────────────────────────────────────

-- 028_metrics_snapshot_cron
--
-- Daily campaign_metrics history accrual: pg_cron → pg_net → metrics-snapshot edge
-- function. Until now snapshots only accrued on a manual "Refresh"/"Pull latest",
-- so period-over-period trends and the dashboard chart had no history to draw on.
-- This job writes one snapshot per connected workspace per day (GA4 + GSC + Outreach),
-- which is what makes the Dashboard's "vs last month" deltas and the Lead Conversion
-- chart fill in on their own.
--
-- Runs at 05:00 UTC — after GSC's ~3-day-lagged data has settled for the day. The
-- function's per-day idempotency guard makes a re-run a no-op.
--
-- PREREQUISITES (reuses the send-scheduler Vault entries from migration 023 — no new
-- one-time setup if those are already provisioned):
--   * Vault secret 'project_url'      = https://<project-ref>.supabase.co
--   * Vault secret 'scheduler_secret' = the SCHEDULER_SECRET edge secret
--   * Deploy the function first:  supabase functions deploy metrics-snapshot
--     (until then pg_net posts 404 harmlessly; no history accrues).
--
-- Safe to run repeatedly (unschedule-if-exists, then schedule).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kepler-metrics-snapshot') THEN
        PERFORM cron.unschedule('kepler-metrics-snapshot');
    END IF;
END;
$$;

SELECT cron.schedule(
    'kepler-metrics-snapshot',
    '0 5 * * *',
    $$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
               || '/functions/v1/metrics-snapshot',
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

-- ─────────────────────────────────────────────────────────────────────────
-- 034_detector_run_cron.sql
-- ─────────────────────────────────────────────────────────────────────────

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


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  PART 3 · RECORD IN MIGRATION HISTORY                                     ║
-- ║                                                                           ║
-- ║  Manual SQL-Editor runs do not update Supabase's migration ledger, so the ║
-- ║  CLI would replay all nine on the next successful `db push`. They are      ║
-- ║  idempotent so a replay is harmless, but the ledger should still be true.  ║
-- ║                                                                           ║
-- ║  If you ran only PART 1, delete the 028 and 034 rows below before running  ║
-- ║  this - otherwise the ledger claims the crons are in place when they are   ║
-- ║  not, and `db push` will never add them.                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES
    ('027', 'workspace_events'),
    ('028', 'metrics_snapshot_cron'),
    ('029', 'prospect_enrichment'),
    ('030', 'sequence_hold_signal'),
    ('031', 'usage_events'),
    ('032', 'goals'),
    ('033', 'change_events'),
    ('034', 'detector_run_cron'),
    ('035', 'change_events_goal_kind')
ON CONFLICT (version) DO NOTHING;

