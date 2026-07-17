-- 026_outreach_attribution
--
-- Real outreach attribution: the send engine already records sent/replied/meeting
-- per prospect with a true campaign link (sequences.campaign_id), but nothing
-- surfaced it. This view aggregates those events per sequence (carrying campaign_id)
-- so measurementService can snapshot them into campaign_metrics as provider:'outreach'
-- — the same extension pattern AEO uses. No table changes (campaign_metrics.metrics
-- is free JSONB).
--
-- security_invoker=on (PG15+): the view runs with the querying user's rights, so the
-- base tables' RLS (is_workspace_member) scopes every row. Child tables are
-- pre-aggregated in subqueries to avoid join fan-out inflating the counts.
--
-- Safe to run repeatedly.

CREATE OR REPLACE VIEW public.v_outreach_sequence_metrics
WITH (security_invoker = on) AS
SELECT
    s.workspace_id,
    s.id            AS sequence_id,
    s.campaign_id,
    s.name,
    COALESCE(en.enrolled, 0) AS enrolled,
    COALESCE(en.meetings, 0) AS meetings,
    COALESCE(ms.sent, 0)     AS sent,
    COALESCE(rp.replied, 0)  AS replied
FROM public.sequences s
LEFT JOIN (
    SELECT sequence_id,
           count(*)                               AS enrolled,
           count(*) FILTER (WHERE status = 'meeting') AS meetings
    FROM public.enrollments
    GROUP BY sequence_id
) en ON en.sequence_id = s.id
LEFT JOIN (
    SELECT sequence_id, count(*) AS sent
    FROM public.messages
    WHERE status = 'sent'
    GROUP BY sequence_id
) ms ON ms.sequence_id = s.id
LEFT JOIN (
    SELECT e.sequence_id, count(*) AS replied
    FROM public.replies r
    JOIN public.enrollments e ON e.id = r.enrollment_id
    WHERE r.kind = 'reply'
    GROUP BY e.sequence_id
) rp ON rp.sequence_id = s.id;

GRANT SELECT ON public.v_outreach_sequence_metrics TO authenticated;

-- Reverse-join for closed-loop revenue: which campaign a Zoho contact belongs to,
-- via the prospect we sent to (prospects.meta.zohoContactId, stamped by the
-- scheduler on first send) -> enrollment -> sequence.campaign_id. Lets us attribute
-- a won Deal (which references a Contact) back to its campaign WITHOUT string
-- matching. DISTINCT because a prospect may be enrolled in several sequences.
CREATE OR REPLACE VIEW public.v_prospect_campaigns
WITH (security_invoker = on) AS
SELECT DISTINCT
    p.workspace_id,
    (p.meta->>'zohoContactId') AS zoho_contact_id,
    s.campaign_id
FROM public.prospects p
JOIN public.enrollments e ON e.prospect_id = p.id
JOIN public.sequences s ON s.id = e.sequence_id
WHERE COALESCE(p.meta->>'zohoContactId', '') <> ''
  AND s.campaign_id IS NOT NULL;

GRANT SELECT ON public.v_prospect_campaigns TO authenticated;

NOTIFY pgrst, 'reload schema';
