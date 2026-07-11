-- 020_data_deletion_requests
--
-- Audit + status trail for platform-initiated data-deletion callbacks (Meta's
-- Data Deletion Callback, and reusable for any provider). When a user removes
-- Kepler from Facebook/Instagram, Meta POSTs a signed request to our
-- meta-callbacks edge function; we record the request here, delete the user's
-- stored data, and hand back a confirmation code + status URL (the public
-- /data-deletion page reads this table by code, via the edge function).
--
-- Locked down: RLS on with NO policies, so only the service role (edge
-- functions) can read/write. Rows are keyed to an external provider user id,
-- not a Kepler workspace, so workspace RLS doesn't apply.
--
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS public.data_deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Confirmation code shown to the user + used to look up status.
    code TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'meta',
    -- The provider's app-scoped user id (e.g. Meta ASID) the deletion targets.
    external_user_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS data_deletion_requests_ext_idx
    ON public.data_deletion_requests (provider, external_user_id);

ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: authenticated/anon get nothing; service role bypasses.

NOTIFY pgrst, 'reload schema';
