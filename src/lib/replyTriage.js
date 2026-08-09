// Reply triage (E16).
//
// inbox-monitor has been polling every 10 minutes for months, writing `replies`
// and firing the stop/suppress transitions. The data was already correct; what
// was missing was a screen that ranks it. This module holds the ranking so it
// is testable without a browser, and so "what needs me" has exactly one
// definition rather than one per call site.

export const REPLY_KIND_LABEL = {
    reply: 'Reply',
    ooo: 'Out of office',
    bounce: 'Bounce',
    unsub: 'Unsubscribed',
};

/** Kinds a human can actually do something about. */
const ACTIONABLE_KINDS = new Set(['reply']);

/** Enrollment states that mean this reply has already been dealt with. */
const RESOLVED_ENROLLMENT = new Set(['meeting', 'suppressed']);

/**
 * Does this reply still want a human?
 *
 * A genuine reply that has not yet become a meeting is the highest-value
 * unhandled event in the product. Bounces and unsubscribes are already handled
 * by the scheduler — surfacing them as "needs you" would be false urgency, and
 * a queue that cries wolf stops being read. Out-of-office is deliberately NOT
 * actionable: the sequence reschedules itself.
 */
export const needsResponse = (reply) => {
    if (!ACTIONABLE_KINDS.has(reply?.kind)) return false;
    return !RESOLVED_ENROLLMENT.has(reply?.enrollment?.status ?? '');
};

/** Counts per kind, plus the actionable subset. Drives the filter chips. */
export const replyCounts = (replies = []) => {
    const counts = { all: replies.length, needsYou: 0, reply: 0, ooo: 0, bounce: 0, unsub: 0 };
    for (const r of replies) {
        if (r.kind in counts) counts[r.kind] += 1;
        if (needsResponse(r)) counts.needsYou += 1;
    }
    return counts;
};

/**
 * Filter for a chosen tab. 'needs-you' is the default view because the whole
 * point of the screen is the unhandled reply, not the archive.
 */
export const filterReplies = (replies = [], filter = 'needs-you') => {
    if (filter === 'all') return replies;
    if (filter === 'needs-you') return replies.filter(needsResponse);
    return replies.filter((r) => r.kind === filter);
};

/**
 * Age of the oldest unanswered reply, in hours. A reply sitting for two days is
 * a different problem from one that landed a minute ago, and the screen should
 * be able to say which without the operator doing the arithmetic.
 */
export const oldestUnansweredHours = (replies = [], now = Date.now()) => {
    const pending = replies.filter(needsResponse).map((r) => new Date(r.receivedAt).getTime());
    const valid = pending.filter((t) => Number.isFinite(t));
    if (!valid.length) return null;
    return Math.floor((now - Math.min(...valid)) / 3_600_000);
};
