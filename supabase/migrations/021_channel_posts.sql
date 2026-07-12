-- 021_channel_posts
--
-- Historical posts pulled from connected social accounts (first: meta-pages =
-- FB Page + linked IG Business). Each row is one real published post with its
-- engagement COUNTS at capture time. This is the raw signal for "what content
-- actually works" — surfaced in the Social module and, next, feeding the
-- learning loop alongside user ratings. Upserted by (workspace, provider,
-- external_id) so repeated pulls refresh metrics instead of duplicating.
--
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS public.channel_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'meta-pages',
    -- Which surface within the provider: 'facebook' | 'instagram' | later others.
    channel TEXT NOT NULL,
    external_id TEXT NOT NULL,
    posted_at TIMESTAMPTZ,
    text TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    media_type TEXT NOT NULL DEFAULT '',
    -- { likes, comments, shares } — counts as of captured_at.
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, provider, external_id)
);

CREATE INDEX IF NOT EXISTS channel_posts_ws_idx
    ON public.channel_posts (workspace_id, posted_at DESC);

ALTER TABLE public.channel_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "channel_posts_workspace_member" ON public.channel_posts;
CREATE POLICY "channel_posts_workspace_member" ON public.channel_posts
    FOR ALL
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

NOTIFY pgrst, 'reload schema';
