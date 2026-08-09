/**
 * Campaigns (the orchestration spine) and their measurement snapshots.
 *
 * campaign_metrics rows are trailing LEVELS, one snapshot per provider per week,
 * exactly as the metrics-snapshot cron writes them — so Measurement's period-over-
 * period maths and the trend charts have real depth to work with.
 */
import { id } from '../ids';
import { DEMO_WORKSPACE_ID } from './identity';
import { daysAgo, dateOffset } from './time';

const WS = DEMO_WORKSPACE_ID;

const step = (stepId, module, title, brief, rationale, order, offsetDays, contentItemId = null, status = 'pending') => ({
    id: stepId,
    module,
    title,
    brief,
    rationale,
    suggestedOrder: order,
    suggestedConfig: {},
    status,
    contentItemId,
    scheduledDate: dateOffset(offsetDays - 30),
    offsetDays,
});

export const campaigns = [
    {
        id: id('campaign-intake'),
        workspace_id: WS,
        title: 'Intake 2027 — registrar cycle-time push',
        goal: 'Book 25 KenRoll walkthroughs with registrars and admissions heads before the November renewal window',
        campaign_type: 'lead-gen',
        status: 'active',
        plan: {
            goal: 'Book 25 KenRoll walkthroughs with registrars and admissions heads before the November renewal window',
            campaignType: 'lead-gen',
            strategySummary:
                'Registrars renew admissions software in November and evaluate in the inter-cycle window. The wedge is cycle time — a number they are personally measured on — and the blocker is migration fear. Lead with the honest migration answer to earn credibility, support it with paid on LinkedIn against the buying committee, then run a five-touch sequence into a researched account list. Every asset points at the same claim: 21 days to 9.',
            channelMix: ['seo-aeo', 'ad-campaigns', 'outreach', 'social-media'],
            steps: [
                step('step-seo-migration', 'seo-aeo', 'Answer the mid-cycle migration objection',
                    'Direct-answer guide on whether a university can switch admissions software mid-cycle. Lead with the answer in the first 40 words, give the three conditions, include a realistic duration table and FAQ schema. No vendor gloss — say plainly when to wait.',
                    'This objection kills deals before a demo. Answering it honestly is the cheapest trust we can buy, and no competitor has published it.',
                    1, 0, id('content-seo-migration'), 'done'),
                step('step-social-awareness', 'social-media', 'Reframe the problem on LinkedIn',
                    'Three-post arc: the handover is the problem (not the CRM), the three-condition migration checklist, and the three-people diagnostic. Company voice, no product pitch.',
                    'Registrars and CIOs share operational reframes; product posts get ignored in this category.',
                    2, 7, id('content-social-s1'), 'done'),
                step('step-ads-registrar', 'ad-campaigns', 'LinkedIn paid against the buying committee',
                    'Four variants across outcome, objection, authority and urgency angles. Layer adjacent titles so the CIO and VC see the platform claim while registrars see cycle time.',
                    'The registrar recommends but does not sign — paid has to reach all three seats or the internal case stalls.',
                    3, 14, id('content-ads-linkedin-registrar'), 'done'),
                step('step-outreach-registrar', 'outreach', 'Five-touch sequence into researched accounts',
                    'Email + LinkedIn rotation over 14 days into the Tier-1 registrar list. Touch 3 gives away the migration guide with no ask.',
                    'Warm-by-content cold outreach: the sequence references an asset they may already have read.',
                    4, 21, id('content-outreach-registrar'), 'done'),
            ],
            successCriteria: [
                '25 booked walkthroughs with a registrar or admissions head present',
                'Reply rate above 8% on the cold sequence',
                'Migration guide ranking top 3 for its primary term',
                'At least 6 opportunities with a November renewal date attached',
            ],
            anchorDate: dateOffset(96),
            anchorLabel: 'November renewal window opens',
            meta: {
                generatedBy: 'strategy-engine',
                modelUsed: 'gemini-2.5-flash',
                createdFrom: { icpCount: 3, hasBrand: true },
                assumptions: [
                    'Renewal decisions cluster in November-January',
                    'Cycle time is the registrar\'s primary personal metric',
                ],
            },
        },
        source: 'strategy-engine',
        created_at: daysAgo(52),
        updated_at: daysAgo(3),
    },
    {
        id: id('campaign-accreditation'),
        workspace_id: WS,
        title: 'Accreditation season — KenCompliance',
        goal: 'Generate 40 qualified IQAC and registrar conversations off accreditation-cycle intent',
        campaign_type: 'lead-gen',
        status: 'active',
        plan: {
            goal: 'Generate 40 qualified IQAC and registrar conversations off accreditation-cycle intent',
            campaignType: 'lead-gen',
            strategySummary:
                'Accreditation is the most reliable trigger event in Indian higher education and the searches are seasonal and high-volume. Own the evidence-collection question organically, capture commercial intent on Google, and let the content do the qualifying — anyone reading a NAAC evidence guide has a cycle coming.',
            channelMix: ['seo-aeo', 'ad-campaigns'],
            steps: [
                step('step-seo-naac', 'seo-aeo', 'Own "NAAC evidence collection"',
                    'Explain where the six weeks actually go, week by week, then reframe evidence as an output of a single record rather than a project. Say explicitly what still needs human judgment.',
                    'Highest volume-to-difficulty ratio in the keyword set and it maps to a real trigger.',
                    1, 0, id('content-seo-naac'), 'done'),
                step('step-ads-naac', 'ad-campaigns', 'Google Search on accreditation intent',
                    'Three responsive variants mirroring the organic article\'s phrasing, targeting NAAC/NIRF/AICTE evidence terms.',
                    'Search intent here is unusually literal — mirroring the article language lifts quality score and continuity.',
                    2, 10, id('content-ads-google-naac'), 'done'),
                step('step-seo-nirf', 'seo-aeo', 'NIRF 2026 parameter reference',
                    'Reference table of the 2026 parameter weights with a short note on which parameters an institution can still influence this cycle.',
                    'Seasonal spike term, and the uploaded weights file gives us a real source rather than a paraphrase.',
                    3, 24, id('content-seo-q-nirf'), 'pending'),
            ],
            successCriteria: [
                '40 conversations with an accreditation cycle in the next 12 months',
                'Top-3 organic position for the evidence-collection term',
                'Cost per qualified conversation under ₹4,000',
            ],
            anchorDate: null,
            anchorLabel: '',
            meta: {
                generatedBy: 'strategy-engine',
                modelUsed: 'gemini-2.5-flash',
                createdFrom: { icpCount: 3, hasBrand: true },
            },
        },
        source: 'strategy-engine',
        created_at: daysAgo(41),
        updated_at: daysAgo(5),
    },
    {
        id: id('campaign-consolidation'),
        workspace_id: WS,
        title: 'Group consolidation — CIO track',
        goal: 'Open 12 platform-level conversations with CIOs at multi-campus education groups',
        campaign_type: 'awareness',
        status: 'active',
        plan: {
            goal: 'Open 12 platform-level conversations with CIOs at multi-campus education groups',
            campaignType: 'awareness',
            strategySummary:
                'CIOs cannot be sold a module — they buy an architecture. Lead with the SIS-vs-ERP definition question they research first, then a four-touch sequence that offers documentation and a sandbox tenant instead of a demo. No urgency manufacturing: this track exists to be present when an end-of-life or a consolidation mandate lands.',
            channelMix: ['seo-aeo', 'outreach'],
            steps: [
                step('step-seo-sis', 'seo-aeo', 'SIS vs ERP for multi-campus groups',
                    'Definition-first comparison with Indian regulatory context, aimed at the CIO who is scoping a consolidation.',
                    'Currently answered only by US-centric sources with no NAAC/AICTE context.',
                    1, 0, id('content-seo-q-sis'), 'pending'),
                step('step-outreach-cio', 'outreach', 'Four-touch CIO sequence',
                    'Open with the three-different-answers diagnostic; touch 3 offers API docs, SSO/audit documentation and a sandbox tenant.',
                    'CIOs respond to artefacts they can hand to a security reviewer, not to calendar links.',
                    2, 7, id('content-outreach-cio'), 'done'),
            ],
            successCriteria: [
                '12 technical conversations with a CIO or head of academic systems',
                '6 sandbox tenants provisioned',
                'Two group-level consolidation evaluations entered',
            ],
            anchorDate: null,
            anchorLabel: '',
            meta: {
                generatedBy: 'strategy-engine',
                modelUsed: 'gemini-2.5-flash',
                createdFrom: { icpCount: 3, hasBrand: true },
            },
        },
        source: 'strategy-engine',
        created_at: daysAgo(39),
        updated_at: daysAgo(8),
    },
    {
        id: id('campaign-kenfin'),
        workspace_id: WS,
        title: 'KenFin expansion — existing institutions',
        goal: 'Expand 15 existing KenRoll institutions into KenFin before the fee cycle',
        campaign_type: 'retention',
        status: 'draft',
        plan: {
            goal: 'Expand 15 existing KenRoll institutions into KenFin before the fee cycle',
            campaignType: 'retention',
            strategySummary:
                'The fee-mapping handover at cycle close is the moment KenRoll customers feel the gap KenFin fills. Time a lifecycle sequence to land two weeks before fee schedules are published, and give finance controllers their own entry point rather than routing through the registrar.',
            channelMix: ['outreach', 'social-media'],
            steps: [
                step('step-outreach-kenfin', 'outreach', 'Lifecycle sequence to KenRoll customers',
                    'Four-email expansion flow anchored on the reconciliation week they just lived through. Finance controller as primary recipient, registrar cc\'d.',
                    'Expansion lands best immediately after the pain, not at renewal.',
                    1, 0, null, 'pending'),
                step('step-social-kenfin', 'social-media', 'Fee reconciliation posts',
                    'Two posts on collection efficiency and reconciliation, finance-controller voice.',
                    'Warms the finance persona, who currently sees none of our content.',
                    2, 10, null, 'pending'),
            ],
            successCriteria: ['15 KenFin expansion conversations', '6 closed expansions before the fee cycle'],
            anchorDate: dateOffset(45),
            anchorLabel: 'Fee schedules published',
            meta: {
                generatedBy: 'campaign-intake',
                modelUsed: 'gemini-2.5-flash',
                createdFrom: { icpCount: 3, hasBrand: true },
            },
        },
        source: 'campaign-intake',
        created_at: daysAgo(2),
        updated_at: daysAgo(2),
    },
];

// ── Measurement snapshots ────────────────────────────────────────────────────
// One snapshot per provider per week. The window covers 13 months so the
// Dashboard's monthly (7 buckets) and quarterly (4 buckets) chart views are both
// full — a shorter history leaves half the chart blank.

const WEEKS = 56;

/**
 * Progress through the window, eased so growth ACCELERATES: the recent months rise
 * faster than the early ones, which is both what a working programme looks like and
 * what makes month-over-month deltas readable instead of flat.
 */
const curve = (weekIndex) => (weekIndex / (WEEKS - 1)) ** 1.7;

/**
 * A level `weekIndex` weeks into the window, given the value at the START of the
 * window and the MULTIPLE it grows by across it. Linear with a small deterministic
 * wobble, so trends look measured rather than modelled.
 */
const level = (base, multiple, weekIndex, wobbleSeed) => {
    const progress = curve(weekIndex);
    const wobble = 1 + 0.025 * Math.sin(weekIndex * 1.7 + wobbleSeed);
    return Math.round(base * (1 + (multiple - 1) * progress) * wobble);
};

/**
 * The same curve anchored on the CURRENT value: the newest snapshot is exactly
 * `current`, earlier ones scale back by `multiple`. Used where a snapshot has to
 * agree with a number the app can also compute from base rows.
 */
const fromCurrent = (current, multiple, weekIndex) => {
    const base = current / multiple;
    const progress = curve(weekIndex);
    return Math.max(0, Math.round(base * (1 + (multiple - 1) * progress)));
};

/**
 * Split a ga4 level across `source|medium` keys — the shape E5 zone 5 reads
 * (`metrics.bySource`, written by measurementService.pullGa4 and the
 * metrics-snapshot cron). Shares are of the campaign's own sessions; the
 * remainder after rounding lands on the first source so the parts still sum to
 * the whole, because a contribution table whose rows do not add up to the total
 * is the exact failure this zone exists to avoid.
 */
const splitBySource = (sessions, users, conversions, sources) => {
    const bySource = {};
    let sessionsLeft = sessions;
    let usersLeft = users;
    let conversionsLeft = conversions;
    sources.forEach((s, i) => {
        const last = i === sources.length - 1;
        const sess = last ? sessionsLeft : Math.round(sessions * s.share);
        const usr = last ? usersLeft : Math.round(users * s.share);
        const conv = last ? conversionsLeft : Math.round(conversions * s.share);
        bySource[`${s.source}|${s.medium}`] = { sessions: sess, users: usr, conversions: conv };
        sessionsLeft -= sess;
        usersLeft -= usr;
        conversionsLeft -= conv;
    });
    return bySource;
};

const seriesFor = (campaignKey, campaignId, { sessions, users, conversions, crmRecords, outreach, revenue, seed, sources }) => {
    const rows = [];
    for (let w = WEEKS - 1; w >= 0; w -= 1) {
        const weekIndex = WEEKS - 1 - w;
        const capturedAt = daysAgo(w * 7 + 0.5, { hour: 6 });

        if (sessions) {
            const s = level(sessions, 2.5, weekIndex, seed);
            const u = level(users, 2.4, weekIndex, seed + 1);
            const c = level(conversions, 3.1, weekIndex, seed + 2);
            rows.push({
                id: id(`metric-ga4-${campaignKey}-${w}`),
                workspace_id: WS,
                campaign_id: campaignId,
                provider: 'ga4',
                metrics: {
                    sessions: s,
                    users: u,
                    conversions: c,
                    ...(sources?.length ? { bySource: splitBySource(s, u, c, sources) } : {}),
                },
                captured_at: capturedAt,
            });
        }
        if (crmRecords) {
            rows.push({
                id: id(`metric-zoho-${campaignKey}-${w}`),
                workspace_id: WS,
                campaign_id: campaignId,
                provider: 'zoho',
                metrics: { crmRecords: level(crmRecords, 3.4, weekIndex, seed + 3) },
                captured_at: capturedAt,
            });
        }
        if (outreach) {
            // Outreach values are given as the CURRENT totals and grown backwards, so
            // the newest snapshot agrees with the actual enrollments, messages and
            // replies in outreach.js — Measurement and Outreach must not disagree.
            rows.push({
                id: id(`metric-outreach-${campaignKey}-${w}`),
                workspace_id: WS,
                campaign_id: campaignId,
                provider: 'outreach',
                metrics: {
                    enrolled: fromCurrent(outreach.enrolled, 2.8, weekIndex),
                    sent: fromCurrent(outreach.sent, 3.3, weekIndex),
                    replied: fromCurrent(outreach.replied, 3.6, weekIndex),
                    meetings: fromCurrent(outreach.meetings, 4.0, weekIndex),
                },
                captured_at: capturedAt,
            });
        }
        if (revenue) {
            rows.push({
                id: id(`metric-revenue-${campaignKey}-${w}`),
                workspace_id: WS,
                campaign_id: campaignId,
                provider: 'revenue',
                metrics: { revenue: level(revenue, 4.4, weekIndex, seed + 8), currency: 'INR' },
                captured_at: capturedAt,
            });
        }
    }
    return rows;
};

/** Search Console snapshots — workspace-level (no campaign), for the Search CTR card. */
const gscSeries = () => {
    const rows = [];
    for (let w = WEEKS - 1; w >= 0; w -= 1) {
        const weekIndex = WEEKS - 1 - w;
        const impressions = level(24000, 2.0, weekIndex, 4.2);
        const clicks = level(1180, 3.4, weekIndex, 5.1);
        rows.push({
            id: id(`metric-gsc-${w}`),
            workspace_id: WS,
            campaign_id: null,
            provider: 'gsc',
            metrics: {
                impressions,
                clicks,
                ctr: Number((clicks / impressions).toFixed(4)),
                position: Number((11.4 - (weekIndex / (WEEKS - 1)) * 3.7).toFixed(1)),
            },
            captured_at: daysAgo(w * 7 + 0.5, { hour: 6 }),
        });
    }
    return rows;
};

export const campaign_metrics = [
    ...gscSeries(),
    // The `sources` mixes are what E5's production—source table reads. They are
    // the mediums lib/tracking.js actually mints, so the demo exercises the real
    // keying rules rather than a convenient fiction.
    ...seriesFor('intake', id('campaign-intake'), {
        sessions: 640, users: 512, conversions: 11,
        crmRecords: 6,
        outreach: { enrolled: 8, sent: 19, replied: 3, meetings: 2 },
        revenue: 480000,
        seed: 0.4,
        sources: [
            { source: 'linkedin', medium: 'paid_social', share: 0.46 },
            { source: 'sendgrid', medium: 'email', share: 0.34 },
            { source: 'linkedin.com', medium: 'social', share: 0.2 },
        ],
    }),
    ...seriesFor('accreditation', id('campaign-accreditation'), {
        sessions: 910, users: 764, conversions: 17,
        crmRecords: 9,
        revenue: 260000,
        seed: 1.1,
        sources: [
            { source: 'google', medium: 'cpc', share: 0.58 },
            { source: 'sendgrid', medium: 'email', share: 0.42 },
        ],
    }),
    ...seriesFor('consolidation', id('campaign-consolidation'), {
        sessions: 210, users: 178, conversions: 3,
        crmRecords: 2,
        outreach: { enrolled: 5, sent: 8, replied: 2, meetings: 1 },
        revenue: 0,
        seed: 2.3,
        sources: [
            { source: 'sendgrid', medium: 'email', share: 0.71 },
            { source: 'linkedin.com', medium: 'referral', share: 0.29 },
        ],
    }),
    // Unattributed traffic — the honest "we cannot tie this to a campaign"
    // bucket, and the biggest block in the table. Organic dominates precisely
    // because pages published outside Kepler carry no campaign tag.
    ...seriesFor('unattributed', null, {
        sessions: 1480, users: 1210, conversions: 9,
        seed: 3.7,
        sources: [
            { source: 'google', medium: 'organic', share: 0.62 },
            { source: '(direct)', medium: '(none)', share: 0.26 },
            { source: 'bing', medium: 'organic', share: 0.12 },
        ],
    }),
];
