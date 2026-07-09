-- KEPLER OS — Brand suggestions table reconciliation
-- Ensures public.brand_suggestions exists for Brand Intelligence suggestion flows.
-- Safe to run repeatedly.

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
            WHERE wm.workspace_id = brand_suggestions.workspace_id
              AND wm.user_id = auth.uid()
        )
    );

NOTIFY pgrst, 'reload schema';
