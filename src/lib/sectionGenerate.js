// The generate / retry decision for a per-section generation control.
//
// This logic existed in three near-identical copies (BrandIntelligence.jsx,
// BrandOverviewPanel.jsx, CompetitorIntelligencePanel.jsx), which is how both of
// its defects came to exist in triplicate. It lives here so the next change is
// made once.

/** Error kinds where a stricter prompt is worth a second credit. */
const STRICTER_PROMPT_KINDS = new Set(['malformed_json', 'missing_keys', 'empty_content']);

/**
 * Missing source material cannot be fixed by re-spending a credit on the same
 * request, so that kind gets no retry at all - see `blocksRetry`. It therefore
 * has no retry LABEL either: the previous 'Add more sources' string was
 * unreachable, because the only branch that would have rendered it is the branch
 * that removes the button.
 */
export const retryLabelForKind = (errorKind) =>
    (STRICTER_PROMPT_KINDS.has(errorKind) ? 'Retry with stricter prompt' : 'Retry');

/**
 * True when the error is one no retry can fix. "No retry" is correct; "no way
 * forward" is not, so a control in this state offers a route to the sources
 * instead (`onAddSources`).
 */
export const blocksRetry = (state, errorKind) =>
    state === 'error' && errorKind === 'insufficient_context';

/** The route out of an insufficient-context error. A link, not a retry: it spends nothing. */
export const ADD_SOURCES_LABEL = 'Add sources';
