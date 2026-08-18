-- ═══════════════════════════════════════════════════════════════════════════
-- KEPLER · the rest of the schema backlog (029, 030, 031, 033, 035)
--
-- WHY THIS EXISTS: the `staging-backend` Action has failed every run since
-- 2026-08-04 on an expired SUPABASE_ACCESS_TOKEN, so migrations 029-035 never
-- reached the database. (027 DID apply, on the last good run - verified: the
-- REST API answers 200 for public.workspace_events and 404 for public.goals.)
--
-- EACH MIGRATION IS ITS OWN TRANSACTION. The previous version of this script
-- wrapped all nine in one BEGIN/COMMIT, so a single error rolled back the entire
-- batch and nothing landed. Per-migration atomicity is also how `supabase db
-- push` behaves: if one fails, the ones before it stay applied and you get told
-- exactly which one broke.
--
-- Everything is idempotent - CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- DROP POLICY IF EXISTS then CREATE POLICY - so re-running is safe and an
-- already-applied migration is a no-op. Nothing drops a table, drops a column,
-- truncates, or deletes a row.
-- ═══════════════════════════════════════════════════════════════════════════


-- ┌───────────────────────────────────────────────────────────────────────┐
-- │  029_prospect_enrichment.sql
-- └───────────────────────────────────────────────────────────────────────┘
BEGIN;

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

COMMIT;

-- ┌───────────────────────────────────────────────────────────────────────┐
-- │  030_sequence_hold_signal.sql
-- └───────────────────────────────────────────────────────────────────────┘
BEGIN;

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

COMMIT;

-- ┌───────────────────────────────────────────────────────────────────────┐
-- │  031_usage_events.sql
-- └───────────────────────────────────────────────────────────────────────┘
BEGIN;

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

COMMIT;

-- ┌───────────────────────────────────────────────────────────────────────┐
-- │  033_change_events.sql
-- └───────────────────────────────────────────────────────────────────────┘
BEGIN;

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

COMMIT;

-- ┌───────────────────────────────────────────────────────────────────────┐
-- │  035_change_events_goal_kind.sql
-- └───────────────────────────────────────────────────────────────────────┘
BEGIN;

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


-- PostgREST caches the schema. Without this the tables exist but the API still
-- answers PGRST205 - which is the exact error on screen. Not inside a
-- transaction: NOTIFY only fires on commit.
NOTIFY pgrst, 'reload schema';

-- ── OPTIONAL · tell Supabase's migration ledger these are applied ────────────
-- Manual SQL-Editor runs do not update the ledger, so a future successful
-- `db push` would replay them. They are idempotent, so a replay is harmless -
-- run this only if you want the ledger accurate, and DELETE any row you did not
-- actually apply. If it errors (the table or the `name` column may not exist on
-- your CLI version), ignore it: it changes nothing about whether the app works.
--
-- INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
--     ('029','prospect_enrichment'), ('030','sequence_hold_signal'),
--     ('031','usage_events'),        ('032','goals'),
--     ('033','change_events'),       ('035','change_events_goal_kind')
-- ON CONFLICT (version) DO NOTHING;

