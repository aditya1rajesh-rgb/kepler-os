import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';
import { integrationService } from './integrationService';

const assertWorkspaceId = (workspaceId) => {
    if (!isUuid(workspaceId)) throw new Error('Invalid workspace id');
};

// Historical posts from connected social accounts (first provider: meta-pages =
// FB Page + linked IG). Pull = fetch via oauth-proxy → upsert into
// channel_posts (repeat pulls refresh engagement counts instead of
// duplicating). This is the raw "what actually works" signal — displayed in
// the Social module and, next, mined by the learning loop. Mirrors
// measurementService's pull-and-snapshot pattern.
export const channelHistoryService = {
    /** Pull the account's post history + engagement and store it. */
    pull: async (workspaceId, provider = 'meta-pages') => {
        assertWorkspaceId(workspaceId);
        const res = await integrationService.fetchHistory(workspaceId, provider);
        const posts = res?.posts ?? [];
        if (posts.length) {
            const rows = posts.map((p) => ({
                workspace_id: workspaceId,
                provider,
                channel: p.channel ?? '',
                external_id: p.externalId ?? '',
                posted_at: p.postedAt ?? null,
                text: p.text ?? '',
                url: p.url ?? '',
                media_type: p.mediaType ?? '',
                metrics: p.metrics ?? {},
                captured_at: new Date().toISOString(),
            })).filter((r) => r.external_id);
            const { error } = await supabase
                .from('channel_posts')
                .upsert(rows, { onConflict: 'workspace_id,provider,external_id' });
            if (error) throw error;
        }
        return { pulled: posts.length };
    },

    /** Stored history, most recent first. */
    list: async (workspaceId, { limit = 100 } = {}) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('channel_posts')
            .select('id, provider, channel, external_id, posted_at, text, url, media_type, metrics, captured_at')
            .eq('workspace_id', workspaceId)
            .order('posted_at', { ascending: false, nullsFirst: false })
            .limit(limit);
        if (error) throw error;
        return (data ?? []).map((r) => ({
            id: r.id,
            provider: r.provider,
            channel: r.channel,
            externalId: r.external_id,
            postedAt: r.posted_at,
            text: r.text ?? '',
            url: r.url ?? '',
            mediaType: r.media_type ?? '',
            metrics: r.metrics ?? {},
            capturedAt: r.captured_at,
        }));
    },
};

export default channelHistoryService;
