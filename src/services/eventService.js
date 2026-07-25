import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';

// Workspace activity stream. `log` is fire-and-forget — callers MUST tolerate failure
// (append a `.catch(() => {})`) so instrumentation can never break the mutation it
// records. `list` / `latestAt` feed the Dashboard "Latest Updates" panel and the
// header bell's unread dot. Backed by workspace_events (migration 027).

const mapEvent = (row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title ?? '',
    entityType: row.entity_type ?? '',
    entityId: row.entity_id ?? null,
    meta: row.meta ?? {},
    createdAt: row.created_at,
});

export const eventService = {
    log: async (workspaceId, kind, { title = '', entityType = '', entityId = null, meta = {} } = {}) => {
        if (!isUuid(workspaceId) || !kind) return;
        const { error } = await supabase.from('workspace_events').insert({
            workspace_id: workspaceId,
            kind,
            title,
            entity_type: entityType,
            entity_id: entityId && isUuid(entityId) ? entityId : null,
            meta,
        });
        if (error) throw error; // caller swallows; surfaced only in dev logs
    },

    /** Recent events, newest first. `since` (ISO) and `q` (title ilike) narrow the feed. */
    list: async (workspaceId, { since = null, q = '', limit = 30 } = {}) => {
        if (!isUuid(workspaceId)) return [];
        let query = supabase
            .from('workspace_events')
            .select('id, kind, title, entity_type, entity_id, meta, created_at')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (since) query = query.gte('created_at', since);
        if (q) query = query.ilike('title', `%${q}%`);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []).map(mapEvent);
    },

    /** ISO timestamp of the most recent event, or null. Cheap unread-dot check. */
    latestAt: async (workspaceId) => {
        if (!isUuid(workspaceId)) return null;
        const { data, error } = await supabase
            .from('workspace_events')
            .select('created_at')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false })
            .limit(1);
        if (error) throw error;
        return data?.[0]?.created_at ?? null;
    },
};

export default eventService;
