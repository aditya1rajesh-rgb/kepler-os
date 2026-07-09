-- KEPLER OS — File Intelligence active analysis surface
-- Adds safe metadata columns for derived file insights + analysis controls.

ALTER TABLE public.workspace_files
    ADD COLUMN IF NOT EXISTS included_in_analysis BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.workspace_files
    ADD COLUMN IF NOT EXISTS analysis_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.workspace_files
    ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
