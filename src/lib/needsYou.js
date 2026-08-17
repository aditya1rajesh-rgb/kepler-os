// The demand queue — zone 2 of the cockpit (E5, roadmap S2).
//
// The admission filter for the whole screen is: every card answers what changed,
// what needs me now, or what should I do next. This is the middle one, and it is
// the zone that earns the return visit — a dashboard that only reports state
// gives you no reason to come back tomorrow.
//
// TWO RULES THAT SHAPE EVERY ROW HERE.
//
// 1. NO NEW SCHEMA. Every state below already exists and is already written by
//    production code. That matters more than it sounds: this codebase's recurring
//    defect is columns designed and never written (workspace_events.actor_id,
//    replies.classified), and a queue built on one of those would render an
//    honest-looking row that is permanently wrong. `replies.classified` was the
//    obvious filter for "unhandled reply" and is deliberately NOT used for
//    exactly that reason — nothing writes it outside the demo, so every reply
//    would queue forever. Enrollment status is the real signal.
//
// 2. EVERY ROW IS ACTIONABLE AND GOES SOMEWHERE. A count you cannot click is a
//    worry, not a queue.

const DAY_MS = 86400000;

/** Higher sorts first. Sending that has actually stopped outranks everything. */
const URGENCY = {
    'sequence-stopped': 100,
    reply: 90,
    'sequence-held': 80,
    'step-overdue': 70,
    'domain-unverified': 60,
    'draft-idle': 30,
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many ?? `${one}s`}`;

const daysBetween = (from, to) => Math.floor((to - new Date(from).getTime()) / DAY_MS);

/**
 * Build the queue.
 *
 * Every input is already-loaded state; this function does no I/O so the ordering
 * and the wording can be tested directly.
 *
 * @param input.sequences      mapped sequence rows (heldFromStatus is E1's signal)
 * @param input.enrollments    mapped enrollments (status 'stopped_reply' = a human is waiting)
 * @param input.campaigns      mapped campaigns with plan.steps[]
 * @param input.sendingDomains rows with a status
 * @param input.idleDrafts     completed content_items with no campaign
 * @param opts.now
 */
export const buildNeedsYou = ({
    sequences = [],
    enrollments = [],
    campaigns = [],
    sendingDomains = [],
    idleDrafts = [],
} = {}, { now = new Date() } = {}) => {
    const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
    const rows = [];

    // ── Sequences that need re-approval ──────────────────────────────────────
    // E1's whole point: a held sequence that WAS sending has silently stopped.
    // One that fell out of 'approved' or 'paused' needs the same click but had
    // nothing in flight, so it must not claim sending stopped.
    const held = sequences.filter((s) => s.heldFromStatus);
    const stopped = held.filter((s) => ['active', 'scheduled'].includes(s.heldFromStatus));
    const quietlyHeld = held.filter((s) => !['active', 'scheduled'].includes(s.heldFromStatus));

    if (stopped.length) {
        rows.push({
            id: 'sequence-stopped',
            kind: 'sequence-stopped',
            count: stopped.length,
            title: `${plural(stopped.length, 'sequence')} stopped sending`,
            detail: 'Edited after approval, so sending halted. Re-approve to resume.',
            module: 'outreach',
            child: 'sequences',
            urgency: URGENCY['sequence-stopped'],
        });
    }
    if (quietlyHeld.length) {
        rows.push({
            id: 'sequence-held',
            kind: 'sequence-held',
            count: quietlyHeld.length,
            title: `${plural(quietlyHeld.length, 'sequence')} awaiting re-approval`,
            detail: 'Edited since approval. Nothing was in flight, so nothing stopped.',
            module: 'outreach',
            child: 'sequences',
            urgency: URGENCY['sequence-held'],
        });
    }

    // ── Replies waiting on a human ───────────────────────────────────────────
    // An enrollment sitting in 'stopped_reply' is the real "someone replied and
    // nobody has moved it on" state: booking a meeting or unsubscribing moves it.
    const waiting = enrollments.filter((e) => e.status === 'stopped_reply');
    if (waiting.length) {
        const oldest = waiting
            .map((e) => e.updatedAt || e.createdAt)
            .filter(Boolean)
            .sort()[0];
        const days = oldest ? daysBetween(oldest, nowMs) : null;
        rows.push({
            id: 'replies',
            kind: 'reply',
            count: waiting.length,
            title: `${plural(waiting.length, 'reply', 'replies')} waiting`,
            detail: days && days > 0
                ? `The oldest has been waiting ${plural(days, 'day')}.`
                : 'Someone replied and the sequence stopped for them.',
            module: 'outreach',
            child: 'replies',
            urgency: URGENCY.reply,
        });
    }

    // ── Overdue campaign steps ───────────────────────────────────────────────
    const overdue = [];
    for (const c of campaigns) {
        if (c.status !== 'active') continue;
        for (const s of Array.isArray(c.plan?.steps) ? c.plan.steps : []) {
            if (s?.status === 'done' || s?.status === 'skipped') continue;
            const due = s?.scheduledDate || s?.date;
            if (!due) continue;
            const days = daysBetween(due, nowMs);
            if (days > 0) overdue.push({ campaign: c, step: s, days });
        }
    }
    if (overdue.length) {
        const worst = overdue.reduce((a, b) => (b.days > a.days ? b : a));
        rows.push({
            id: 'steps-overdue',
            kind: 'step-overdue',
            count: overdue.length,
            title: `${plural(overdue.length, 'campaign step')} overdue`,
            detail: `The oldest is ${plural(worst.days, 'day')} past its date: “${worst.step.title ?? 'Untitled step'}” in ${worst.campaign.title}.`,
            module: 'campaigns',
            child: 'all',
            urgency: URGENCY['step-overdue'],
        });
    }

    // ── Sending domains ──────────────────────────────────────────────────────
    // Only worth raising when there is outreach to block. An unverified domain
    // in a workspace that never sends is not a task, it is trivia.
    const unverified = sendingDomains.filter((d) => d.status && d.status !== 'verified');
    if (unverified.length && sequences.length) {
        rows.push({
            id: 'domains',
            kind: 'domain-unverified',
            count: unverified.length,
            title: `${plural(unverified.length, 'sending domain')} unverified`,
            detail: 'Outreach cannot send from a domain until its DNS records verify.',
            module: 'outreach',
            child: 'sequences',
            urgency: URGENCY['domain-unverified'],
        });
    }

    // ── Assets that went nowhere ─────────────────────────────────────────────
    // Generated, finished, and never laddered to a campaign. This is the orphan
    // E3 was built to stop creating; the ones already made still need a home.
    if (idleDrafts.length) {
        rows.push({
            id: 'drafts',
            kind: 'draft-idle',
            count: idleDrafts.length,
            title: `${plural(idleDrafts.length, 'finished draft')} not laddered to a campaign`,
            detail: 'Generated and complete, but not attached to any campaign, so nothing it produces reaches a goal.',
            module: 'library',
            urgency: URGENCY['draft-idle'],
        });
    }

    return rows.sort((a, b) => b.urgency - a.urgency || b.count - a.count);
};

export default buildNeedsYou;
