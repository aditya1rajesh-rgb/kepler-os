import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';
import { mapWorkspaceIntegrationRow } from '../lib/mappers';
import { callEdgeFunction } from './edgeClient';
import { CONNECTORS, OAUTH_FAMILIES } from '../lib/connectors';

const assertWorkspaceId = (workspaceId) => {
    if (!isUuid(workspaceId)) throw new Error('Invalid workspace id');
};

const NONCE_KEY = 'oauth_connect_nonce';

// Static per-family client config. Vite inlines import.meta.env only for literal
// keys, so these can't be resolved dynamically - one entry per OAuth family,
// reused across all its connectors.
const FAMILY_ENV = {
    google: {
        clientId: import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID?.trim(),
        redirectUri: import.meta.env.VITE_GOOGLE_OAUTH_REDIRECT_URI?.trim(),
    },
    meta: {
        clientId: import.meta.env.VITE_META_OAUTH_CLIENT_ID?.trim(),
        redirectUri: import.meta.env.VITE_META_OAUTH_REDIRECT_URI?.trim(),
    },
    linkedin: {
        clientId: import.meta.env.VITE_LINKEDIN_OAUTH_CLIENT_ID?.trim(),
        redirectUri: import.meta.env.VITE_LINKEDIN_OAUTH_REDIRECT_URI?.trim(),
    },
};
const FAMILY_ENV_HINT = {
    google: 'VITE_GOOGLE_OAUTH_CLIENT_ID and VITE_GOOGLE_OAUTH_REDIRECT_URI',
    meta: 'VITE_META_OAUTH_CLIENT_ID and VITE_META_OAUTH_REDIRECT_URI',
    linkedin: 'VITE_LINKEDIN_OAUTH_CLIENT_ID and VITE_LINKEDIN_OAUTH_REDIRECT_URI',
};

/**
 * External integrations (first provider: Google Search Console).
 * The client only ever reads connection STATUS (RLS + column privileges hide the
 * refresh token); all token exchange/use happens in the search-console edge fn.
 */
export const integrationService = {
    /** Connection status for a workspace + provider (never includes the secret). */
    getStatus: async (workspaceId, provider = 'gsc') => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('workspace_integrations')
            .select('id, workspace_id, provider, property_url, status, meta, last_sync_at, last_error, created_at, updated_at')
            .eq('workspace_id', workspaceId)
            .eq('provider', provider)
            .maybeSingle();
        if (error) throw error;
        return data ? mapWorkspaceIntegrationRow(data) : null;
    },

    /** All connection statuses for a workspace, keyed by provider (no secrets). */
    listStatuses: async (workspaceId) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('workspace_integrations')
            .select('id, workspace_id, provider, property_url, status, meta, last_sync_at, last_error, created_at, updated_at')
            .eq('workspace_id', workspaceId);
        if (error) throw error;
        const map = {};
        for (const row of data ?? []) map[row.provider] = mapWorkspaceIntegrationRow(row);
        return map;
    },

    /**
     * Build an OAuth consent URL client-side for any OAuth connector (client id +
     * redirect are public). Family + scopes come from the registry; a CSRF nonce
     * is stashed in sessionStorage and state carries { workspaceId, connectorId }.
     */
    buildAuthUrl: (workspaceId, connectorId = 'gsc') => {
        const connector = CONNECTORS.find((c) => c.id === connectorId);
        if (!connector?.oauth || !connector.family) {
            throw new Error(`Unknown OAuth connector: ${connectorId}`);
        }
        const family = OAUTH_FAMILIES[connector.family];
        const env = FAMILY_ENV[connector.family];
        if (!family || !env?.clientId || !env?.redirectUri) {
            throw new Error(`${connector.label} is not configured - set ${FAMILY_ENV_HINT[connector.family] ?? 'the OAuth client id and redirect URI'}.`);
        }
        const nonce = crypto.randomUUID?.() || Math.random().toString(36).slice(2);
        sessionStorage.setItem(NONCE_KEY, nonce);
        const state = btoa(JSON.stringify({ workspaceId, connectorId, nonce }));
        const params = new URLSearchParams({
            client_id: env.clientId,
            redirect_uri: env.redirectUri,
            scope: (connector.oauth.scopes ?? []).join(' '),
            state,
            ...family.authParams,
        });
        return `${family.authUrl}?${params.toString()}`;
    },

    /**
     * Whether an OAuth connector's client env (client id + redirect URI) is
     * present in this build. Lets the UI show a calm "Setup required" state
     * instead of surfacing a developer-facing "not configured" error.
     */
    isOAuthConfigured: (connectorId) => {
        const connector = CONNECTORS.find((c) => c.id === connectorId);
        if (!connector?.oauth || !connector.family) return false;
        const env = FAMILY_ENV[connector.family];
        return Boolean(env?.clientId && env?.redirectUri);
    },

    /** Validate the state returned by the provider against the stored CSRF nonce. */
    verifyState: (state) => {
        try {
            const { workspaceId, connectorId, nonce } = JSON.parse(atob(state));
            const stored = sessionStorage.getItem(NONCE_KEY);
            if (!nonce || nonce !== stored) return null;
            sessionStorage.removeItem(NONCE_KEY);
            return isUuid(workspaceId) ? { workspaceId, connectorId: connectorId || 'gsc' } : null;
        } catch {
            return null;
        }
    },

    // ── OAuth connectors (generic proxy) - token exchange + calls server-side ──
    exchangeCode: (code, state) => callEdgeFunction('oauth-proxy', { action: 'exchangeCode', code, state }),
    setProperty: (workspaceId, propertyUrl, provider = 'gsc') =>
        callEdgeFunction('oauth-proxy', { action: 'setProperty', workspaceId, provider, propertyUrl }),
    query: (workspaceId, provider = 'gsc', opts = {}) =>
        callEdgeFunction('oauth-proxy', { action: 'query', workspaceId, provider, ...opts }, { timeoutMs: 45000 }),
    // List selectable resources for an OAuth connector (e.g. GA4 properties).
    listProperties: (workspaceId, provider) =>
        callEdgeFunction('oauth-proxy', { action: 'listProperties', workspaceId, provider }, { timeoutMs: 30000 }),
    // Consumption WRITE for OAuth publishers - publish content to the provider
    // (e.g. a post to LinkedIn). Payload shape is provider-specific.
    publish: (workspaceId, provider, payload) =>
        callEdgeFunction('oauth-proxy', { action: 'publish', workspaceId, provider, payload }, { timeoutMs: 30000 }),
    // Consumption READ for OAuth publishers - the account's own historical posts
    // + engagement (e.g. Meta Page/IG history).
    fetchHistory: (workspaceId, provider, opts = {}) =>
        callEdgeFunction('oauth-proxy', { action: 'fetchHistory', workspaceId, provider, ...opts }, { timeoutMs: 45000 }),

    // ── API-key connectors (generic proxy) - validate + store server-side ──
    connectApiKey: (workspaceId, provider, credentials) =>
        callEdgeFunction('connector-proxy', { action: 'connect', provider, workspaceId, credentials }, { timeoutMs: 30000 }),
    testConnector: (workspaceId, provider) =>
        callEdgeFunction('connector-proxy', { action: 'test', provider, workspaceId }),
    // Consumption WRITE - push a payload into a connected provider (e.g. an
    // outreach sequence into Zoho CRM). The provider's adapter interprets payload.
    pushToCrm: (workspaceId, provider, payload) =>
        callEdgeFunction('connector-proxy', { action: 'push', provider, workspaceId, payload }, { timeoutMs: 45000 }),
    // Consumption READ - list records from a connected provider (e.g. Zoho contacts).
    fetchFromConnector: (workspaceId, provider, params = {}) =>
        callEdgeFunction('connector-proxy', { action: 'fetch', provider, workspaceId, params }, { timeoutMs: 30000 }),

    // Disconnect routes by the connector's auth style: OAuth → oauth-proxy,
    // api-key → connector-proxy.
    disconnect: (workspaceId, provider = 'gsc') => {
        const connector = CONNECTORS.find((c) => c.id === provider);
        return connector?.authType === 'oauth'
            ? callEdgeFunction('oauth-proxy', { action: 'disconnect', workspaceId, provider })
            : callEdgeFunction('connector-proxy', { action: 'disconnect', provider, workspaceId });
    },
};

export default integrationService;
