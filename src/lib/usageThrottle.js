/**
 * View throttling for usage instrumentation (E4).
 *
 * A screen view fires whenever a component mounts, and in an SPA that happens
 * far more often than a person "opens a screen" — tab switches, back
 * navigation, a re-render after a save. Recording every one answers the wrong
 * question: we want how often a surface is OPENED, not how often React
 * remounted it.
 *
 * So a surface counts once per window. The window is deliberately generous:
 * bouncing between Campaigns and Library while doing one piece of work is one
 * visit to each, not six. Reopening an hour later is a genuine second visit.
 *
 * Pure and in-memory by design — a page reload starts a new session and SHOULD
 * record again, and nothing here is worth persisting to storage.
 */

/** Long enough that one work session is one view; short enough to see a return. */
export const DEFAULT_VIEW_WINDOW_MS = 30 * 60 * 1000;

export const createViewThrottle = ({ windowMs = DEFAULT_VIEW_WINDOW_MS } = {}) => {
    const lastSeen = new Map();

    return {
        /**
         * True if this surface should be recorded now — and if so, marks it seen.
         * Deliberately not idempotent: calling it IS claiming the record.
         */
        shouldRecord(surface, now = Date.now()) {
            if (!surface) return false;
            const previous = lastSeen.get(surface);
            if (previous != null && now - previous < windowMs) return false;
            lastSeen.set(surface, now);
            return true;
        },

        /** Test seam. */
        reset() {
            lastSeen.clear();
        },
    };
};

/** The app-wide throttle. One per page load, shared by every ModuleScreen. */
export const viewThrottle = createViewThrottle();
