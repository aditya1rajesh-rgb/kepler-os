import { useEffect, useState } from 'react';
import { Megaphone, Sparkles } from '../../lib/icons';
import Panel, { PanelHeader } from '../ui/Panel';
import EmptyState from '../ui/EmptyState';
import { integrationService } from '../../services/integrationService';
import { adGenerationService } from '../../services/adGenerationService';

// ad_type=ALL (all ads) is broadly queryable only for EU-reached ads (DSA);
// elsewhere it skews to political/issue ads. Flag the EU ones.
const COUNTRIES = [
    { value: 'US', label: 'United States' },
    { value: 'GB', label: 'United Kingdom' },
    { value: 'CA', label: 'Canada' },
    { value: 'AU', label: 'Australia' },
    { value: 'IN', label: 'India' },
    { value: 'DE', label: 'Germany (EU — full ad set)' },
    { value: 'FR', label: 'France (EU — full ad set)' },
    { value: 'NL', label: 'Netherlands (EU — full ad set)' },
];

// Competitor intelligence from the Meta Ad Library → a structured read (per the
// competitor-profiling skill) that grounds differentiated creative. Reports the
// grounding brief up via onGroundingChange so the generator can use it.
const CompetitorAdsPanel = ({ workspaceId, onGroundingChange }) => {
    const [connected, setConnected] = useState(null); // null = loading
    const [form, setForm] = useState({ searchTerms: '', country: 'US' });
    const [read, setRead] = useState(null);
    const [grounding, setGrounding] = useState('');
    const [grounded, setGrounded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const st = await integrationService.getStatus(workspaceId, 'meta-ad-library');
                if (!cancelled) setConnected(st?.status === 'connected');
            } catch {
                if (!cancelled) setConnected(false);
            }
        })();
        return () => { cancelled = true; };
    }, [workspaceId]);

    const run = async () => {
        if (!form.searchTerms.trim()) { setError('Enter a competitor name or keyword to search.'); return; }
        setBusy(true);
        setError('');
        setRead(null);
        setGrounded(false);
        onGroundingChange?.('');
        try {
            const res = await integrationService.query(workspaceId, 'meta-ad-library', {
                searchTerms: form.searchTerms.trim(),
                countries: [form.country],
                limit: 25,
            });
            const ads = res?.ads ?? [];
            if (!ads.length) {
                setError(`No ads found for "${form.searchTerms}" in ${form.country}. Try a broader term, or an EU country for the full (non-political) ad set.`);
                return;
            }
            const analysis = await adGenerationService.analyzeCompetitorAds(workspaceId, ads);
            if (!analysis.ok) { setError(analysis.error || 'Could not analyze the ads.'); return; }
            setRead({ ...analysis.read, adCount: ads.length });
            setGrounding(analysis.groundingBrief);
            setGrounded(true);
            onGroundingChange?.(analysis.groundingBrief);
        } catch (e) {
            // Connector edge errors are already curated - show directly.
            setError(e?.message || 'Meta Ad Library search failed.');
        } finally {
            setBusy(false);
        }
    };

    const toggleGround = () => {
        const next = !grounded;
        setGrounded(next);
        onGroundingChange?.(next ? grounding : '');
    };

    if (connected === null || connected === false) {
        // Hidden until connected — Meta Ad Library is optional pure-upside.
        return connected === false ? (
            <Panel className="module-panel">
                <PanelHeader title="Competitor Intelligence · Meta Ad Library" meta="Ground creative in rivals' live ads" />
                <p className="cockpit__intel-hint">
                    Connect Meta Ad Library in <strong>Profile &amp; settings → Connectors</strong> to search competitors' live ads and ground your creative in them.
                </p>
            </Panel>
        ) : null;
    }

    return (
        <Panel className="module-panel">
            <PanelHeader
                title="Competitor Intelligence · Meta Ad Library"
                meta="Search rivals' live ads → a structured read that grounds differentiated creative"
            />
            {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
            <div className="builder-grid">
                <div className="input-group">
                    <label className="label-text">Competitor or keyword</label>
                    <input className="intel-input" type="text" placeholder="e.g. a competitor's brand name"
                        value={form.searchTerms} onChange={(e) => setForm({ ...form, searchTerms: e.target.value })} />
                </div>
                <div className="input-group">
                    <label className="label-text">Reached country</label>
                    <select className="intel-input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                        {COUNTRIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                </div>
            </div>
            <div className="module-toolbar module-toolbar--inline">
                <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
                    <Megaphone size={16} strokeWidth={1.8} /> {busy ? 'Analyzing…' : 'Analyze competitor ads'}
                </button>
                {read && (
                    <label className="prospect-row__select">
                        <input type="checkbox" checked={grounded} onChange={toggleGround} />
                        <span className="label-text"><Sparkles size={13} strokeWidth={1.8} /> Ground generation with this read</span>
                    </label>
                )}
            </div>

            {read && (
                <div className="data-section">
                    <p className="brand-intel-module__source-label">Read from {read.adCount} live ad{read.adCount === 1 ? '' : 's'} (facts from ad text only).</p>
                    {read.recommendation && <p className="tone-note">{read.recommendation}</p>}
                    {read.overusedPatterns?.length > 0 && (
                        <div className="data-section">
                            <label className="data-label">Overused by competitors (avoid)</label>
                            <div className="chip-container">
                                {read.overusedPatterns.map((p, i) => <span key={i} className="intel-chip">{p}</span>)}
                            </div>
                        </div>
                    )}
                    {read.gaps?.length > 0 && (
                        <div className="data-section">
                            <label className="data-label">Whitespace to own</label>
                            <div className="chip-container">
                                {read.gaps.map((g, i) => <span key={i} className="intel-chip">{g}</span>)}
                            </div>
                        </div>
                    )}
                    {read.ads?.length > 0 && (
                        <ul className="prospect-list">
                            {read.ads.map((a, i) => (
                                <li key={i} className="prospect-row">
                                    <div className="prospect-row__main">
                                        <span className="prospect-row__name">{a.pageName || 'Advertiser'} · {a.angle || 'angle'}</span>
                                        <span className="prospect-row__sub">{[a.hook, a.offer, a.format].filter(Boolean).join(' · ')}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                    {read.ads?.length === 0 && <EmptyState message="No structured angles extracted from this set." />}
                </div>
            )}
        </Panel>
    );
};

export default CompetitorAdsPanel;
