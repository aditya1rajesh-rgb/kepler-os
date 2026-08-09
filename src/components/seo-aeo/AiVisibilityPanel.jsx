import { useCallback, useEffect, useState } from 'react';
import Panel from '../ui/Panel';
import EmptyState from '../ui/EmptyState';
import { RefreshCw } from '../../lib/icons';
import { visibilityService } from '../../services/visibilityService';
import { useWorkspaceConfig } from '../../hooks/useWorkspaceConfig';
import { toUserMessage } from '../../lib/errors';

// AI Visibility — AEO share of voice (E30, moved from Measurement per S5).
//
// S5's rule: *modules are where you work, Measurement is where you see
// contribution*. Share of voice is work — you scan, you find prompts where a
// competitor is named and you are not, you write against the gap. Sitting in
// Measurement it was a report you looked at; sitting beside the SEO pipeline it
// is the input to the thing that acts on it. Measurement keeps AI share-of-voice
// only as a measure a goal can be set against.
//
// Extracted as a self-contained component that owns its own fetch, rather than
// lifting Measurement's state across two modules. It is the only consumer.

const fmt = (n) => new Intl.NumberFormat().format(Math.round(Number(n) || 0));
const pct = (x) => `${Math.round((Number(x) || 0) * 100)}%`;

const AiVisibilityPanel = ({ workspaceId }) => {
    const { brand } = useWorkspaceConfig(workspaceId);
    const [visibility, setVisibility] = useState(null);
    const [gaps, setGaps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const load = useCallback(async () => {
        try {
            const [vis, gapRows] = await Promise.all([
                // Resilient: a not-yet-migrated visibility_scans table must not
                // take the whole screen down.
                visibilityService.getLatestVisibility(workspaceId).catch(() => null),
                visibilityService.getVisibilityGaps(workspaceId).catch(() => []),
            ]);
            setVisibility(vis);
            setGaps(gapRows ?? []);
        } finally {
            setLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        (async () => { if (!cancelled) await load(); })();
        return () => { cancelled = true; };
    }, [workspaceId, load]);

    const runScan = async (mock = false) => {
        setScanning(true);
        setError('');
        setNotice('');
        try {
            const r = await visibilityService.runScan(workspaceId, { mock });
            await load();
            if (mock) {
                setNotice(`Sample scan — ${r.promptCount} prompts × ${r.surfaces.length} surfaces (illustrative, not real measurement).`);
            } else if (!r.promptCount) {
                setNotice(r.message || 'No buyer prompts could be generated yet.');
            } else if (!r.counts.ok) {
                setNotice('No AI surfaces are connected yet — connect Perplexity/OpenAI/Anthropic to measure live, or run a sample.');
            } else {
                setNotice(`Scan complete — share of voice ${pct(r.shareOfVoice)} across ${r.surfaces.length} surfaces.`);
            }
        } catch (e) {
            setError(toUserMessage(e, 'Could not run the visibility scan.'));
        } finally {
            setScanning(false);
        }
    };

    if (loading) return <EmptyState loading message="Loading AI visibility…" />;

    return (
        <>
            {error && <p className="brand-intel-module__error" role="alert">{error}</p>}
            {notice && <p className="brand-intel-module__source-label" role="status">{notice}</p>}

            <Panel variant="quiet">
                {!visibility ? (
                    <EmptyState message="No visibility scans yet. Run a scan to see whether AI assistants mention your brand when buyers ask category questions — connect providers for live data, or run a sample to preview the loop." />
                ) : (
                    <>
                        {!visibility.hasReal && (
                            <p className="brand-intel-module__source-label">
                                Sample data — providers not connected yet. Connect Perplexity / ChatGPT / Claude for live measurement.
                            </p>
                        )}
                        <div className="cockpit__intel-facts">
                            <div className="cockpit__intel-fact">
                                <span className="cockpit__intel-value">{pct(visibility.shareOfVoice)}</span>
                                <span className="cockpit__intel-label">Share of voice</span>
                            </div>
                            <div className="cockpit__intel-fact">
                                <span className="cockpit__intel-value">{pct(visibility.brandPresenceRate)}</span>
                                <span className="cockpit__intel-label">Answer presence</span>
                            </div>
                            <div className="cockpit__intel-fact">
                                <span className="cockpit__intel-value">{fmt(visibility.promptCount)}</span>
                                <span className="cockpit__intel-label">Prompts tracked</span>
                            </div>
                            <div className="cockpit__intel-fact">
                                <span className="cockpit__intel-value">{visibility.surfaces.length}</span>
                                <span className="cockpit__intel-label">Surfaces</span>
                            </div>
                        </div>

                        {visibility.perCompetitor?.length > 0 && (
                            <ul className="measurement-list measurement-sov">
                                <li className="measurement-row measurement-sov__row">
                                    <span className="measurement-row__title">{brand?.name || 'Your brand'}</span>
                                    <span className="measurement-sov__bar"><span className="measurement-sov__fill" style={{ width: pct(visibility.shareOfVoice) }} /></span>
                                    <span className="measurement-sov__val">{pct(visibility.shareOfVoice)}</span>
                                </li>
                                {visibility.perCompetitor.map((c) => (
                                    <li key={c.name} className="measurement-row measurement-sov__row">
                                        <span className="measurement-row__title">{c.name}</span>
                                        <span className="measurement-sov__bar"><span className="measurement-sov__fill measurement-sov__fill--comp" style={{ width: pct(c.share) }} /></span>
                                        <span className="measurement-sov__val">{pct(c.share)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {gaps.length > 0 && (
                            <div className="measurement-gaps">
                                <p className="brand-intel-module__source-label">Content opportunities — buyers ask these and a competitor is named, but you are not:</p>
                                <ul className="measurement-list">
                                    {gaps.slice(0, 8).map((g) => (
                                        <li key={`${g.surface}:${g.prompt}`} className="measurement-row">
                                            <span className="measurement-row__title">{g.prompt}</span>
                                            <span className="measurement-sov__val">{g.competitors.slice(0, 3).join(', ')}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </>
                )}

                <div className="intel-action-row">
                    <button type="button" className="btn btn-primary" onClick={() => runScan(false)} disabled={scanning}>
                        <RefreshCw size={15} strokeWidth={1.8} /> {scanning ? 'Scanning…' : 'Run visibility scan'}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => runScan(true)} disabled={scanning}>
                        Run sample
                    </button>
                </div>
            </Panel>
        </>
    );
};

export default AiVisibilityPanel;
