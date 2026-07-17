-- 025_prospect_lists
--
-- Named prospect lists (reusable audiences). Users drop saved prospects into a
-- list, then target a whole list by name when building an outreach sequence
-- (enrollment resolves the list -> its members with an email at prepare time).
--
--   prospect_lists         — one named list per workspace
--   prospect_list_members  — many-to-many prospects <-> lists (a prospect can be
--                            in several lists; UNIQUE keeps membership idempotent)
--
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS public.prospect_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prospect_list_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    list_id UUID NOT NULL REFERENCES public.prospect_lists(id) ON DELETE CASCADE,
    prospect_id UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (list_id, prospect_id)
);

CREATE INDEX IF NOT EXISTS prospect_lists_workspace_idx
    ON public.prospect_lists (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prospect_list_members_list_idx
    ON public.prospect_list_members (workspace_id, list_id);

ALTER TABLE public.prospect_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_list_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prospect_lists_workspace_member" ON public.prospect_lists;
CREATE POLICY "prospect_lists_workspace_member" ON public.prospect_lists
    FOR ALL
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "prospect_list_members_workspace_member" ON public.prospect_list_members;
CREATE POLICY "prospect_list_members_workspace_member" ON public.prospect_list_members
    FOR ALL
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

DROP TRIGGER IF EXISTS prospect_lists_updated_at ON public.prospect_lists;
CREATE TRIGGER prospect_lists_updated_at
    BEFORE UPDATE ON public.prospect_lists
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- A sequence can be "built for" a list: the choice is stored here at prepare time
-- and survives the approval gate; the enroll step resolves it to members. Nullable
-- (a sequence stays a reusable template; enrollment can still pick any list).
ALTER TABLE public.sequences
    ADD COLUMN IF NOT EXISTS target_list_id UUID REFERENCES public.prospect_lists(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
