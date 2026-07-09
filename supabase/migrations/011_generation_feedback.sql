-- 011_generation_feedback
--
-- Stores user ratings on AI-generated outputs so the platform can learn. A
-- 5-star rating per output; ratings under 3 carry an improvement note. The
-- generation services read recent low-rated notes for a module and inject them
-- into the next prompt (see feedbackService.getGuidance).
--
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS public.generation_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    -- Which generator the feedback is about: 'blog' | 'ads' | 'outreach' | 'social' | ...
    module TEXT NOT NULL,
    -- Optional sub-context (platform, angle, flow type) so guidance can be scoped.
    label TEXT NOT NULL DEFAULT '',
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    improvement TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generation_feedback_workspace_module_idx
    ON public.generation_feedback (workspace_id, module, created_at DESC);

ALTER TABLE public.generation_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "generation_feedback_workspace_member" ON public.generation_feedback;
CREATE POLICY "generation_feedback_workspace_member" ON public.generation_feedback
    FOR ALL
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

NOTIFY pgrst, 'reload schema';
