import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';
import { viewThrottle } from '../lib/usageThrottle';

// Usage instrumentation (E4, migration 031).
//
// Records what a workspace actually does — which surfaces get opened, and which
// stateless jobs get RE-run — so the roadmap's unverified assumptions can be
// settled with evidence instead of argued. See the migration for why this is a
// separate table from workspace_events, and why actor_id is a database default
// rather than a client argument.
//
// Every write here is FIRE-AND-FORGET and must stay that way: instrumentation
// that can break the thing it measures is worse than no instrumentation. Nothing
// in this module ever throws or returns a value a caller should branch on.

const write = async (workspaceId, row) => {
    if (!isUuid(workspaceId)) return;
    try {
        // actor_id is omitted deliberately — the column defaults to auth.uid().
        await supabase.from('usage_events').insert({ workspace_id: workspaceId, ...row });
    } catch {
        // Swallowed by design. A dropped analytics row is not worth a broken screen.
    }
};

export const usageService = {
    /**
     * A surface was opened. Throttled per surface (see usageThrottle) so this is
     * safe to call from a mount effect on every render path.
     */
    view: (workspaceId, surface) => {
        if (!surface || !viewThrottle.shouldRecord(surface)) return;
        write(workspaceId, { surface, action: 'view' });
    },

    /**
     * A job was run. NOT throttled — the repeat is the entire signal. "Does
     * anyone re-run a page teardown" is unanswerable if repeats are collapsed.
     */
    run: (workspaceId, surface, subject, meta = {}) => {
        if (!surface || !subject) return;
        write(workspaceId, { surface, action: 'run', subject, meta });
    },

    /** Something was generated. Separated from `run` because E6 will join on it. */
    generate: (workspaceId, surface, subject, meta = {}) => {
        if (!surface || !subject) return;
        write(workspaceId, { surface, action: 'generate', subject, meta });
    },
};

export default usageService;
