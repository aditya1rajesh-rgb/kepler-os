// Capability-gating layer — the third, orthogonal gate.
//
// Kepler already has two gates: connector connection status (workspace_integrations)
// and content-readiness nav locks (moduleRegistry MODULE_GATES). This adds a third:
// is an external CAPABILITY configured for a given workspace?
//
// Philosophy (inherited from the connector registry): capabilities are PURE UPSIDE.
// Every SEO/AEO feature works without them and DEGRADES TO AN HONEST STATE — an
// estimate, a sample, or a "connect X to enable" prompt — never a fabrication.
// You add a key (platform secret) or connect an account (per-workspace) later, and
// the feature lights up with zero code change.
//
// Two scopes:
//   'platform'  — a global secret the operator sets once via `supabase secrets set`
//                 (DataForSEO, Perplexity, …), reported as a boolean by the
//                 connector-proxy `capabilities` action (never the value itself).
//   'workspace' — an account each client connects (GSC, WordPress), read from
//                 workspace_integrations status.
//
// This module is PURE (no imports, no I/O) so the gating decision is unit-testable
// in tests/capabilities.test.js — the codebase convention. The client wiring
// (fetch platform booleans + merge with connection status) lives in
// src/services/capabilityService.js.

/**
 * Capability descriptors. `requires` lists the platform-secret keys (scope
 * 'platform') or connector ids (scope 'workspace') a capability needs. `requireMode`
 * 'any' means one is enough (e.g. any one AI-visibility surface); default 'all'.
 * `alwaysOn` capabilities need no key (they ride an already-configured dependency
 * like the Vertex grounding tool or Jina's free tier).
 */
export const CAPABILITIES = {
    // ── Always on (no new key) ────────────────────────────────────────────────
    grounding: {
        label: 'Real-web grounding',
        scope: 'platform',
        requires: [],
        alwaysOn: true,
        enables: 'Generation grounded in live web results, not model recall.',
    },
    page_reader: {
        label: 'Competitor & page teardown',
        scope: 'platform',
        requires: [],
        alwaysOn: true,
        enables: 'Read live competitor pages and your own pages to ground content in reality (Jina free tier).',
    },

    // ── Per-workspace (each client connects their own account) ────────────────
    gsc_operator: {
        label: 'Search Console operator loop',
        scope: 'workspace',
        requires: ['gsc'],
        enables: 'Striking-distance, decay, low-CTR, cannibalization and dead-page analysis from real GSC data.',
        degraded: 'Connect Search Console to surface real ranking opportunities.',
        connectHint: 'Connect Google Search Console in Integrations.',
    },
    cms_publish: {
        label: 'One-click publish',
        scope: 'workspace',
        requires: ['wordpress'],
        enables: 'Publish approved content straight to your CMS at a real URL.',
        degraded: 'Content stays copy-to-clipboard until a CMS is connected.',
        connectHint: 'Connect WordPress in Integrations.',
    },

    // ── Platform-global vendor keys (operator sets once) ──────────────────────
    serp_metrics: {
        label: 'Real keyword volume & difficulty',
        scope: 'platform',
        requires: ['serp_metrics'],
        enables: 'Real search volume + difficulty and a live opportunity score on every keyword.',
        degraded: 'Volume and difficulty stay estimated; opportunity score hidden.',
        connectHint: 'Add the DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD platform secrets.',
    },
    ai_visibility: {
        label: 'AI visibility tracking',
        scope: 'platform',
        requires: ['visibility_perplexity', 'visibility_openai', 'visibility_anthropic'],
        requireMode: 'any',
        enables: 'Track whether AI answer engines cite your brand, with share-of-voice over time.',
        degraded: 'Visibility shows sample data until a provider key is added.',
        connectHint: 'Add a PERPLEXITY_API_KEY (recommended first), or an OPENAI_API_KEY / ANTHROPIC_API_KEY.',
    },
    ai_overviews: {
        label: 'Google AI Overviews tracking',
        scope: 'platform',
        requires: ['apify'],
        enables: 'Check whether you are cited in Google AI Overviews (scraped, no API).',
        degraded: 'AI Overviews stay sampled until Apify is connected.',
        connectHint: 'Add the APIFY_TOKEN platform secret.',
    },
    mention_finder: {
        label: 'Durable mention finder',
        scope: 'platform',
        requires: ['apify'],
        enables: 'Find real community threads and journalist requests where a disclosed answer belongs.',
        degraded: 'Mention finder stays off until Apify is connected.',
        connectHint: 'Add the APIFY_TOKEN platform secret.',
    },
};

/** The platform-secret keys the connector-proxy `capabilities` action reports. */
export const PLATFORM_CAPABILITY_KEYS = ['serp_metrics', 'visibility_perplexity', 'visibility_openai', 'visibility_anthropic', 'apify'];

const asBool = (v) => v === true;

/**
 * Resolve one capability against a context.
 * @param {string} id capability id (key of CAPABILITIES)
 * @param {object} [ctx]
 * @param {Record<string, boolean>} [ctx.platform] platform-secret booleans (from the reporter)
 * @param {string[]} [ctx.connectedProviders] connector ids with status 'connected' for the workspace
 * @returns {null | { id, label, scope, configured, alwaysOn, enables, degraded, connectHint, requires, missing }}
 */
export const resolveCapability = (id, ctx = {}) => {
    const cap = CAPABILITIES[id];
    if (!cap) return null;
    const platform = ctx.platform ?? {};
    const connected = new Set(ctx.connectedProviders ?? []);
    const mode = cap.requireMode ?? 'all';

    const present = (req) => (cap.scope === 'workspace' ? connected.has(req) : asBool(platform[req]));
    const missing = (cap.requires ?? []).filter((req) => !present(req));

    let configured;
    if (cap.alwaysOn) configured = true;
    else if ((cap.requires ?? []).length === 0) configured = true;
    else configured = mode === 'any' ? missing.length < cap.requires.length : missing.length === 0;

    return {
        id,
        label: cap.label,
        scope: cap.scope,
        configured,
        alwaysOn: Boolean(cap.alwaysOn),
        enables: cap.enables ?? '',
        degraded: cap.degraded ?? '',
        connectHint: cap.connectHint ?? '',
        requires: cap.requires ?? [],
        // For 'any' mode, missing is only meaningful when nothing is configured.
        missing: configured ? [] : missing,
    };
};

/** Resolve every capability into a { [id]: resolved } map. */
export const resolveCapabilities = (ctx = {}) =>
    Object.fromEntries(Object.keys(CAPABILITIES).map((id) => [id, resolveCapability(id, ctx)]));

/** Convenience boolean: is this capability configured in the given context? */
export const isCapabilityConfigured = (id, ctx = {}) => resolveCapability(id, ctx)?.configured ?? false;
