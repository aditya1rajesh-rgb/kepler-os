import { fetchWebsiteContent, normalizeUrl } from './websiteIntelligenceService';
import { detectSourceChange } from '../lib/brandHealth';

// Source-freshness watcher for the living brand model. Compares the website
// snapshot persisted in brand.populationMeta.websiteSource (full bodyText is
// already stored there by brandPopulationService) against a fresh scrape, and
// reports whether the site changed since the last sync. Read-only: acting on a
// change stays an explicit user step ("Refresh from sources"), never a silent
// rewrite. See [[aeo-wedge-roadmap]].

// One live check per workspace per session window — a page visit shouldn't
// re-scrape the site every mount.
const CHECK_TTL_MS = 6 * 60 * 60 * 1000;
const checkCache = new Map(); // workspaceId -> { at: epochMs, result }

export const brandFreshnessService = {
    /**
     * Check whether the brand's source website changed since the stored snapshot.
     * @param {string} workspaceId
     * @param {object} args { brand, workspace, force?: boolean }
     * @returns {Promise<object>} one of:
     *   { ok:false, reason:'no-url'|'fetch-failed' }
     *   { ok:true, hasBaseline:false }                       — never scraped yet
     *   { ok:true, hasBaseline:true, changed, deltaRatio,
     *     lastFetchedAt, checkedAt }
     */
    checkSourceFreshness: async (workspaceId, { brand, workspace, force = false } = {}) => {
        const url = normalizeUrl(brand?.url || workspace?.url || '');
        if (!url) return { ok: false, reason: 'no-url' };

        const prev = brand?.populationMeta?.websiteSource;
        if (!prev?.bodyText) return { ok: true, hasBaseline: false };

        const cached = checkCache.get(workspaceId);
        if (!force && cached && Date.now() - cached.at < CHECK_TTL_MS) return cached.result;

        const fresh = await fetchWebsiteContent(url);
        if (!fresh?.ok) return { ok: false, reason: 'fetch-failed' };

        const cmp = detectSourceChange(prev.bodyText, fresh.bodyText);
        const result = {
            ok: true,
            hasBaseline: true,
            changed: cmp.changed,
            deltaRatio: cmp.deltaRatio,
            lastFetchedAt: prev.fetchedAt ?? null,
            checkedAt: new Date().toISOString(),
        };
        checkCache.set(workspaceId, { at: Date.now(), result });
        return result;
    },

    /** Drop the cached check (e.g. right after a refresh re-scraped the site). */
    invalidate: (workspaceId) => { checkCache.delete(workspaceId); },
};

export default brandFreshnessService;
