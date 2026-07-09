-- 015_prospects
--
-- Prospecting is its own activity: Apollo (net-new People Search) finds people,
-- KEPLER saves them here as a reviewable list, and the user pushes chosen ones
-- into their CRM (Zoho) as Leads. Prospects are NOT outreach recipients — this
-- table is the top-of-funnel pipeline, separate from content/sequences.
--
-- Apollo search returns no emails (enrichment is a separate credit-based call),
-- so email is optional; Zoho Leads only require Last_Name + Company.
--
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS public.prospects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    linkedin_url TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    -- Where it came from ('apollo') and the provider's record id (for dedupe).
    source TEXT NOT NULL DEFAULT 'apollo',
    external_id TEXT NOT NULL DEFAULT '',
    -- saved (in KEPLER only) → pushed (created in a CRM).
    status TEXT NOT NULL DEFAULT 'saved' CHECK (status IN ('saved', 'pushed')),
    pushed_to TEXT NOT NULL DEFAULT '',
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospects_workspace_idx
    ON public.prospects (workspace_id, created_at DESC);

ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

-- Workspace-scoped access via the shared membership helper (matches other tables).
DROP POLICY IF EXISTS "prospects_workspace_member" ON public.prospects;
CREATE POLICY "prospects_workspace_member" ON public.prospects
    FOR ALL
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

DROP TRIGGER IF EXISTS prospects_updated_at ON public.prospects;
CREATE TRIGGER prospects_updated_at
    BEFORE UPDATE ON public.prospects
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
