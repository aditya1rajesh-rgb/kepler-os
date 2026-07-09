import { createField } from '../fieldFactory';
import { SOURCE_ORIGINS } from '../constants';
import { normalizeColorIdentity, normalizeBusinessDetails } from '../../../lib/brandContracts';

/**
 * Extract field candidates from AI synthesis output.
 * Supports combined origin when multiple source refs are provided.
 */
export const extractAiSource = (aiSynthesis, { sourceRefs = [], combined = false } = {}) => {
    if (!aiSynthesis) {
        return {
            fields: [],
            competitorSuggestions: [],
            icpSuggestions: [],
            meta: { source: 'ai', id: null },
        };
    }

    const refs = sourceRefs.length ? sourceRefs : ['ai:synthesis'];
    const origin = combined ? SOURCE_ORIGINS.COMBINED : SOURCE_ORIGINS.AI_SUGGESTION;
    const confidence = aiSynthesis.confidence ?? 0.65;
    const fields = [];

    const push = (key, value) => {
        if (value == null || (typeof value === 'string' && !value.trim())) return;
        if (Array.isArray(value) && value.length === 0) return;
        fields.push(createField({
            key,
            value,
            sourceOrigin: origin,
            sourceRefs: refs,
            confidence,
            confirmed: false,
        }));
    };

    push('overview.tagline', aiSynthesis.tagline);
    push('overview.overview', aiSynthesis.overview);
    if (Array.isArray(aiSynthesis.values)) push('overview.values', aiSynthesis.values);
    if (Array.isArray(aiSynthesis.aesthetic)) push('overview.aesthetic', aiSynthesis.aesthetic);
    if (Array.isArray(aiSynthesis.tone)) push('overview.tone', aiSynthesis.tone);

    const colors = normalizeColorIdentity(aiSynthesis.colorIdentity ?? {});
    for (const [k, v] of Object.entries(colors)) {
        if (v) push(`colors.${k}`, v);
    }

    const details = normalizeBusinessDetails(aiSynthesis.businessDetails ?? {});
    for (const [k, v] of Object.entries(details)) {
        if (v != null && (Array.isArray(v) ? v.length > 0 : String(v).trim())) {
            push(`businessDetails.${k}`, v);
        }
    }

    const competitorSuggestions = (aiSynthesis.competitorSuggestions ?? []).map((c, i) =>
        createField({
            key: `competitorSuggestions.${i}`,
            value: {
                name: c.name ?? '',
                url: c.url ?? '',
                rationale: c.rationale ?? '',
            },
            sourceOrigin: SOURCE_ORIGINS.AI_SUGGESTION,
            sourceRefs: refs,
            confidence,
            confirmed: false,
            editable: true,
        })
    );

    const icpSuggestions = (aiSynthesis.icpSuggestions ?? []).map((p, i) =>
        createField({
            key: `icpSuggestions.${i}`,
            value: {
                role: p.role ?? '',
                titles: p.titles ?? [],
                painPoints: p.painPoints ?? '',
                channels: p.channels ?? [],
                rationale: p.rationale ?? '',
            },
            sourceOrigin: SOURCE_ORIGINS.AI_SUGGESTION,
            sourceRefs: refs,
            confidence,
            confirmed: false,
            editable: true,
        })
    );

    return {
        fields,
        competitorSuggestions,
        icpSuggestions,
        meta: { source: 'ai', combined, sourceRefs: refs },
    };
};

/**
 * Map stored brand_suggestions rows into normalized suggestion fields.
 */
export const extractStoredSuggestions = (suggestionRows = []) => {
    const competitorSuggestions = [];
    const icpSuggestions = [];

    for (const row of suggestionRows) {
        const base = {
            sourceOrigin: row.origin === 'ai' ? SOURCE_ORIGINS.AI_SUGGESTION : SOURCE_ORIGINS.USER_INPUT,
            sourceRefs: [`suggestion:${row.id}`],
            confidence: null,
            confirmed: row.status === 'accepted',
            editable: row.status === 'pending',
            updatedAt: row.createdAt ?? null,
        };

        if (row.type === 'competitor' || row.suggestion_type === 'competitor') {
            competitorSuggestions.push(createField({
                key: `competitorSuggestions.${row.id}`,
                value: row.payload ?? {},
                ...base,
            }));
        } else if (row.type === 'icp' || row.suggestion_type === 'icp') {
            icpSuggestions.push(createField({
                key: `icpSuggestions.${row.id}`,
                value: row.payload ?? {},
                ...base,
            }));
        }
    }

    return { competitorSuggestions, icpSuggestions };
};
