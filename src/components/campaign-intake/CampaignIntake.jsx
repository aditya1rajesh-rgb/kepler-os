import { useEffect, useRef, useState } from 'react';
import {
    Sparkles,
    Send,
    ArrowRight,
    Search,
    Megaphone,
    AtSign,
    Send as SendIcon,
    Check,
    Target,
} from '../../lib/icons';
import { useCampaignIntake } from './useCampaignIntake';
import { CAMPAIGN_TEMPLATES } from '../../lib/campaignPlan';
import './CampaignIntake.css';

const STEP_ICONS = {
    'seo-aeo': Search,
    'ad-campaigns': Megaphone,
    outreach: SendIcon,
    'social-media': AtSign,
};
const STEP_LABELS = {
    'seo-aeo': 'SEO & AEO',
    'ad-campaigns': 'Ad Campaigns',
    outreach: 'Outreach',
    'social-media': 'Social Media',
};

const IntakeMessage = ({ message }) => {
    if (message.role === 'user') {
        return (
            <div className="intake-msg intake-msg--user">
                <div className="intake-bubble intake-bubble--user">{message.content}</div>
            </div>
        );
    }
    return (
        <div className="intake-msg intake-msg--assistant">
            <div className="intake-bubble intake-bubble--assistant">
                <span className="intake-bubble__eyebrow font-section">KEPLER strategist</span>
                <p className="intake-bubble__content">{message.content}</p>
                {message.meta?.rationale && (
                    <p className="intake-bubble__rationale">{message.meta.rationale}</p>
                )}
                {message.meta?.assumptions?.length > 0 && (
                    <ul className="intake-bubble__assumptions">
                        {message.meta.assumptions.map((a) => <li key={a}>Assuming: {a}</li>)}
                    </ul>
                )}
            </div>
        </div>
    );
};

const TypingIndicator = () => (
    <div className="intake-msg intake-msg--assistant">
        <div className="intake-bubble intake-bubble--assistant intake-typing" aria-label="Strategist is thinking">
            <span /><span /><span />
        </div>
    </div>
);

const QuickReplyChips = ({ replies, onPick, disabled }) => (
    <div className="intake-quickreplies">
        {replies.map((r) => (
            <button key={r} type="button" className="intake-chip" onClick={() => onPick(r)} disabled={disabled}>
                {r}
            </button>
        ))}
    </div>
);

const PlanPreview = ({ plan, onAccept, pending }) => (
    <div className="intake-plan">
        <div className="intake-plan__head">
            <span className="intake-plan__type">{CAMPAIGN_TEMPLATES[plan.campaignType]?.label ?? plan.campaignType}</span>
            <h3 className="intake-plan__goal font-section">{plan.goal}</h3>
        </div>
        <ol className="intake-plan__steps">
            {plan.steps.map((s) => {
                const Icon = STEP_ICONS[s.module] ?? Target;
                return (
                    <li key={s.id} className="intake-plan__step">
                        <span className="intake-plan__step-icon"><Icon size={15} strokeWidth={1.7} /></span>
                        <span className="intake-plan__step-body">
                            <span className="intake-plan__step-title">{s.title}
                                <span className="intake-plan__step-mod">{STEP_LABELS[s.module] ?? s.module}</span>
                            </span>
                            {s.brief && <span className="intake-plan__step-brief">{s.brief}</span>}
                        </span>
                    </li>
                );
            })}
        </ol>
        {plan.successCriteria?.length > 0 && (
            <ul className="intake-plan__criteria">
                {plan.successCriteria.map((c) => <li key={c}><Target size={12} strokeWidth={1.8} /> {c}</li>)}
            </ul>
        )}
        <div className="intake-plan__actions">
            <button type="button" className="btn btn-primary" onClick={onAccept} disabled={pending}>
                <Check size={16} strokeWidth={1.9} /> {pending ? 'Creating…' : 'Create this campaign'}
            </button>
            <span className="intake-plan__refine-hint">Not quite? Keep chatting below to refine it.</span>
        </div>
    </div>
);

const IntakeComposer = ({ onSend, disabled, placeholder }) => {
    const [text, setText] = useState('');
    const submit = () => {
        const t = text.trim();
        if (!t || disabled) return;
        onSend(t);
        setText('');
    };
    return (
        <div className="intake-composer">
            <textarea
                className="intake-composer__input"
                rows={1}
                placeholder={placeholder}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
                }}
            />
            <button type="button" className="intake-composer__send btn btn-primary" onClick={submit} disabled={disabled || !text.trim()}>
                <Send size={16} strokeWidth={1.9} />
            </button>
        </div>
    );
};

const CampaignIntake = ({ workspaceId, seedType = '', onCreated }) => {
    const { transcript, phase, plan, pending, error, sendMessage, chooseQuickReply, requestPlan, acceptPlan } =
        useCampaignIntake(workspaceId, { seedType, onCreated });

    const scrollRef = useRef(null);
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [transcript, pending]);

    const lastAssistant = [...transcript].reverse().find((m) => m.role === 'assistant');
    const quickReplies = !pending && phase === 'interviewing' ? (lastAssistant?.meta?.quickReplies ?? []) : [];

    if (error?.kind === 'insufficient_context') {
        return (
            <div className="campaign-intake campaign-intake--error">
                <p className="intake-error">{error.message}</p>
            </div>
        );
    }

    return (
        <div className="campaign-intake">
            <div className="campaign-intake__convo" ref={scrollRef} role="log" aria-live="polite">
                <div className="intake-msg intake-msg--assistant">
                    <div className="intake-bubble intake-bubble--assistant intake-bubble--intro">
                        <span className="intake-bubble__eyebrow font-section">
                            <Sparkles size={13} strokeWidth={1.8} /> KEPLER strategist
                        </span>
                        <p className="intake-bubble__content">
                            Let's shape a campaign. Tell me the goal and I'll design a coordinated plan across your channels -
                            I'll only ask what I can't already tell from your brand.
                        </p>
                    </div>
                </div>
                {transcript.map((m) => <IntakeMessage key={m.id} message={m} />)}
                {pending && <TypingIndicator />}
            </div>

            {plan && phase !== 'error' && (
                <PlanPreview plan={plan} onAccept={acceptPlan} pending={pending} />
            )}

            {quickReplies.length > 0 && (
                <QuickReplyChips replies={quickReplies} onPick={chooseQuickReply} disabled={pending} />
            )}

            {error && error.kind !== 'insufficient_context' && (
                <p className="intake-error">{error.message}</p>
            )}

            {phase !== 'accepted' && (
                <>
                    <IntakeComposer
                        onSend={sendMessage}
                        disabled={pending}
                        placeholder={plan ? 'Refine the plan, or create it above…' : 'Describe your goal…'}
                    />
                    {!plan && (
                        <button type="button" className="intake-justbuild" onClick={requestPlan} disabled={pending}>
                            Skip the questions - just build a plan <ArrowRight size={13} strokeWidth={1.8} />
                        </button>
                    )}
                </>
            )}
        </div>
    );
};

export default CampaignIntake;
