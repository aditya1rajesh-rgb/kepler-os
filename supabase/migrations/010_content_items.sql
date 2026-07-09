-- 010_content_items
--
-- Unified content pipeline backbone. One row = one content item moving through
-- the Queue → Generating → Completed board, shared across modules
-- (seo / social / ads / outreach). Keyword research seeds queue items; the blog
-- pipeline fills `payload` with the generated draft + scores on completion.
--
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS public.content_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    -- Which module the item belongs to.
    type TEXT NOT NULL DEFAULT 'seo' CHECK (type IN ('seo', 'social', 'ads', 'outreach')),
    -- Pipeline stage.
    status TEXT NOT NULL DEFAULT 'queue' CHECK (status IN ('queue', 'generating', 'completed', 'failed')),
    title TEXT NOT NULL DEFAULT '',
    target_keyword TEXT NOT NULL DEFAULT '',
    intent TEXT NOT NULL DEFAULT '',
    -- Free-form bag for stage-specific data: keyword metadata (tier, geo, cluster)
    -- on creation; generated brief/outline/draft/schema/scores on completion.
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- How the item was created (e.g. 'keyword-research', 'manual').
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_items_workspace_type_status_idx
    ON public.content_items (workspace_id, type, status);

ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;

-- Workspace-scoped access via the shared membership helper (matches other tables).
DROP POLICY IF EXISTS "content_items_workspace_member" ON public.content_items;
CREATE POLICY "content_items_workspace_member" ON public.content_items
    FOR ALL
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

-- Keep updated_at fresh via the shared trigger function from 001_core_schema.
DROP TRIGGER IF EXISTS content_items_updated_at ON public.content_items;
CREATE TRIGGER content_items_updated_at
    BEFORE UPDATE ON public.content_items
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
