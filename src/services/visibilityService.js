import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';
import { getBrandContextForGeneration } from './brandContextService';
import { mapVisibilityScanRow } from '../lib/mappers';
import {
    SURFACE_IDS,
    buildBuyerPrompts,
    hashPrompt,
    detectMentions,
    computeShareOfVoice,
    synthesizeMockAnswer,
} from '../lib/visibility';

const assertWorkspaceId = (workspaceId) => {
    if (!isUuid(workspaceId)) throw new Error('Invalid workspace id');
};

const hostFromUrl = (url) => {
    const u = String(url || '').trim();
    if (!u) return '';
    try { return new URL(u.startsWith('http') ? u : `https://${u}`).hostname.replace(/^www\./, ''); }
    catch { return ''; }
};

// Provider registry. Each surface's `ask` will, once keys exist, delegate to the
// `visibility-scanner` edge function (Phase 1a-live). Until then every provider
// is `configured: false` — a live scan records honest 'stub' rows (no answer,
// no fabricated measurement) rather than inventing visibility. Flip `configured`
// + implement `ask` per surface when the edge function + secrets land.
// See [[connector-architecture]] and [[aeo-wedge-roadmap]].
const PROVIDERS = SURFACE_IDS.reduce((acc, id) => {
    acc[id] = {
        id,
        configured: false,
        // ask: async ({ prompt }) => callEdgeFunction('visibility-scanner', { surface: id, prompt }),
        ask: async () => { throw new Error('not_configured'); },
    };
    return acc;
}, {});

const EMPTY_DETECTION = (competitors) => ({
    brandMentioned: false,
    brandCited: false,
    competitorMentions: competitors.map((name) => ({ name, mentioned: false, cited: false })),
    citations: [],
    sentiment: null,
});

/**
 * AEO / AI-visibility service. Generates buyer prompts from the existing brand
 * context (ICPs + confirmed competitors), asks each AI surface (stubbed until
 * keys land, or mock for local verification), stores per-(prompt × surface) rows
 * in visibility_scans, and snapshots real runs into campaign_metrics as the
 * 'aeo' provider so AI visibility becomes a measured channel alongside GA4/Zoho.
 */
export const visibilityService = {
    /**
     * Run one scan across the tracked surfaces.
     * @param {string} workspaceId
     * @param {object} [opts] { surfaces?: string[], mock?: boolean, maxPrompts?: number }
     * @returns {Promise<object>} run summary
     */
    runScan: async (workspaceId, { surfaces = SURFACE_IDS, mock = false, maxPrompts = 16 } = {}) => {
        assertWorkspaceId(workspaceId);

        const { structured } = await getBrandContextForGeneration(workspaceId, { module: 'default' });
        const prompts = buildBuyerPrompts(structured, { maxPrompts });
        if (!prompts.length) {
            return { scanRunId: null, promptCount: 0, surfaces, counts: { ok: 0, stub: 0, mock: 0, error: 0 }, message: 'Add brand overview, ICPs, or competitors in Brand Intelligence to generate buyer prompts.' };
        }

        const brandName = structured.name || '';
        const brandDomain = hostFromUrl(structured.url);
        const competitors = (structured.competitors || []).map((c) => c.name).filter(Boolean);

        const scanRunId = crypto.randomUUID();
        const inserts = [];
        const normalized = []; // for SoV over real ('ok') rows only

        for (const p of prompts) {
            for (const surface of surfaces) {
                let answer = null;
                let status = 'stub';
                let error = '';

                if (mock) {
                    answer = synthesizeMockAnswer({ prompt: p.prompt, structured, surface });
                    status = 'mock';
                } else {
                    const provider = PROVIDERS[surface];
                    if (provider?.configured) {
                        try {
                            const r = await provider.ask({ prompt: p.prompt });
                            answer = r?.answer ?? '';
                            status = 'ok';
                        } catch (e) {
                            status = 'error';
                            error = e?.message || 'provider error';
                        }
                    }
                }

                const det = answer
                    ? detectMentions({ answer, brandName, brandDomain, competitors })
                    : EMPTY_DETECTION(competitors);

                inserts.push({
                    workspace_id: workspaceId,
                    scan_run_id: scanRunId,
                    prompt: p.prompt,
                    prompt_hash: hashPrompt(p.prompt),
                    surface,
                    answer,
                    brand_mentioned: det.brandMentioned,
                    brand_cited: det.brandCited,
                    competitor_mentions: det.competitorMentions,
                    citations: det.citations,
                    sentiment: det.sentiment,
                    status,
                    error,
                });
                if (status === 'ok') normalized.push(det);
            }
        }

        const { error: insErr } = await supabase.from('visibility_scans').insert(inserts);
        if (insErr) throw insErr;

        // Only real ('ok') runs become measurement — mock/stub never do.
        let shareOfVoice = null;
        if (normalized.length) {
            const sov = computeShareOfVoice(normalized, { competitors });
            await visibilityService.snapshotToMeasurement(workspaceId, sov);
            shareOfVoice = sov.shareOfVoice;
        }

        const counts = inserts.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, { ok: 0, stub: 0, mock: 0, error: 0 });
        return { scanRunId, promptCount: prompts.length, surfaces, counts, shareOfVoice };
    },

    /**
     * Latest scan run rolled up for the dashboard. SoV is computed over answered
     * rows (real or mock) so the pipeline is visible pre-keys; `hasReal` says
     * whether any answer came from a live surface. null when never scanned.
     */
    getLatestVisibility: async (workspaceId) => {
        assertWorkspaceId(workspaceId);
        const { data: latest, error: e1 } = await supabase
            .from('visibility_scans')
            .select('scan_run_id, captured_at')
            .eq('workspace_id', workspaceId)
            .order('captured_at', { ascending: false })
            .limit(1);
        if (e1) throw e1;
        const run = latest?.[0];
        if (!run) return null;

        const { data, error: e2 } = await supabase
            .from('visibility_scans')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('scan_run_id', run.scan_run_id);
        if (e2) throw e2;

        const rows = (data ?? []).map(mapVisibilityScanRow);
        const answered = rows.filter((r) => r.answer);
        const competitors = [...new Set(rows.flatMap((r) => (r.competitorMentions || []).map((c) => c.name)))];
        const sov = computeShareOfVoice(answered, { competitors });

        return {
            scanRunId: run.scan_run_id,
            capturedAt: run.captured_at,
            promptCount: new Set(rows.map((r) => r.promptHash)).size,
            surfaces: [...new Set(rows.map((r) => r.surface))],
            statusMix: rows.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {}),
            hasReal: rows.some((r) => r.status === 'ok'),
            ...sov,
        };
    },

    /** Recent raw scan rows (newest first) — for a future detail/history view. */
    getScans: async (workspaceId, { limit = 100 } = {}) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('visibility_scans')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('captured_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return (data ?? []).map(mapVisibilityScanRow);
    },

    /** Snapshot a share-of-voice reading into campaign_metrics as provider 'aeo'. */
    snapshotToMeasurement: async (workspaceId, sov) => {
        assertWorkspaceId(workspaceId);
        const { error } = await supabase.from('campaign_metrics').insert([{
            workspace_id: workspaceId,
            campaign_id: null, // AI visibility is brand-level, not per-campaign
            provider: 'aeo',
            metrics: {
                aeoShareOfVoice: sov.shareOfVoice,
                aeoBrandPresence: sov.brandPresenceRate,
                aeoBrandMentions: sov.brandMentions,
                aeoPromptsTracked: sov.totalRows,
                aeoTotalMentions: sov.totalMentions,
            },
        }]);
        if (error) throw error;
    },
};

export default visibilityService;
