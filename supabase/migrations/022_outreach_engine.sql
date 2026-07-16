-- 022_outreach_engine
--
-- R1a: the outreach EXECUTION layer (ROADMAP-HANDOFF §9.1). Promotes generated
-- sequences to first-class executable objects and adds the tables the
-- send-scheduler / inbox-monitor edge functions operate on.
--
-- Invariants enforced HERE (DB-level, not UI promises):
--   * Approval is stamped server-side (approver + timestamp) on the transition
--     to 'approved'; editing step content on an approved/scheduled/active
--     sequence resets it to 'draft' (E1.2).
--   * `messages` and `replies` are written ONLY by the service role inside edge
--     functions — client roles get SELECT (plus manual-reply INSERT on replies).
--     A send without a message row is a bug class; a client-forged message row
--     is impossible.
--   * `suppression_list` is append-only for clients: INSERT (manual suppress) +
--     SELECT, never UPDATE/DELETE — suppression is permanent (D9).
--
-- `sending_domains` ships now (schema-complete for R1b) so the scheduler's
-- cold-lane gate is real from day one: with no verified domain rows, cold mode
-- simply cannot send.
--
-- Safe to run repeatedly.

-- ─── sending_domains (E6 backbone; created first for FKs) ─────────────────────
CREATE TABLE IF NOT EXISTS public.sending_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'verified', 'failed', 'paused')),
    -- {spf:{pass,detail}, dkim:{...}, dmarc:{...}} written by the (R1b) verifier.
    auth JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_checked_at TIMESTAMPTZ,
    warmup_started_at TIMESTAMPTZ,
    daily_cap INTEGER NOT NULL DEFAULT 10,
    sent_today INTEGER NOT NULL DEFAULT 0,
    sent_today_date DATE,
    complaint_rate NUMERIC NOT NULL DEFAULT 0,
    bounce_rate NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sending_domains_ws_domain_uidx
    ON public.sending_domains (workspace_id, lower(domain));

ALTER TABLE public.sending_domains ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sending_domains_workspace_member" ON public.sending_domains;
CREATE POLICY "sending_domains_workspace_member" ON public.sending_domains
    FOR ALL
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

-- Clients may add/see domains but never self-certify: status + auth results are
-- server-written (the verifier edge fn, R1b). Hide those columns from writes.
REVOKE ALL ON public.sending_domains FROM anon, authenticated;
GRANT SELECT ON public.sending_domains TO authenticated;
GRANT INSERT (workspace_id, domain) ON public.sending_domains TO authenticated;
GRANT DELETE ON public.sending_domains TO authenticated;

DROP TRIGGER IF EXISTS sending_domains_updated_at ON public.sending_domains;
CREATE TRIGGER sending_domains_updated_at
    BEFORE UPDATE ON public.sending_domains
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── sequences (executable objects; E1.2 approval gate) ───────────────────────
CREATE TABLE IF NOT EXISTS public.sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
    -- Provenance link back to the saved generation payload (content_items row).
    content_item_id UUID REFERENCES public.content_items(id) ON DELETE SET NULL,
    name TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
    mode TEXT NOT NULL DEFAULT 'warm' CHECK (mode IN ('warm', 'cold')),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'approved', 'scheduled', 'active', 'paused', 'archived')),
    -- [{idx, dayOffset, subject, body, cta}] — email-only in R1a.
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Send window: {tz:'Asia/Kolkata', days:[1..5], startHour:9, endHour:17}
    -- (days: 0=Sun..6=Sat). Captured from the operator's browser at approval.
    send_window JSONB NOT NULL DEFAULT '{}'::jsonb,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    sending_domain_id UUID REFERENCES public.sending_domains(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sequences_workspace_idx
    ON public.sequences (workspace_id, created_at DESC);

ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sequences_workspace_member" ON public.sequences;
CREATE POLICY "sequences_workspace_member" ON public.sequences
    FOR ALL
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

DROP TRIGGER IF EXISTS sequences_updated_at ON public.sequences;
CREATE TRIGGER sequences_updated_at
    BEFORE UPDATE ON public.sequences
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- E1.2 server enforcement:
--   1. Content edits (steps/mode/channel/domain) on an approved-or-later
--      sequence knock it back to 'draft' and clear the approval stamp.
--   2. The transition INTO 'approved' stamps approver (auth.uid() when a user
--      did it) + timestamp, regardless of what the client sent.
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
    END IF;

    IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
        -- Approving edited content in the same statement is still an approval
        -- of what's in NEW — stamp it.
        NEW.approved_by := COALESCE(auth.uid(), NEW.approved_by);
        NEW.approved_at := now();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sequences_guard_approval ON public.sequences;
CREATE TRIGGER sequences_guard_approval
    BEFORE UPDATE ON public.sequences
    FOR EACH ROW EXECUTE FUNCTION public.sequences_guard_approval();

-- ─── enrollments (one prospect × one sequence; the scheduler's queue) ─────────
CREATE TABLE IF NOT EXISTS public.enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    sequence_id UUID NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
    prospect_id UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'completed', 'stopped_reply',
                          'stopped_unsub', 'stopped_bounce', 'suppressed', 'meeting')),
    -- Index into sequences.steps of the NEXT step to send (0-based).
    current_step INTEGER NOT NULL DEFAULT 0,
    -- The scheduler's work-queue key: due when next_send_at <= now() AND active.
    next_send_at TIMESTAMPTZ,
    stop_reason TEXT NOT NULL DEFAULT '',
    meeting_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sequence_id, prospect_id)
);

CREATE INDEX IF NOT EXISTS enrollments_due_idx
    ON public.enrollments (status, next_send_at)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS enrollments_workspace_idx
    ON public.enrollments (workspace_id, created_at DESC);

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "enrollments_workspace_member" ON public.enrollments;
CREATE POLICY "enrollments_workspace_member" ON public.enrollments
    FOR ALL
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

DROP TRIGGER IF EXISTS enrollments_updated_at ON public.enrollments;
CREATE TRIGGER enrollments_updated_at
    BEFORE UPDATE ON public.enrollments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── messages (the join spine of the moat — E1.4) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    enrollment_id UUID NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
    prospect_id UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
    sequence_id UUID NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
    step_idx INTEGER NOT NULL,
    send_path TEXT NOT NULL
        CHECK (send_path IN ('crm_zoho', 'crm_hubspot', 'cold_domain', 'gmail')),
    sending_domain_id UUID REFERENCES public.sending_domains(id) ON DELETE SET NULL,
    provider_message_id TEXT NOT NULL DEFAULT '',
    -- Resolved subject at send time (body copy lives on sequences.steps[step_idx]).
    subject TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'sent', 'failed', 'bounced')),
    error TEXT NOT NULL DEFAULT '',
    attempt INTEGER NOT NULL DEFAULT 1,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency key: one message row per enrollment step. A crashed scheduler run
-- can never double-send — the second claim hits this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS messages_enrollment_step_uidx
    ON public.messages (enrollment_id, step_idx);
CREATE INDEX IF NOT EXISTS messages_workspace_sent_idx
    ON public.messages (workspace_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS messages_prospect_idx
    ON public.messages (prospect_id, sent_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_select_member" ON public.messages;
CREATE POLICY "messages_select_member" ON public.messages
    FOR SELECT
    USING (public.is_workspace_member(workspace_id));

-- Server-write-only: the browser can read the log, never write it.
REVOKE ALL ON public.messages FROM anon, authenticated;
GRANT SELECT ON public.messages TO authenticated;

DROP TRIGGER IF EXISTS messages_updated_at ON public.messages;
CREATE TRIGGER messages_updated_at
    BEFORE UPDATE ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── replies (E3 landing zone) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    prospect_id UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
    enrollment_id UUID REFERENCES public.enrollments(id) ON DELETE SET NULL,
    message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('reply', 'ooo', 'bounce', 'unsub')),
    -- Where it came from: 'zoho_poll' (inbox-monitor) or 'manual' (operator
    -- marked "replied elsewhere", e.g. a phone call — E2.2).
    source TEXT NOT NULL DEFAULT 'zoho_poll' CHECK (source IN ('zoho_poll', 'manual')),
    raw_snippet TEXT NOT NULL DEFAULT '',
    -- R2: 'meeting' | 'interested' | 'negative' | 'auto' (ai-proxy classify).
    classified TEXT NOT NULL DEFAULT '',
    -- Provider-side id of the polled email — dedupe so a re-poll never
    -- re-fires stop transitions.
    provider_email_id TEXT NOT NULL DEFAULT '',
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS replies_provider_email_uidx
    ON public.replies (workspace_id, provider_email_id)
    WHERE provider_email_id <> '';
CREATE INDEX IF NOT EXISTS replies_workspace_idx
    ON public.replies (workspace_id, received_at DESC);

ALTER TABLE public.replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "replies_select_member" ON public.replies;
CREATE POLICY "replies_select_member" ON public.replies
    FOR SELECT
    USING (public.is_workspace_member(workspace_id));
-- Manual "replied elsewhere" capture is the ONLY client write; polled rows come
-- from the service role.
DROP POLICY IF EXISTS "replies_insert_manual" ON public.replies;
CREATE POLICY "replies_insert_manual" ON public.replies
    FOR INSERT
    WITH CHECK (public.is_workspace_member(workspace_id) AND source = 'manual');

REVOKE ALL ON public.replies FROM anon, authenticated;
GRANT SELECT ON public.replies TO authenticated;
GRANT INSERT (workspace_id, prospect_id, enrollment_id, message_id, kind, source,
              raw_snippet, received_at)
    ON public.replies TO authenticated;

-- ─── suppression_list (D9: send-time law, permanent) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.suppression_list (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('unsub', 'hard_bounce', 'complaint', 'manual')),
    source_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Emails are normalized (lower/trim) by trigger so the plain unique index is
-- case-insensitive in effect AND usable by ON CONFLICT inference (the
-- inbox-monitor upserts hard bounces against it).
CREATE OR REPLACE FUNCTION public.suppression_normalize_email()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.email := lower(trim(NEW.email));
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS suppression_normalize_email ON public.suppression_list;
CREATE TRIGGER suppression_normalize_email
    BEFORE INSERT ON public.suppression_list
    FOR EACH ROW EXECUTE FUNCTION public.suppression_normalize_email();

-- Per-workspace (workspace = brand = legal entity — O7).
CREATE UNIQUE INDEX IF NOT EXISTS suppression_ws_email_uidx
    ON public.suppression_list (workspace_id, email);

ALTER TABLE public.suppression_list ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppression_select_member" ON public.suppression_list;
CREATE POLICY "suppression_select_member" ON public.suppression_list
    FOR SELECT
    USING (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS "suppression_insert_member" ON public.suppression_list;
CREATE POLICY "suppression_insert_member" ON public.suppression_list
    FOR INSERT
    WITH CHECK (public.is_workspace_member(workspace_id));

-- Append-only for clients: suppression is permanent. No UPDATE, no DELETE.
REVOKE ALL ON public.suppression_list FROM anon, authenticated;
GRANT SELECT ON public.suppression_list TO authenticated;
GRANT INSERT (workspace_id, email, reason, source_message_id)
    ON public.suppression_list TO authenticated;

NOTIFY pgrst, 'reload schema';
