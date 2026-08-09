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
