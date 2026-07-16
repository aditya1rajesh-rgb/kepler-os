import { useEffect, useRef, useState } from 'react';
import { Telescope, Sparkles } from '../../lib/icons';
import Panel, { PanelHeader } from '../../components/ui/Panel';
import FeedbackInsight from '../../components/ui/FeedbackInsight';
import AbmResultCard from '../../components/abm-research/AbmResultCard';
import { abmResearchService } from '../../services/abmResearchService';
import '../../styles/module-kepler.css';
import './AbmResearch.css';

// ABM Research sub-module of Outreach: a chat layer (name a company) over a data
// layer (account brief + validated contacts). Each turn runs the grounded
// research -> Apollo -> validate pipeline in [[abmResearchService]] and renders a
// self-contained result card. The transcript is session state; persistence is an
// explicit action on each card (Save research / Save to prospect list).

let turnCounter = 0;

const AbmResearch = ({ workspaceId }) => {
    const [transcript, setTranscript] = useState([]); // { id, query, status, result?, error? }
    const [pending, setPending] = useState(false);
    const [text, setText] = useState('');
    const [feedbackVersion, setFeedbackVersion] = useState(0);
    const logRef = useRef(null);

    useEffect(() => {
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
    }, [transcript, pending]);

    const run = async () => {
        const company = text.trim();
        if (!company || pending) return;
        const id = ++turnCounter;
        setTranscript((t) => [...t, { id, query: company, status: 'loading' }]);
        setText('');
        setPending(true);
        try {
            const res = await abmResearchService.researchAccount(workspaceId, { companyName: company });
            setTranscript((t) => t.map((e) => (e.id === id
                ? (res.ok
                    ? { ...e, status: 'done', result: res }
                    : { ...e, status: 'error', error: res.error })
                : e)));
        } catch (err) {
            setTranscript((t) => t.map((e) => (e.id === id ? { ...e, status: 'error', error: err.message } : e)));
        } finally {
            setPending(false);
        }
    };

    return (
        <div className="abm-research-module module-kepler">
            <Panel>
                <PanelHeader
                    title="ABM Research"
                    meta="Research a target account, classify it against your ICP, and surface validated contacts."
                />
                <FeedbackInsight workspaceId={workspaceId} module="abm" refreshKey={feedbackVersion} />
            </Panel>

            <Panel className="module-panel abm-chat">
                <div className="abm-chat__log" ref={logRef} role="log" aria-live="polite">
                    <div className="abm-msg abm-msg--assistant">
                        <div className="abm-bubble abm-bubble--assistant abm-bubble--intro">
                            <span className="abm-bubble__eyebrow font-section">
                                <Sparkles size={13} strokeWidth={1.8} /> ABM analyst
                            </span>
                            <p className="abm-bubble__content">
                                Name a target company (or paste its website) and I'll research it live, grade the ICP fit
                                against your saved brand &amp; ICP, and pull the leaders worth pitching.
                            </p>
                        </div>
                    </div>

                    {transcript.map((e) => (
                        <div key={e.id} className="abm-turn">
                            <div className="abm-msg abm-msg--user">
                                <div className="abm-bubble abm-bubble--user">{e.query}</div>
                            </div>
                            {e.status === 'loading' && (
                                <div className="abm-msg abm-msg--assistant">
                                    <div className="abm-bubble abm-bubble--assistant abm-typing" aria-label="Researching">
                                        <span /><span /><span />
                                    </div>
                                </div>
                            )}
                            {e.status === 'error' && (
                                <p className="brand-intel-module__error" role="alert">{e.error}</p>
                            )}
                            {e.status === 'done' && (
                                <AbmResultCard
                                    workspaceId={workspaceId}
                                    result={e.result}
                                    onFeedback={() => setFeedbackVersion((v) => v + 1)}
                                />
                            )}
                        </div>
                    ))}
                </div>

                <div className="abm-composer">
                    <input
                        className="intel-input abm-composer__input"
                        type="text"
                        placeholder="Company name or website, e.g. Localiza or stripe.com"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } }}
                        disabled={pending}
                    />
                    <button type="button" className="btn btn-primary" onClick={run} disabled={pending || !text.trim()}>
                        <Telescope size={16} strokeWidth={1.8} /> {pending ? 'Researching…' : 'Research'}
                    </button>
                </div>
            </Panel>
        </div>
    );
};

export default AbmResearch;
