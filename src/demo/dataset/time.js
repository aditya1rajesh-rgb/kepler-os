/**
 * All demo timestamps are RELATIVE to the moment the demo is opened, so the tour
 * never looks stale — "3 days ago" stays 3 days ago a year from now.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO timestamp N days before now (fractional days allowed). */
export const daysAgo = (days, { hour } = {}) => {
    const d = new Date(Date.now() - days * DAY_MS);
    if (hour != null) d.setHours(hour, (hour * 7) % 60, 0, 0);
    return d.toISOString();
};

/**
 * ISO timestamp N minutes before now. Used for the freshest activity so the
 * Dashboard's "Today" feed is populated whatever hour the demo is opened —
 * including just after midnight, when "2 hours ago" is yesterday.
 */
export const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

/** ISO timestamp N hours before now. */
export const hoursAgo = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

/** ISO timestamp N days in the future. */
export const daysAhead = (days, { hour = 10 } = {}) => {
    const d = new Date(Date.now() + days * DAY_MS);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
};

/** YYYY-MM-DD, N days from now (negative = past). Used by social calendar slots. */
export const dateOffset = (days) => new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
