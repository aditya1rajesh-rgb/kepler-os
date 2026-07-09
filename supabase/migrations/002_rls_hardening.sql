-- KEPLER OS — RLS hardening (Phase: Live-Only Guardrails)
-- Apply after 001_core_schema.sql
--
-- Goals:
--   • Membership helpers for consistent policy checks
--   • Granular RLS (SELECT / INSERT / UPDATE / DELETE + WITH CHECK)
--   • Close workspace_members self-join hole
--   • DB constraints for integrity
--   • Private workspace-files storage bucket + path-scoped policies

-- ── Membership helpers ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.workspace_id = ws_id
          AND wm.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_owner(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.workspace_id = ws_id
          AND wm.user_id = auth.uid()
          AND wm.role = 'owner'
    );
$$;

REVOKE ALL ON FUNCTION public.is_workspace_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_workspace_owner(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_owner(UUID) TO authenticated;

-- ── Integrity constraints ─────────────────────────────────────────────────────
ALTER TABLE public.workspaces
    DROP CONSTRAINT IF EXISTS workspaces_name_not_blank;
ALTER TABLE public.workspaces
    ADD CONSTRAINT workspaces_name_not_blank CHECK (char_length(trim(name)) > 0);

ALTER TABLE public.competitors
    DROP CONSTRAINT IF EXISTS competitors_name_not_blank;
ALTER TABLE public.competitors
    ADD CONSTRAINT competitors_name_not_blank CHECK (char_length(trim(name)) > 0);

ALTER TABLE public.personas
    DROP CONSTRAINT IF EXISTS personas_role_not_blank;
ALTER TABLE public.personas
    ADD CONSTRAINT personas_role_not_blank CHECK (char_length(trim(role)) > 0);

ALTER TABLE public.workspace_files
    DROP CONSTRAINT IF EXISTS workspace_files_name_not_blank;
ALTER TABLE public.workspace_files
    ADD CONSTRAINT workspace_files_name_not_blank CHECK (char_length(trim(name)) > 0);

ALTER TABLE public.workspace_files
    DROP CONSTRAINT IF EXISTS workspace_files_status_valid;
ALTER TABLE public.workspace_files
    ADD CONSTRAINT workspace_files_status_valid
    CHECK (status IN ('pending', 'processing', 'ready', 'failed'));

-- ── user_profiles policies ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "user_profiles_insert_own" ON public.user_profiles;
CREATE POLICY "user_profiles_insert_own" ON public.user_profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- ── workspace_members — replace permissive insert ───────────────────────────
DROP POLICY IF EXISTS "workspace_members_insert_own" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members_select_own" ON public.workspace_members;

CREATE POLICY "workspace_members_select_own" ON public.workspace_members
    FOR SELECT
    USING (auth.uid() = user_id OR public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "workspace_members_insert_bootstrap_or_owner" ON public.workspace_members;
CREATE POLICY "workspace_members_insert_bootstrap_or_owner" ON public.workspace_members
    FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND (
            NOT EXISTS (
                SELECT 1 FROM public.workspace_members wm
                WHERE wm.workspace_id = workspace_members.workspace_id
            )
            OR public.is_workspace_owner(workspace_members.workspace_id)
        )
    );

DROP POLICY IF EXISTS "workspace_members_delete_owner_or_self" ON public.workspace_members;
CREATE POLICY "workspace_members_delete_owner_or_self" ON public.workspace_members
    FOR DELETE
    USING (
        auth.uid() = user_id
        OR public.is_workspace_owner(workspace_id)
    );

DROP POLICY IF EXISTS "workspace_members_update_owner" ON public.workspace_members;
CREATE POLICY "workspace_members_update_owner" ON public.workspace_members
    FOR UPDATE
    USING (public.is_workspace_owner(workspace_id))
    WITH CHECK (public.is_workspace_owner(workspace_id));

-- ── workspaces — tighten insert (authenticated only) ──────────────────────────
DROP POLICY IF EXISTS "workspaces_insert_authenticated" ON public.workspaces;
CREATE POLICY "workspaces_insert_authenticated" ON public.workspaces
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- ── Replace FOR ALL workspace-scoped policies with granular policies ──────────
DROP POLICY IF EXISTS "brand_profiles_workspace_member" ON public.brand_profiles;
DROP POLICY IF EXISTS "competitors_workspace_member" ON public.competitors;
DROP POLICY IF EXISTS "personas_workspace_member" ON public.personas;
DROP POLICY IF EXISTS "workspace_files_workspace_member" ON public.workspace_files;

-- brand_profiles
DROP POLICY IF EXISTS "brand_profiles_select_member" ON public.brand_profiles;
CREATE POLICY "brand_profiles_select_member" ON public.brand_profiles
    FOR SELECT USING (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS "brand_profiles_insert_member" ON public.brand_profiles;
CREATE POLICY "brand_profiles_insert_member" ON public.brand_profiles
    FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS "brand_profiles_update_member" ON public.brand_profiles;
CREATE POLICY "brand_profiles_update_member" ON public.brand_profiles
    FOR UPDATE
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS "brand_profiles_delete_member" ON public.brand_profiles;
CREATE POLICY "brand_profiles_delete_member" ON public.brand_profiles
    FOR DELETE USING (public.is_workspace_member(workspace_id));

-- competitors
DROP POLICY IF EXISTS "competitors_select_member" ON public.competitors;
CREATE POLICY "competitors_select_member" ON public.competitors
    FOR SELECT USING (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS "competitors_insert_member" ON public.competitors;
CREATE POLICY "competitors_insert_member" ON public.competitors
    FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS "competitors_update_member" ON public.competitors;
CREATE POLICY "competitors_update_member" ON public.competitors
    FOR UPDATE
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS "competitors_delete_member" ON public.competitors;
CREATE POLICY "competitors_delete_member" ON public.competitors
    FOR DELETE USING (public.is_workspace_member(workspace_id));

-- personas
DROP POLICY IF EXISTS "personas_select_member" ON public.personas;
CREATE POLICY "personas_select_member" ON public.personas
    FOR SELECT USING (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS "personas_insert_member" ON public.personas;
CREATE POLICY "personas_insert_member" ON public.personas
    FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS "personas_update_member" ON public.personas;
CREATE POLICY "personas_update_member" ON public.personas
    FOR UPDATE
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS "personas_delete_member" ON public.personas;
CREATE POLICY "personas_delete_member" ON public.personas
    FOR DELETE USING (public.is_workspace_member(workspace_id));

-- workspace_files
DROP POLICY IF EXISTS "workspace_files_select_member" ON public.workspace_files;
CREATE POLICY "workspace_files_select_member" ON public.workspace_files
    FOR SELECT USING (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS "workspace_files_insert_member" ON public.workspace_files;
CREATE POLICY "workspace_files_insert_member" ON public.workspace_files
    FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS "workspace_files_update_member" ON public.workspace_files;
CREATE POLICY "workspace_files_update_member" ON public.workspace_files
    FOR UPDATE
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));
DROP POLICY IF EXISTS "workspace_files_delete_member" ON public.workspace_files;
CREATE POLICY "workspace_files_delete_member" ON public.workspace_files
    FOR DELETE USING (public.is_workspace_member(workspace_id));

-- ── Storage: workspace-scoped private bucket ──────────────────────────────────
-- Path convention: {workspace_id}/{file_id}/{filename}
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'workspace-files',
    'workspace-files',
    false,
    52428800,
    ARRAY[
        'application/pdf',
        'text/plain',
        'text/csv',
        'image/png',
        'image/jpeg',
        'image/webp'
    ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "workspace_files_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "workspace_files_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "workspace_files_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "workspace_files_storage_delete" ON storage.objects;

CREATE POLICY "workspace_files_storage_select" ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'workspace-files'
        AND public.is_workspace_member((storage.foldername(name))[1]::uuid)
    );

CREATE POLICY "workspace_files_storage_insert" ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'workspace-files'
        AND public.is_workspace_member((storage.foldername(name))[1]::uuid)
    );

CREATE POLICY "workspace_files_storage_update" ON storage.objects
    FOR UPDATE
    USING (
        bucket_id = 'workspace-files'
        AND public.is_workspace_member((storage.foldername(name))[1]::uuid)
    )
    WITH CHECK (
        bucket_id = 'workspace-files'
        AND public.is_workspace_member((storage.foldername(name))[1]::uuid)
    );

CREATE POLICY "workspace_files_storage_delete" ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'workspace-files'
        AND public.is_workspace_member((storage.foldername(name))[1]::uuid)
    );
