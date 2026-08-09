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
