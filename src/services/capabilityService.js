import { callEdgeFunction } from './edgeClient';
import { integrationService } from './integrationService';
import { resolveCapabilities, resolveCapability } from '../lib/capabilities';

// Client wiring for the capability-gating layer. Fetches the platform-secret
// booleans once (cached), merges them with per-workspace connection status, and
// resolves the pure descriptors in src/lib/capabilities.js. The browser never
// sees a secret value — only which platform capabilities are configured.

let _platformCache = null;
let _platformFetchedAt = 0;
const PLATFORM_TTL_MS = 5 * 60 * 1000; // platform secrets change rarely; cache 5 min

/**
 * Platform-secret booleans, e.g. { serp_metrics: false, visibility_perplexity: false, ... }.
 * On any error (offline, function not deployed) we treat everything as unconfigured —
 * the honest, safe default (features degrade rather than pretend to be live).
 */
const getPlatform = async ({ force = false } = {}) => {
    const now = Date.now();
    if (!force && _platformCache && now - _platformFetchedAt < PLATFORM_TTL_MS) return _platformCache;
    try {
        const res = await callEdgeFunction('connector-proxy', { action: 'capabilities' });
        _platformCache = (res && typeof res.platform === 'object' && res.platform) || {};
    } catch {
        _platformCache = {};
    }
    _platformFetchedAt = now;
    return _platformCache;
};

export const capabilityService = {
    getPlatform,

    /** Invalidate the platform cache (e.g. after the operator adds a key). */
    refresh: () => { _platformCache = null; _platformFetchedAt = 0; },

    /**
     * Resolve every capability for a workspace: platform booleans + connected
     * providers → the { [id]: resolved } map from src/lib/capabilities.js.
     */
    resolve: async (workspaceId, { force = false } = {}) => {
        const [platform, statuses] = await Promise.all([
            getPlatform({ force }),
            integrationService.listStatuses(workspaceId).catch(() => ({})),
        ]);
        const connectedProviders = Object.entries(statuses)
            .filter(([, s]) => s?.status === 'connected')
            .map(([provider]) => provider);
        return resolveCapabilities({ platform, connectedProviders });
    },

    /** Resolve a single capability for a workspace. */
    resolveOne: async (workspaceId, id, opts) => {
        const map = await capabilityService.resolve(workspaceId, opts);
        return map[id] ?? resolveCapability(id, {});
    },
};

export default capabilityService;
