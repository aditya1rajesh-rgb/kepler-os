import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';
import { callAI } from './aiClient';
import { feedbackService } from './feedbackService';
import { brandService } from './brandService';
import { FIELD_ORIGINS } from '../lib/brandContracts';
import { createProvenanceEntry } from '../lib/provenance';

// Routes generation feedback UP into the brand model — the Phase-3 "brand core
// learns from results" loop. Where feedbackService.getGuidance() tunes the NEXT
// generation prompt, this service mines what consistently WINS (high-rated
// (module, label) patterns) and proposes durable brand-model updates — as
// reviewable 'field' suggestions in brand_suggestions, never silent writes.
// See [[feedback-learning-loop]] and [[aeo-wedge-roadmap]].

const assertWorkspaceId = (workspaceId) => {
    if (!isUuid(workspaceId)) throw new Error('Invalid workspace id');
};

// A (module, label) pattern must be rated this often, this well, to count as a
// signal worth promoting into the brand model.
const MIN_RATINGS = 3;
const MIN_AVG = 4.25;
const FEEDBACK_WINDOW = 200;

/** Brand fields learnings may target, with apply semantics. */
export const LEARNABLE_FIELDS = {
    tone: { label: 'Voice & tone', kind: 'array' },
    'businessDetails.keyMessages': { label: 'Key messages', kind: 'array' },
    'businessDetails.differentiators': { label: 'Differentiators', kind: 'scalar' },
};

/** Group feedback rows into winning (module, label) patterns. Pure. */
export const mineWinningPatterns = (rows = []) => {
    const groups = new Map();
    for (const r of rows) {
        const label = String(r.label ?? '').trim();
        if (!label) continue; // unlabeled ratings carry no reusable pattern
        const key = `${r.module}|${label}`;
        const g = groups.get(key) || { module: r.module, label, count: 0, sum: 0 };
        g.count += 1;
        g.sum += Number(r.rating) || 0;
        groups.set(key, g);
    }
    return [...groups.values()]
        .map((g) => ({ module: g.module, label: g.label, count: g.count, avgRating: Math.round((g.sum / g.count) * 100) / 100 }))
        .filter((g) => g.count >= MIN_RATINGS && g.avgRating >= MIN_AVG)
        .sort((a, b) => b.avgRating - a.avgRating || b.count - a.count);
};

const valueAtPath = (brand, path) => (path.startsWith('businessDetails.')
    ? brand?.businessDetails?.[path.split('.')[1]]
    : brand?.[path]);

const alreadyPresent = (current, proposed) => {
    const p = String(proposed ?? '').trim().toLowerCase();
    if (!p) return true;
    if (Array.isArray(current)) return current.some((v) => String(v).trim().toLowerCase() === p);
    return String(current ?? '').toLowerCase().includes(p);
};

const SYSTEM_PROMPT = `You distill marketing performance signals into durable brand-model updates.
Given a brand's current voice/messaging and a list of output patterns users consistently rated highly,
propose at most 3 small, concrete brand-model updates that capture WHY those outputs win.
Rules:
- Only the allowed fieldPaths.
- proposedValue must be short: a tone descriptor (1-3 words), one key message (a single sentence), or one differentiator clause.
- Never contradict or remove existing brand data; only add or sharpen.
- Only propose what the evidence actually supports. Fewer, sharper proposals beat many weak ones. Return an empty list if the patterns support nothing durable.`;

export const brandLearningService = {
    /**
     * Mine recent feedback for winning patterns and file them as pending 'field'
     * suggestions. Returns { ok, generated, patterns, reason? }.
     */
    generateLearnedSuggestions: async (workspaceId) => {
        assertWorkspaceId(workspaceId);

        const rows = await feedbackService.getRecent(workspaceId, undefined, { limit: FEEDBACK_WINDOW });
        const patterns = mineWinningPatterns(rows);
        if (!patterns.length) {
            return { ok: true, generated: 0, patterns: [], reason: 'no-winning-patterns' };
        }

        const brand = await brandService.getBrandIdentity(workspaceId);
        const current = {
            tone: brand?.tone ?? [],
            keyMessages: brand?.businessDetails?.keyMessages ?? [],
            differentiators: brand?.businessDetails?.differentiators ?? '',
        };

        const prompt = `CURRENT BRAND MODEL
Tone: ${current.tone.join(', ') || '(empty)'}
Key messages: ${current.keyMessages.join(' | ') || '(empty)'}
Differentiators: ${current.differentiators || '(empty)'}

CONSISTENTLY HIGH-RATED OUTPUT PATTERNS (module / context — ratings)
${patterns.map((p) => `- ${p.module} / ${p.label} — ${p.count} ratings, avg ${p.avgRating}★`).join('\n')}

Allowed fieldPaths: ${Object.keys(LEARNABLE_FIELDS).join(', ')}

Return JSON: {"fieldSuggestions":[{"fieldPath":"...","action":"add"|"revise","proposedValue":"...","rationale":"one sentence: why this pattern justifies this update","evidence":["module/label avg★ xN", ...]}]}`;

        const res = await callAI(prompt, { systemPrompt: SYSTEM_PROMPT, json: true, maxTokens: 1200, temperature: 0.4 });
        const proposed = Array.isArray(res?.fieldSuggestions) ? res.fieldSuggestions : [];

        // Keep only valid, novel proposals not already pending review.
        const pending = (await brandService.getSuggestions(workspaceId)).filter((s) => s.type === 'field');
        const isDuplicate = (sug) => pending.some((p) =>
            p.payload?.fieldPath === sug.fieldPath
            && String(p.payload?.proposedValue ?? '').trim().toLowerCase() === String(sug.proposedValue ?? '').trim().toLowerCase());

        const inserts = proposed
            .filter((s) => LEARNABLE_FIELDS[s?.fieldPath])
            .filter((s) => String(s?.proposedValue ?? '').trim())
            .filter((s) => !alreadyPresent(valueAtPath(brand, s.fieldPath), s.proposedValue))
            .filter((s) => !isDuplicate(s))
            .slice(0, 3)
            .map((s) => ({
                workspace_id: workspaceId,
                suggestion_type: 'field',
                origin: 'ai',
                status: 'pending',
                payload: {
                    fieldPath: s.fieldPath,
                    action: s.action === 'revise' ? 'revise' : 'add',
                    proposedValue: String(s.proposedValue).trim(),
                    rationale: String(s.rationale ?? '').trim(),
                    evidence: Array.isArray(s.evidence) ? s.evidence.map(String) : [],
                },
            }));

        if (inserts.length) {
            const { error } = await supabase.from('brand_suggestions').insert(inserts);
            if (error) throw error;
        }
        return { ok: true, generated: inserts.length, patterns };
    },

    /**
     * Apply an accepted 'field' suggestion to the brand model (explicit user
     * approval), stamping provenance origin 'learned'. Returns the updated brand.
     */
    applyFieldSuggestion: async (workspaceId, suggestion) => {
        assertWorkspaceId(workspaceId);
        const { fieldPath, action, proposedValue, evidence = [] } = suggestion?.payload ?? {};
        const spec = LEARNABLE_FIELDS[fieldPath];
        if (!spec) throw new Error(`Unsupported learnable field: ${fieldPath}`);

        const brand = await brandService.getBrandIdentity(workspaceId);
        if (!brand) throw new Error('Brand profile not found');

        const next = {
            ...brand,
            businessDetails: { ...(brand.businessDetails ?? {}) },
        };
        const value = String(proposedValue ?? '').trim();

        if (spec.kind === 'array') {
            const currentArr = valueAtPath(brand, fieldPath) ?? [];
            const merged = alreadyPresent(currentArr, value) ? currentArr : [...currentArr, value];
            if (fieldPath === 'tone') next.tone = merged;
            else next.businessDetails[fieldPath.split('.')[1]] = merged;
        } else {
            const key = fieldPath.split('.')[1];
            const currentVal = String(valueAtPath(brand, fieldPath) ?? '').trim();
            next.businessDetails[key] = action === 'revise' || !currentVal
                ? value
                : `${currentVal}${currentVal.endsWith('.') ? '' : '.'} ${value}`;
        }

        next.fieldProvenance = {
            ...(brand.fieldProvenance ?? {}),
            [fieldPath]: createProvenanceEntry(
                FIELD_ORIGINS.LEARNED,
                `feedback:${evidence.slice(0, 2).join('; ') || 'high-rated outputs'}`,
            ),
        };

        const updated = await brandService.upsertBrandIdentity(workspaceId, next);

        const { error } = await supabase
            .from('brand_suggestions')
            .update({ status: 'accepted' })
            .eq('id', suggestion.id)
            .eq('workspace_id', workspaceId);
        if (error) throw error;

        return updated;
    },
};

export default brandLearningService;
