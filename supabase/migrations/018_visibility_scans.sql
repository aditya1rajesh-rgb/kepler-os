-- 018_visibility_scans
--
-- AEO / AI-visibility measurement (the V2 wedge). Each row is one buyer PROMPT
-- asked of one AI SURFACE (Perplexity / ChatGPT / Claude / Google AI Overviews)
-- at a point in time, with whether THIS brand — and each confirmed competitor —
-- was mentioned or cited in the answer. Rows are grouped by scan_run_id so a
-- daily run reads/reports as one unit, and roll up into a share-of-voice reading
-- that snapshots into campaign_metrics(provider='aeo') as a measured channel.
--
-- Provider answers arrive from the credential-free stub today (status='stub')
-- and from the live `visibility-scanner` edge function once keys are provisioned
-- (status='ok'). status='mock' is a clearly-labelled local test affordance and
-- is NEVER snapshotted as real measurement.
--
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS public.visibility_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    -- Groups every (prompt × surface) row from a single scan into one run.
    scan_run_id UUID NOT NULL,
    -- The buyer question asked, plus a stable hash for dedupe / trend grouping.
    prompt TEXT NOT NULL,
    prompt_hash TEXT NOT NULL DEFAULT '',
    -- Which AI surface answered: 'perplexity' | 'openai' | 'anthropic' | 'google-aio'.
    surface TEXT NOT NULL,
    -- Raw answer text. NULL when the surface was unconfigured (a stub row).
    answer TEXT,
    -- Did the answer mention / cite THIS brand?
    brand_mentioned BOOLEAN NOT NULL DEFAULT false,
    brand_cited BOOLEAN NOT NULL DEFAULT false,
    -- Confirmed-competitor presence: [{ name, mentioned, cited }].
    competitor_mentions JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Citation URLs / domains the answer referenced: [string].
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Brand sentiment when mentioned: 'positive' | 'neutral' | 'negative' | NULL.
    sentiment TEXT,
    -- 'ok' (live) | 'stub' (no key yet) | 'mock' (labelled test) | 'error'.
    status TEXT NOT NULL DEFAULT 'stub',
    error TEXT,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visibility_scans_ws_idx
    ON public.visibility_scans (workspace_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS visibility_scans_run_idx
    ON public.visibility_scans (workspace_id, scan_run_id);

ALTER TABLE public.visibility_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visibility_scans_workspace_member" ON public.visibility_scans;
CREATE POLICY "visibility_scans_workspace_member" ON public.visibility_scans
    FOR ALL
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

NOTIFY pgrst, 'reload schema';
