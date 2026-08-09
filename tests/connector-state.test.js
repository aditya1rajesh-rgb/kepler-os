// E29 · connector state + scope visibility. The whole point is that a card no
// longer says "connected" when publishing would fail, so the rule that decides
// that is tested rather than trusted.
import { describe, expect, it } from 'vitest';
import {
    capabilityReport,
    compareByState,
    connectorState,
    grantedScopes,
    missingCapabilities,
} from '../src/lib/connectorState.js';
import { CONNECTORS } from '../src/lib/connectors.js';

const linkedin = () => CONNECTORS.find((c) => c.id === 'linkedin');
const gsc = () => CONNECTORS.find((c) => c.id === 'gsc');

const status = (over = {}) => ({ status: 'connected', lastError: '', meta: {}, ...over });

describe('connectorState — what Kepler has not done outranks the workspace', () => {
    it('reports a planned connector as coming soon', () => {
        expect(connectorState({ status: 'planned' }, null).state).toBe('planned');
    });

    it('names the gate on an approval-pending connector', () => {
        const s = connectorState(
            { status: 'approval_pending', approval: { gate: 'LinkedIn MDP partner status' } },
            null,
        );
        expect(s.state).toBe('approval_pending');
        expect(s.detail).toContain('LinkedIn MDP partner status');
    });

    it('never claims approval pending without a cause', () => {
        expect(connectorState({ status: 'approval_pending' }, null).detail).toBeTruthy();
    });

    it('shows an unconfigured OAuth deployment as setup required, not available', () => {
        expect(connectorState(gsc(), null, { oauthConfigured: false }).state).toBe('setup_required');
        expect(connectorState(gsc(), null, { oauthConfigured: true }).state).toBe('available');
    });

    it('platform-managed connectors say whether they are in your scans', () => {
        const on = connectorState({ status: 'platform_managed' }, { configured: true });
        const off = connectorState({ status: 'platform_managed' }, { configured: false });
        expect(on.state).toBe('platform_managed');
        expect(on.detail).toMatch(/included/i);
        expect(off.detail).toMatch(/excluded/i);
    });
});

describe('connectorState — degraded', () => {
    it('flags an expired connection', () => {
        const s = connectorState(gsc(), status({ status: 'expired' }));
        expect(s.state).toBe('degraded');
        expect(s.detail).toMatch(/expired/i);
    });

    it('flags a rejected connection', () => {
        expect(connectorState(gsc(), status({ status: 'invalid' })).state).toBe('degraded');
    });

    it('surfaces a recorded error as the reason', () => {
        const s = connectorState(gsc(), status({ lastError: 'Property no longer accessible' }));
        expect(s.state).toBe('degraded');
        expect(s.detail).toBe('Property no longer accessible');
    });

    it('flags a connection that was granted read but not write', () => {
        // The failure E29 exists to prevent: looks connected, fails at push time.
        const s = connectorState(linkedin(), status({ meta: { scopes: ['openid', 'profile'] } }));
        expect(s.state).toBe('degraded');
        expect(s.detail).toMatch(/write was not granted/i);
    });

    it('agrees in number when several capabilities are missing', () => {
        const ads = CONNECTORS.find((c) => c.id === 'meta-ads');
        const s = connectorState(ads, status({ meta: { scopes: ['ads_read'] } }));
        expect(s.detail).toMatch(/write and targeting were not granted/i);
        expect(s.detail).not.toMatch(/was not granted/i);
    });

    it('is plain connected when every declared scope was granted', () => {
        const s = connectorState(linkedin(), status({ meta: { scopes: ['openid', 'profile', 'w_member_social'] } }));
        expect(s.state).toBe('connected');
        expect(s.detail).toBe('');
    });
});

describe('grantedScopes — absent metadata is unknown, not empty', () => {
    it('returns null when nothing was recorded', () => {
        expect(grantedScopes(linkedin(), status())).toBeNull();
    });

    it('does not degrade an older connection that predates scope recording', () => {
        // Treating "no record" as "nothing granted" would flag every historical
        // connection — noise, not signal.
        expect(connectorState(linkedin(), status()).state).toBe('connected');
    });
});

describe('capabilityReport', () => {
    it('marks each declared capability granted or not', () => {
        const rows = capabilityReport(linkedin(), status({ meta: { scopes: ['openid', 'profile'] } }));
        expect(rows.find((r) => r.id === 'read').granted).toBe(true);
        const write = rows.find((r) => r.id === 'write');
        expect(write.granted).toBe(false);
        expect(write.missing).toEqual(['w_member_social']);
    });

    it('reports unknown rather than false when scopes were not recorded', () => {
        expect(capabilityReport(linkedin(), status()).every((r) => r.granted === null)).toBe(true);
    });

    it('reports not-granted for a connector with no connection at all', () => {
        expect(capabilityReport(linkedin(), null).every((r) => r.granted === false)).toBe(true);
    });

    it('is empty for a connector that declares no capabilities', () => {
        expect(capabilityReport({ id: 'x' }, status())).toEqual([]);
    });

    it('handles an API-key connector with no per-scope split', () => {
        const zoho = CONNECTORS.find((c) => c.id === 'zoho');
        const rows = capabilityReport(zoho, status());
        expect(rows.map((r) => r.id)).toEqual(['read', 'write']);
        expect(missingCapabilities(zoho, status())).toEqual([]);
    });
});

describe('compareByState — attention first', () => {
    it('sorts a broken connection above a working one', () => {
        const rows = [
            connectorState(gsc(), status()),
            connectorState(gsc(), status({ status: 'expired' })),
            connectorState({ status: 'planned' }, null),
        ].sort(compareByState);
        expect(rows.map((r) => r.state)).toEqual(['degraded', 'connected', 'planned']);
    });
});

describe('the registry itself', () => {
    it('gives every capability a scope map wherever scopes are requested', () => {
        for (const c of CONNECTORS) {
            if (!c.oauth || !c.capabilities) continue;
            for (const cap of c.capabilities) {
                expect(c.capabilityScopes?.[cap], `${c.id}.${cap}`).toBeTruthy();
            }
        }
    });

    it('has the eighth category (AI visibility) and marks it platform-managed', () => {
        const ai = CONNECTORS.filter((c) => c.category === 'AI visibility');
        expect(ai.length).toBeGreaterThan(0);
        expect(ai.every((c) => c.status === 'platform_managed')).toBe(true);
        expect(ai.every((c) => Boolean(c.platformCapability))).toBe(true);
    });
});
