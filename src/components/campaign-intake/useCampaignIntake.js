import { useCallback, useEffect, useState } from 'react';
import { campaignIntakeService } from '../../services/campaignIntakeService';
import { campaignService } from '../../services/campaignService';

let msgSeq = 0;
const nextMsgId = () => {
    msgSeq += 1;
    return `m${msgSeq}-${Date.now()}`;
};

/**
 * Drives the conversational campaign intake. Owns the transcript, the interview
 * phase, and the emitted plan. Ephemeral (React state) for v1 - an in-progress
 * conversation is not persisted (the spine owns campaign persistence).
 *
 * phase: 'interviewing' | 'proposing' | 'accepted' | 'error'
 */
export const useCampaignIntake = (workspaceId, { seedType = '', onCreated } = {}) => {
    const [transcript, setTranscript] = useState([]);
    const [phase, setPhase] = useState('interviewing');
    const [plan, setPlan] = useState(null);
    const [pending, setPending] = useState(true); // true for the opening question
    const [error, setError] = useState(null);

    // Apply a nextTurn result. Called only after an await (safe outside effects too).
    const applyResult = useCallback((res) => {
        if (!res.ok) {
            setError({ kind: res.errorKind ?? 'ai_error', message: res.error });
            setPhase('error');
            return;
        }
        setError(null);
        const { turn } = res;
        if (turn.mode === 'plan') {
            setPlan(turn.plan);
            setTranscript((prev) => [...prev, {
                id: nextMsgId(),
                role: 'assistant',
                content: turn.plan.strategySummary || `Here's a plan for: ${turn.plan.goal}`,
                meta: { mode: 'plan', assumptions: turn.plan.meta?.assumptions ?? [] },
            }]);
            setPhase('proposing');
        } else {
            setTranscript((prev) => [...prev, {
                id: nextMsgId(),
                role: 'assistant',
                content: turn.question,
                meta: { mode: 'question', rationale: turn.rationale, quickReplies: turn.quickReplies, field: turn.field },
            }]);
            setPhase('interviewing');
        }
    }, []);

    // Opening question - pending defaults true so the typing indicator shows
    // immediately; state is set only after the await (never synchronously here).
    useEffect(() => {
        if (!workspaceId) return undefined;
        let cancelled = false;
        (async () => {
            const res = await campaignIntakeService.nextTurn(workspaceId, { transcript: [], campaignType: seedType });
            if (cancelled) return;
            applyResult(res);
            setPending(false);
        })();
        return () => { cancelled = true; };
    }, [workspaceId, seedType, applyResult]);

    const runTurn = useCallback(async (nextTranscript, { forcePlan = false } = {}) => {
        setPending(true);
        try {
            const res = await campaignIntakeService.nextTurn(workspaceId, {
                transcript: nextTranscript,
                campaignType: seedType,
                forcePlan,
            });
            applyResult(res);
        } finally {
            setPending(false);
        }
    }, [workspaceId, seedType, applyResult]);

    const sendMessage = useCallback((text) => {
        const trimmed = String(text ?? '').trim();
        if (!trimmed || pending) return;
        const userMsg = { id: nextMsgId(), role: 'user', content: trimmed };
        const next = [...transcript, userMsg];
        setTranscript(next);
        runTurn(next);
    }, [transcript, pending, runTurn]);

    const requestPlan = useCallback(() => {
        if (pending) return;
        const userMsg = { id: nextMsgId(), role: 'user', content: 'Build the plan with what you have.' };
        const next = [...transcript, userMsg];
        setTranscript(next);
        runTurn(next, { forcePlan: true });
    }, [transcript, pending, runTurn]);

    const acceptPlan = useCallback(async () => {
        if (!plan) return;
        setPhase('accepted');
        setPending(true);
        try {
            const created = await campaignService.createCampaign(workspaceId, {
                title: plan.goal?.slice(0, 80) || 'Untitled campaign',
                goal: plan.goal,
                campaignType: plan.campaignType,
                plan,
                source: 'intake',
            });
            onCreated?.(created);
        } catch (err) {
            setError({ kind: 'save_error', message: err.message || 'Could not create the campaign.' });
            setPhase('proposing');
        } finally {
            setPending(false);
        }
    }, [plan, workspaceId, onCreated]);

    return {
        transcript,
        phase,
        plan,
        pending,
        error,
        sendMessage,
        chooseQuickReply: sendMessage,
        requestPlan,
        acceptPlan,
    };
};

export default useCampaignIntake;
