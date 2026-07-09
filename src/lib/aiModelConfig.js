const DEFAULT_REQUESTED_MODEL = 'gemini-2.5-flash';

const parseCsv = (raw) =>
    String(raw ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

/**
 * Client-side AI routing config.
 *
 * Optional Vite env:
 *  - VITE_AI_MODEL: override the Vertex model ID sent to the edge function
 *                   (default: gemini-2.5-flash - must match VERTEX_AI_MODEL_ID secret)
 *
 * No fallback chain: a single Vertex model is configured server-side via
 * VERTEX_AI_MODEL_ID. The modelFallbacks array is kept as a single-element list
 * so callAI()'s for-loop continues to work without changes.
 */
export const getAiModelConfig = () => {
    const requestedFromEnv = import.meta.env.VITE_AI_MODEL?.trim();
    const envOverrides = parseCsv(import.meta.env.VITE_AI_MODEL_FALLBACKS);

    const requestedModel = requestedFromEnv || DEFAULT_REQUESTED_MODEL;
    // Single entry - no fallback chain. If VITE_AI_MODEL_FALLBACKS is set for
    // local testing it is respected, but the edge will still reject any model
    // not matching VERTEX_AI_MODEL_ID.
    const modelFallbacks = envOverrides.length > 0 ? envOverrides : [requestedModel];

    return { requestedModel, modelFallbacks };
};

export const AI_MODEL_DEFAULTS = {
    requestedModel: DEFAULT_REQUESTED_MODEL,
    modelFallbacks: [DEFAULT_REQUESTED_MODEL],
};
