-- KEPLER OS — Brand Intelligence population + structured color identity
-- Adds JSONB fields for color identity, business details, provenance, and suggestions.

-- ── brand_profiles extensions ─────────────────────────────────────────────────
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS color_identity JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS business_details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS field_provenance JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS population_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ── workspace_files extensions ────────────────────────────────────────────────
ALTER TABLE public.workspace_files ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE public.workspace_files ADD COLUMN IF NOT EXISTS extracted_text TEXT;
ALTER TABLE public.workspace_files ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'upload';

-- ── brand suggestions (competitors / ICPs pending review) ─────────────────────
CREATE TABLE IF NOT EXISTS public.brand_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('competitor', 'icp')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    origin TEXT NOT NULL DEFAULT 'ai',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_suggestions_workspace_status_idx
    ON public.brand_suggestions (workspace_id, status);

ALTER TABLE public.brand_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand_suggestions_workspace_member" ON public.brand_suggestions;
CREATE POLICY "brand_suggestions_workspace_member" ON public.brand_suggestions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = brand_suggestions.workspace_id AND wm.user_id = auth.uid()
        )
    );

NOTIFY pgrst, 'reload schema';
