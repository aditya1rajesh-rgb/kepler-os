import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';

// Feedback + learning loop. Users rate generated outputs 1-5; ratings under 3
// carry an improvement note. getGuidance() turns recent low-rated notes for a
// module into a prompt fragment that generation services inject, so the next
// generation addresses past complaints. Lightweight "learning" - no fine-tuning.

const assertWorkspaceId = (workspaceId) => {
    if (!isUuid(workspaceId)) throw new Error('Invalid workspace id');
};

export const feedbackService = {
    /** Record a rating (+ optional improvement note) for a generated output. */
    saveFeedback: async (workspaceId, { module, label = '', rating, improvement = '' }) => {
        assertWorkspaceId(workspaceId);
        const r = Math.max(1, Math.min(5, Math.round(Number(rating) || 0)));
        const { data, error } = await supabase
            .from('generation_feedback')
            .insert({ workspace_id: workspaceId, module, label, rating: r, improvement })
            .select()
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    /**
     * Build a prompt fragment from recent feedback for a module - prioritizing
     * improvement notes and low ratings. Returns '' when there's nothing useful,
     * so callers can append unconditionally. Never throws (advisory only).
     */
    getGuidance: async (workspaceId, module, { limit = 6 } = {}) => {
        if (!isUuid(workspaceId) || !module) return '';
        try {
            const { data, error } = await supabase
                .from('generation_feedback')
                .select('rating, label, improvement, created_at')
                .eq('workspace_id', workspaceId)
                .eq('module', module)
                .order('created_at', { ascending: false })
                .limit(30);
            if (error || !Array.isArray(data)) return '';

            // Most valuable signal: notes attached to low ratings.
            const notes = data
                .filter((row) => row.improvement && row.improvement.trim())
                .slice(0, limit)
                .map((row) => `- (${row.rating}★${row.label ? `, ${row.label}` : ''}) ${row.improvement.trim()}`);

            if (notes.length === 0) return '';
            return `\n\nPAST USER FEEDBACK ON SIMILAR OUTPUTS - address every point to improve on prior attempts:\n${notes.join('\n')}`;
        } catch {
            return '';
        }
    },

    /** Recent feedback rows for display/aggregation (optional UI use). */
    getRecent: async (workspaceId, module, { limit = 20 } = {}) => {
        assertWorkspaceId(workspaceId);
        let q = supabase
            .from('generation_feedback')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (module) q = q.eq('module', module);
        const { data, error } = await q;
        if (error) throw error;
        return data ?? [];
    },

    /**
     * UI-facing summary of the learning signal for one module - mirrors the window
     * getGuidance() uses so what's shown matches what's actually injected into the
     * next generation. shapingNotes are the improvement notes being applied.
     * Never throws (advisory).
     */
    getFeedbackSummary: async (workspaceId, module, { window = 30, noteLimit = 6 } = {}) => {
        const empty = { ratingCount: 0, avgRating: 0, shapingNotes: [] };
        if (!isUuid(workspaceId) || !module) return empty;
        try {
            const { data, error } = await supabase
                .from('generation_feedback')
                .select('rating, label, improvement, created_at')
                .eq('workspace_id', workspaceId)
                .eq('module', module)
                .order('created_at', { ascending: false })
                .limit(window);
            if (error || !Array.isArray(data)) return empty;
            const ratingCount = data.length;
            const avgRating = ratingCount
                ? data.reduce((sum, row) => sum + (row.rating || 0), 0) / ratingCount
                : 0;
            const shapingNotes = data
                .filter((row) => row.improvement && row.improvement.trim())
                .slice(0, noteLimit)
                .map((row) => ({
                    rating: row.rating,
                    label: row.label || '',
                    note: row.improvement.trim(),
                    createdAt: row.created_at,
                }));
            return { ratingCount, avgRating, shapingNotes };
        } catch {
            return empty;
        }
    },

    /** Workspace-wide feedback rollup across every module (for the cockpit). Never throws. */
    getWorkspaceFeedbackRollup: async (workspaceId, { window = 200 } = {}) => {
        const empty = { ratingCount: 0, noteCount: 0, avgRating: 0 };
        if (!isUuid(workspaceId)) return empty;
        try {
            const { data, error } = await supabase
                .from('generation_feedback')
                .select('rating, improvement')
                .eq('workspace_id', workspaceId)
                .order('created_at', { ascending: false })
                .limit(window);
            if (error || !Array.isArray(data)) return empty;
            const ratingCount = data.length;
            const noteCount = data.filter((row) => row.improvement && row.improvement.trim()).length;
            const avgRating = ratingCount
                ? data.reduce((sum, row) => sum + (row.rating || 0), 0) / ratingCount
                : 0;
            return { ratingCount, noteCount, avgRating };
        } catch {
            return empty;
        }
    },
};

export default feedbackService;
