import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LoaderCircle, TriangleAlert } from '../lib/icons';
import AuthLayout from '../components/layout/AuthLayout';
import Panel from '../components/ui/Panel';
import { integrationService } from '../services/integrationService';
import { CONNECTORS } from '../lib/connectors';
import { workspacePath } from '../constants/routes';
import './GoogleOAuthCallback.css';

// Where to land after a given connector finishes its OAuth handshake.
const MODULE_BY_CONNECTOR = {
    gsc: 'seo-aeo',
    ga4: 'overview',
    'google-ads': 'ad-campaigns',
    'meta-ads': 'ad-campaigns',
    'meta-ad-library': 'ad-campaigns',
};

// The OAuth code + CSRF nonce are single-use. React StrictMode double-invokes
// effects (and re-renders can re-run the init), which would verify/exchange
// twice - the second reusing a spent code → a false "Bad Request" even after a
// successful connect. Cache both by their single-use key so both invocations
// share one result.
const verifiedStates = new Map();
const verifyStateOnce = (state) => {
    if (!state) return null;
    if (!verifiedStates.has(state)) verifiedStates.set(state, integrationService.verifyState(state));
    return verifiedStates.get(state);
};
const exchanges = new Map();
const exchangeOnce = (code, state) => {
    if (!exchanges.has(code)) exchanges.set(code, integrationService.exchangeCode(code, state));
    return exchanges.get(code);
};

const GoogleOAuthCallback = () => {
    const navigate = useNavigate();
    const [params] = useSearchParams();

    // Validate once (also consumes the CSRF nonce) - from render, not an effect.
    const [init] = useState(() => {
        const oauthError = params.get('error');
        const code = params.get('code');
        const state = params.get('state');
        const parsed = verifyStateOnce(state);
        return {
            code,
            state,
            workspaceId: parsed?.workspaceId ?? null,
            connectorId: parsed?.connectorId ?? 'gsc',
            valid: Boolean(!oauthError && code && parsed),
            oauthError,
        };
    });

    const connectorLabel = CONNECTORS.find((c) => c.id === init.connectorId)?.label ?? 'Connector';

    const [phase, setPhase] = useState(init.valid ? 'exchanging' : 'error');
    const [error, setError] = useState(
        init.oauthError
            ? `Google authorization was cancelled (${init.oauthError}).`
            : init.valid ? '' : 'This authorization link is invalid or expired. Please connect again.',
    );
    const [sites, setSites] = useState([]);
    const [saving, setSaving] = useState(false);

    const goToModule = () => navigate(workspacePath(init.workspaceId, MODULE_BY_CONNECTOR[init.connectorId] ?? 'overview'), { replace: true });

    useEffect(() => {
        if (!init.valid) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const res = await exchangeOnce(init.code, init.state);
                if (cancelled) return;
                if (!res.sites || res.sites.length <= 1) {
                    goToModule();
                } else {
                    setSites(res.sites);
                    setPhase('pickProperty');
                }
            } catch (e) {
                if (!cancelled) {
                    setError(e.message || 'Could not complete the connection.');
                    setPhase('error');
                }
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [init]);

    const chooseProperty = async (site) => {
        setSaving(true);
        try {
            await integrationService.setProperty(init.workspaceId, site);
            goToModule();
        } catch (e) {
            setError(e.message || 'Could not save the property.');
            setPhase('error');
            setSaving(false);
        }
    };

    return (
        <AuthLayout>
            <Panel className="oauth-callback">
                <p className="oauth-callback__eyebrow font-section">{connectorLabel}</p>
                {phase === 'exchanging' && (
                    <div className="oauth-callback__status">
                        <LoaderCircle size={22} strokeWidth={1.8} className="oauth-callback__spin" />
                        <p>Connecting {connectorLabel}…</p>
                    </div>
                )}
                {phase === 'pickProperty' && (
                    <div className="oauth-callback__pick">
                        <p className="oauth-callback__lead">Choose the property to connect:</p>
                        <ul className="oauth-callback__sites">
                            {sites.map((site) => (
                                <li key={site}>
                                    <button type="button" className="oauth-callback__site" disabled={saving} onClick={() => chooseProperty(site)}>
                                        {site}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {phase === 'error' && (
                    <div className="oauth-callback__status">
                        <TriangleAlert size={22} strokeWidth={1.8} className="oauth-callback__warn" />
                        <p className="oauth-callback__error">{error}</p>
                        <button type="button" className="btn btn-secondary" onClick={() => navigate('/', { replace: true })}>
                            Back to KEPLER
                        </button>
                    </div>
                )}
            </Panel>
        </AuthLayout>
    );
};

export default GoogleOAuthCallback;
