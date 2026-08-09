// Channel contribution — the `production—source` compound key (E5, roadmap S2).
//
// "Channel" is genuinely two axes and Kepler knows them differently:
//
//   production — what KEPLER made. Known, because our own tagged links carry a
//                campaign-scoped utm (see lib/tracking.js) and the id8 suffix
//                survives renaming.
//   source     — where the outcome actually came from. Reported by GA4.
//
// The earlier design toggled between the two axes. A compound key is better for
// the reason Dreamdata found: there is only ever ONE number per row, so "which
// axis am I looking at?" never arises. Kepler's key is richer than theirs
// because our left half is known rather than reported.
//
// THE POINT OF THE `Other—` ROWS. Work Kepler did not produce shows up as
// `Other—Organic`, `Other—Direct` and so on, in the same table. The
// unattributed remainder stops being a footnote under a chart and becomes a row
// you can compare against — which is the only way a contribution number can be
// read honestly. A table that silently omits it is claiming the whole business
// ran on Kepler's work.
//
// WHAT THIS DELIBERATELY WILL NOT DO. No cross-channel efficiency. Paid can show
// its own CPA where spend is real, but nothing here assigns a production cost to
// organic, so "your Meta CPA is 3× your SEO CPA" is not a sentence Kepler can
// honestly say. Contribution comparison works; efficiency comparison does not.

import { matchCampaign } from './tracking';

/** Production wings, in the order they should appear when contribution ties. */
export const PRODUCTIONS = ['SEO', 'Social', 'Paid', 'Outreach', 'Campaign', 'Other'];

/** Campaign plan channelMix ids → production wing. */
const MIX_PRODUCTION = {
    'seo-aeo': 'SEO',
    seo: 'SEO',
    'social-media': 'Social',
    social: 'Social',
    'ad-campaigns': 'Paid',
    ads: 'Paid',
    outreach: 'Outreach',
};

/**
 * utm_medium → production wing. These are the mediums lib/tracking.js MINTS, so
 * for anything Kepler tagged this is a read of our own label rather than a guess
 * about someone else's traffic.
 */
const MEDIUM_PRODUCTION = {
    email: 'Outreach',
    cpc: 'Paid',
    ppc: 'Paid',
    paid_social: 'Paid',
    display: 'Paid',
    social: 'Social',
    organic: 'SEO',
};

const clean = (v) => String(v ?? '').trim().toLowerCase();

const titleCase = (s) => String(s ?? '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');

/** GA4 source/medium → the display source half of the key. */
export const normalizeSource = (source, medium) => {
    const s = clean(source);
    const m = clean(medium);
    if (!s && !m) return 'Unknown';
    if (s === '(direct)' || s === 'direct' || m === '(none)' || m === 'none') return 'Direct';
    if (m === 'organic' || s === '(organic)' || s === 'organic') {
        // "google / organic" is Organic Search; a bare "(organic)" has no engine.
        return s && !s.startsWith('(') ? `Organic ${titleCase(s)}` : 'Organic';
    }
    if (s === 'linkedin.com' || s === 'lnkd.in') return 'LinkedIn';
    if (s === 'facebook.com' || s === 'l.facebook.com' || s === 'instagram.com') return titleCase(s.replace(/^l\./, '').replace(/\.com$/, ''));
    if (s) return titleCase(s.replace(/\.com$/, ''));
    return titleCase(m);
};

/**
 * The production half. `campaign` is the matched Kepler campaign, or null.
 *
 * Order matters: the medium we minted beats the campaign's channel mix, because
 * a campaign with four wings cannot say which one produced a given session but
 * `utm_medium=email` can.
 */
export const productionFor = (campaign, medium) => {
    if (!campaign) return 'Other';
    const byMedium = MEDIUM_PRODUCTION[clean(medium)];
    if (byMedium) return byMedium;

    // No usable medium: a single-wing campaign still identifies itself.
    const mix = Array.isArray(campaign.plan?.channelMix) ? campaign.plan.channelMix : [];
    const wings = [...new Set(mix.map((c) => MIX_PRODUCTION[clean(typeof c === 'string' ? c : c?.channel)]).filter(Boolean))];
    if (wings.length === 1) return wings[0];

    // Known to be ours, not known which wing. Saying "Campaign" is the honest
    // answer; picking the first channel in the mix would be a coin toss wearing
    // a label.
    return 'Campaign';
};

export const contributionKey = (production, source) => `${production}—${source}`;

const emptyRow = (production, source) => ({
    key: contributionKey(production, source),
    production,
    source,
    sessions: 0,
    users: 0,
    conversions: 0,
    campaignIds: [],
});

/**
 * Flatten stored ga4 snapshots into the row shape `buildContribution` reads.
 *
 * Snapshots already carry `campaignId` (attribution happened when they were
 * written), so they skip the utm match entirely — the `bySource` map holds raw
 * GA4 `source|medium` keys precisely so display rules can change without a
 * re-pull. Rows lacking `bySource` predate the source dimension; they are kept
 * as a single Unknown-source row rather than dropped, because dropping them
 * would quietly shrink the total everything else is a share of.
 *
 * @param snapshots [{ campaignId, metrics }] — latest ga4 snapshot per campaign
 */
export const snapshotsToRows = (snapshots = []) => {
    const rows = [];
    for (const s of snapshots ?? []) {
        const m = s?.metrics ?? {};
        const bySource = m.bySource && typeof m.bySource === 'object' ? m.bySource : null;
        if (bySource && Object.keys(bySource).length) {
            for (const [key, totals] of Object.entries(bySource)) {
                const [source = '', medium = ''] = String(key).split('|');
                rows.push({
                    campaignId: s.campaignId ?? null,
                    source,
                    medium,
                    sessions: Number(totals?.sessions) || 0,
                    users: Number(totals?.users) || 0,
                    conversions: Number(totals?.conversions) || 0,
                });
            }
            continue;
        }
        rows.push({
            campaignId: s?.campaignId ?? null,
            source: '',
            medium: '',
            sessions: Number(m.sessions) || 0,
            users: Number(m.users) || 0,
            conversions: Number(m.conversions) || 0,
        });
    }
    return rows;
};

/** True when at least one snapshot carries the source split. */
export const hasSourceBreakdown = (snapshots = []) =>
    (snapshots ?? []).some((s) => s?.metrics?.bySource && Object.keys(s.metrics.bySource).length > 0);

/**
 * Roll GA4 by-campaign×source rows into contribution rows.
 *
 * @param rows [{ campaign | campaignId, source, medium, sessions, users, conversions }]
 *        — either the live GA4 report (utm string) or flattened snapshots (id)
 * @param campaigns Kepler campaigns (for the id8 match)
 * @param opts.goalCampaignIds when set, rows attributed to campaigns OUTSIDE this
 *        set are folded into `Other`. Drilling from a goal must not silently
 *        widen to the whole workspace — that is the "influenced" inflation the
 *        roadmap refuses.
 */
export const buildContribution = (rows = [], campaigns = [], { goalCampaignIds = null } = {}) => {
    const scope = goalCampaignIds ? new Set(goalCampaignIds) : null;
    const byKey = new Map();
    let attributedSessions = 0;
    let totalSessions = 0;

    for (const r of rows ?? []) {
        // Snapshots carry the id (attribution already happened); the live GA4
        // report carries the utm string and still has to be matched.
        const matched = r?.campaignId
            ? (campaigns ?? []).find((c) => c.id === r.campaignId) ?? null
            : matchCampaign(r?.campaign, campaigns);
        const inScope = matched && (!scope || scope.has(matched.id));
        const campaign = inScope ? matched : null;
        const production = productionFor(campaign, r?.medium);
        const source = normalizeSource(r?.source, r?.medium);
        const key = contributionKey(production, source);

        if (!byKey.has(key)) byKey.set(key, emptyRow(production, source));
        const row = byKey.get(key);
        row.sessions += Number(r?.sessions) || 0;
        row.users += Number(r?.users) || 0;
        row.conversions += Number(r?.conversions) || 0;
        if (campaign && !row.campaignIds.includes(campaign.id)) row.campaignIds.push(campaign.id);

        totalSessions += Number(r?.sessions) || 0;
        if (campaign) attributedSessions += Number(r?.sessions) || 0;
    }

    const productionRank = (p) => {
        const i = PRODUCTIONS.indexOf(p);
        return i === -1 ? PRODUCTIONS.length : i;
    };

    const contributions = [...byKey.values()]
        .map((row) => ({
            ...row,
            // Share of the whole picture, including what Kepler did not produce.
            // Share of only the attributed slice would read as 100% Kepler.
            share: totalSessions ? row.sessions / totalSessions : null,
        }))
        .sort((a, b) => (b.sessions - a.sessions)
            || (productionRank(a.production) - productionRank(b.production))
            || a.source.localeCompare(b.source));

    return {
        contributions,
        totalSessions,
        attributedSessions,
        // What share of real outcomes Kepler can claim to have produced at all.
        // null (not 0) when there is nothing to divide — cold start is not "0%".
        attributedShare: totalSessions ? attributedSessions / totalSessions : null,
    };
};

/**
 * What this picture is structurally missing, as sentences a user can act on.
 *
 * The roadmap is explicit that until the paid-media leg lands, this card must
 * SAY it is incomplete rather than render a chart that silently omits spend. The
 * organic gap is the same class of problem and gets the same treatment: pages
 * Kepler published carry no utm, so their sessions arrive as `Other—Organic` and
 * are indistinguishable from everyone else's organic.
 *
 * @param opts.paidConnected any ad platform connected
 * @param opts.hasSourceBreakdown false when snapshots predate the source dimension
 */
export const contributionCaveats = ({ paidConnected = false, hasSourceBreakdown = true } = {}) => {
    const out = [];
    if (!hasSourceBreakdown) {
        out.push({
            id: 'no-source',
            text: 'These snapshots were taken before Kepler recorded traffic sources. Pull GA4 again to split contribution by source.',
        });
    }
    if (!paidConnected) {
        out.push({
            id: 'no-paid',
            text: 'No ad platform is connected, so paid contribution and spend are missing from this picture entirely.',
        });
    }
    // Stated always, because it never stops being true while attribution is
    // utm-based. An unqualified "SEO contributed 4%" would be a lie of omission.
    out.push({
        id: 'organic-unattributable',
        text: 'Pages published outside Kepler carry no campaign tag, so their organic traffic counts under Other rather than SEO.',
    });
    return out;
};

export default buildContribution;
