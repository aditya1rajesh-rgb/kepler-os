// Connector state + scope visibility (E29, from roadmap S10).
//
// "Today's UI knows only connected/disconnected." That was true, and it stopped
// being sufficient the moment connectors started arriving that are BUILT but not
// yet APPROVED (E13/E19/E21/E24 all wait on E27's nine platform reviews), and
// the moment write scopes started to matter — a read-only connection that looks
// identical to a full one fails silently at push time, which is the worst
// possible place to discover it.
//
// The rule this file encodes: a connector's state answers "can I use this, and
// for what?" — never just "is there a row in the database".

/** What a connector can do once its scopes are actually granted. */
export const CAPABILITY_LABELS = {
    read: 'Read',
    write: 'Write',
    targeting: 'Targeting',
};

export const CAPABILITY_ORDER = ['read', 'write', 'targeting'];

/**
 * Connection states, worst-to-best for sorting. `degraded` sorts ABOVE connected
 * deliberately: a broken connection needs attention more than a working one.
 */
export const CONNECTOR_STATES = {
    planned: { label: 'Coming soon', tone: 'muted', rank: 6 },
    approval_pending: { label: 'Approval pending', tone: 'warn', rank: 3 },
    setup_required: { label: 'Setup required', tone: 'muted', rank: 5 },
    platform_managed: { label: 'Managed by Kepler', tone: 'info', rank: 4 },
    available: { label: 'Available', tone: 'neutral', rank: 2 },
    degraded: { label: 'Needs attention', tone: 'warn', rank: 0 },
    connected: { label: 'Connected', tone: 'ok', rank: 1 },
};

/** Row statuses that mean the connection exists but does not work. */
const BROKEN_STATUSES = new Set(['expired', 'invalid', 'disconnected']);

/**
 * Scopes the provider actually granted. OAuth providers may grant a subset of
 * what was requested (the user unticks a box on the consent screen), and that
 * subset is what determines whether publishing works.
 *
 * Absent metadata is treated as "everything requested was granted" rather than
 * "nothing was" — an older row predates scope recording, and flagging every
 * historical connection as degraded would be noise, not signal.
 */
export const grantedScopes = (connector, status) => {
    const recorded = status?.meta?.scopes;
    if (!Array.isArray(recorded)) return null; // unknown — assume intact
    return recorded;
};

/**
 * Per-capability grant report for a connected connector.
 * `granted: null` means unknowable rather than false.
 */
export const capabilityReport = (connector, status) => {
    const declared = Array.isArray(connector?.capabilities) ? connector.capabilities : [];
    if (!declared.length) return [];
    const granted = grantedScopes(connector, status);

    return declared.map((id) => {
        const required = connector.capabilityScopes?.[id] ?? [];
        if (!status || granted === null || !required.length) {
            return { id, label: CAPABILITY_LABELS[id] ?? id, granted: status ? null : false, missing: [] };
        }
        const missing = required.filter((s) => !granted.includes(s));
        return { id, label: CAPABILITY_LABELS[id] ?? id, granted: missing.length === 0, missing };
    });
};

/** Capabilities the connector claims but this connection cannot actually do. */
export const missingCapabilities = (connector, status) =>
    capabilityReport(connector, status).filter((c) => c.granted === false && c.missing.length > 0);

/**
 * The single state a card should render.
 *
 * Order matters: what Kepler has not built or had approved outranks anything
 * about this workspace's connection, because no action here can change it.
 */
export const connectorState = (connector, status, { oauthConfigured = true } = {}) => {
    if (connector?.status === 'planned') {
        return { state: 'planned', ...CONNECTOR_STATES.planned, detail: '' };
    }

    if (connector?.status === 'approval_pending') {
        return {
            state: 'approval_pending',
            ...CONNECTOR_STATES.approval_pending,
            // Name the gate. "Approval pending" with no cause reads as a bug.
            detail: connector.approval?.gate
                ? `Waiting on ${connector.approval.gate}.`
                : 'Waiting on platform review.',
        };
    }

    if (connector?.status === 'platform_managed') {
        return {
            state: 'platform_managed',
            ...CONNECTOR_STATES.platform_managed,
            detail: status?.configured
                ? 'Configured. Included in your scans.'
                : 'Not configured yet, so it is excluded from your scans.',
        };
    }

    if (status) {
        if (BROKEN_STATUSES.has(status.status)) {
            return {
                state: 'degraded',
                ...CONNECTOR_STATES.degraded,
                detail: status.status === 'expired'
                    ? 'Access expired. Reconnect to resume.'
                    : 'The connection was rejected. Reconnect with fresh credentials.',
            };
        }
        if (status.lastError) {
            return { state: 'degraded', ...CONNECTOR_STATES.degraded, detail: status.lastError };
        }
        const missing = missingCapabilities(connector, status);
        if (missing.length) {
            // Connected and working, but not for everything it claims. Say which,
            // here, rather than letting a push fail later with a provider error.
            const names = missing.map((m) => (CAPABILITY_LABELS[m.id] ?? m.id).toLowerCase());
            const list = names.length > 1
                ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
                : names[0];
            return {
                state: 'degraded',
                ...CONNECTOR_STATES.degraded,
                detail: names.length > 1
                    ? `Connected, but ${list} were not granted. Reconnect to authorise them.`
                    : `Connected, but ${list} was not granted. Reconnect to authorise it.`,
            };
        }
        return { state: 'connected', ...CONNECTOR_STATES.connected, detail: '' };
    }

    if (connector?.authType === 'oauth' && !oauthConfigured) {
        return {
            state: 'setup_required',
            ...CONNECTOR_STATES.setup_required,
            detail: 'This deployment has no OAuth credentials for the provider.',
        };
    }

    return { state: 'available', ...CONNECTOR_STATES.available, detail: '' };
};

/** Attention first, then working, then everything you cannot act on. */
export const compareByState = (a, b) => a.rank - b.rank;
