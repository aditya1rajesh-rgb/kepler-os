import { callEdgeFunction } from './edgeClient';

// SERP keyword-metrics client (WS1c). Asks the connector-proxy `keywordMetrics`
// action for real volume + difficulty (DataForSEO, a platform-global secret). On
// any failure or when unconfigured it returns {} so the keyword pipeline degrades
// to honest estimates — never fabricated numbers.

export const serpMetricsService = {
    /**
     * @param {string[]} keywords
     * @param {object} [opts] { locationName?, languageCode? }
     * @returns {Promise<Record<string, {volume:number|null,difficulty:number|null,cpc:number|null,competition:number|null}>>}
     *   keyed by lowercased term; empty object when unconfigured/failed.
     */
    fetch: async (keywords, { locationName, languageCode } = {}) => {
        if (!Array.isArray(keywords) || keywords.length === 0) return {};
        try {
            const res = await callEdgeFunction(
                'connector-proxy',
                { action: 'keywordMetrics', keywords, locationName, languageCode },
                { timeoutMs: 45000 },
            );
            return res?.ok && res.metrics && typeof res.metrics === 'object' ? res.metrics : {};
        } catch {
            return {};
        }
    },
};

export default serpMetricsService;
