/**
 * Generated assets for the demo workspace — the `content_items` table across all
 * four specialist generators (seo, ads, social, outreach).
 *
 * Payload shapes mirror what the real generators persist, so the modules render
 * these exactly as they render live output.
 */
import { id } from '../ids';
import { DEMO_WORKSPACE_ID } from './identity';
import { daysAgo, dateOffset } from './time';

const WS = DEMO_WORKSPACE_ID;

const seo = (key, fields) => ({
    id: id(`content-${key}`),
    workspace_id: WS,
    type: 'seo',
    source: 'keyword-research',
    campaign_id: null,
    campaign_step_id: '',
    ...fields,
});

// ── SEO & AEO ────────────────────────────────────────────────────────────────

const migrationBlog = {
    title: 'Can a university switch admissions software mid-cycle? An honest answer',
    metaDescription:
        'Most institutions can, but only under three conditions. Here is what a mid-cycle admissions migration actually involves, when to wait, and how to run a parallel intake safely.',
    markdown: `## The short answer

Yes — but only if your current cycle has a clean break between application intake and offer generation, and only if you run the two systems in parallel for one full stage. If neither is true, wait for the inter-cycle window. Switching a live merit list is the one migration nobody should attempt.

## Why registrars ask this question in November

Admissions software renewals land in November and December, weeks before applications open. The registrar's fear is specific and reasonable: a botched migration during intake does not cost a quarter, it costs an academic year of enrolment.

That fear is usually attached to the wrong risk. In eleven discovery conversations with registrars this year, the failure people described was never data loss. It was **counsellors working in two systems at once with no agreed source of truth** — applicants called twice, offers issued from stale data, and a fee mapping that no longer matched the merit list.

## The three conditions for a safe mid-cycle switch

**1. A stage boundary you can freeze.** Application intake, document verification, merit list, offer, fee payment, enrolment. You need one boundary where the pipeline is briefly empty. Most Indian institutions have one between verification and merit list.

**2. One source of truth per stage, in writing.** Not "both systems". Each stage is owned by exactly one system on a dated cutover plan, and every counsellor knows which.

**3. A parallel run of one complete stage.** Import the current applicant set, run one stage in both systems, and reconcile record counts before the cutover. If the counts do not match, you have found your problem while it is still cheap.

## What actually takes the time

| Phase | Realistic duration | Who owns it |
| --- | --- | --- |
| Applicant and document import | 3-5 days | Vendor + IT |
| Field and status mapping | 1 week | Registrar office |
| Counsellor retraining | 2-3 days | Admissions lead |
| Parallel stage run | 1 stage | Both |
| Cutover and decommission | 1 day | IT |

The mapping week is the one institutions underestimate. Legacy admissions CRMs accumulate custom statuses — "provisional-hold-2", "docs-pending-NRI" — and each one encodes a policy somebody has to restate.

## When to wait instead

Wait if your merit list is already published, if your fee gateway is mid-reconciliation, or if the accreditation submission window overlaps the cutover. None of these are technical blockers. They are all situations where the cost of a two-day ambiguity is measured in candidate withdrawals or audit findings.

## The question underneath the question

Registrars asking about mid-cycle migration are usually not asking about migration. They are asking whether the pain they are living with — re-keying applicant data into the academic system, assembling NAAC evidence by hand, a 21-day application-to-offer cycle — is worth one risky quarter.

The honest framing: if your current stack costs you candidates every cycle, the migration risk is a one-time cost and the status quo is a recurring one. Run it at the stage boundary, in parallel, with one owner per stage.`,
    schema: {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
            {
                '@type': 'Question',
                name: 'Can a university switch admissions software mid-cycle?',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'Yes, if the cycle has a stage boundary where the pipeline is briefly empty, one system owns each stage on a dated cutover plan, and one complete stage is run in parallel with reconciled record counts before cutover.',
                },
            },
            {
                '@type': 'Question',
                name: 'How long does an admissions software migration take?',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'Three to five days for applicant and document import, about a week for field and status mapping, two to three days of counsellor retraining, one parallel stage run, and a single day for cutover.',
                },
            },
            {
                '@type': 'Question',
                name: 'When should an institution wait instead of migrating?',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'Wait if the merit list is already published, the fee gateway is mid-reconciliation, or an accreditation submission window overlaps the cutover.',
                },
            },
        ],
    },
    review: { overall: 91, strengths: ['Direct answer in the first line', 'Concrete conditions instead of hedging', 'Table gives extractable structure'], risks: ['Migration durations are directional, not guaranteed'] },
    aeo: {
        overall: 88,
        grade: 'A',
        recommendations: [
            'Answer sits in the first 40 words — keep it there on any edit',
            'FAQ schema present and matches three real on-page questions',
            'Add one named institution example once a customer approves a public reference',
            'Duration table is the most-cited block — keep units explicit',
        ],
    },
    metrics: { wordCount: 612, burstiness: 0.71, readingLevel: 'Grade 11', avgSentenceLength: 17 },
};

const stackBlog = {
    title: 'Campus management platform vs admissions CRM: which does your institution actually need?',
    metaDescription:
        'An admissions CRM stops at enrolment. A campus management platform carries the student record through academics, fees and compliance. Here is how to tell which problem you have.',
    markdown: `## The distinction that decides your shortlist

An **admissions CRM** manages a funnel: enquiries, counsellor follow-up, applications, offers. It is measured in conversion rate and response time. A **campus management platform** manages a student record: the same applicant, then their attendance, examinations, fees, placement and accreditation evidence, on one data model.

Both are legitimate purchases. They solve different problems, and institutions that confuse them buy the same capability twice.

## You need an admissions CRM if

- Enquiry-to-application conversion is your named problem this cycle
- Your academic systems already work and nobody is re-keying data into them
- Counsellor telephony and lead routing are the daily bottleneck
- You are one campus, one intake, and your student record is manageable

## You need a campus management platform if

- Applicant data is re-entered into a separate academic system after enrolment
- Fee mapping is reconciled by hand at cycle close
- Accreditation evidence takes weeks to assemble from four departments
- Leadership asks for enrolment, collection and placement in one view and nobody can produce it
- You run more than one campus and each has its own version of the truth

## The cost of getting it wrong

The common failure is buying a best-in-class admissions CRM, solving the funnel, and discovering the handover was the expensive part. The registrar's office still re-keys, the academic office still cannot see application context, and finance still reconciles fees against a spreadsheet. The funnel got faster; the institution did not.

The reverse failure is real too: buying a full platform when the only problem is counsellor response time. That is a longer implementation than the problem deserves.

## A diagnostic worth ten minutes

Ask three people separately how many systems an applicant's data touches between enquiry and first fee receipt. If the registrar, the CIO and the finance controller give three different numbers, the problem is not the funnel. It is the record.

## Where the AI layer changes the maths

Modern platforms do not just store the record — they act on it: flagging at-risk enrolments before the deadline, assembling accreditation evidence continuously instead of at submission, answering "what is our collection efficiency by programme" in a sentence instead of an export. That only works on a single data model. Bolting AI onto four integrated systems produces four confident answers.`,
    schema: {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Campus management platform vs admissions CRM: which does your institution actually need?',
        author: { '@type': 'Organization', name: 'Ken42' },
        publisher: { '@type': 'Organization', name: 'Ken42' },
    },
    review: { overall: 87, strengths: ['Clean either/or structure AI engines can lift', 'Names the failure mode both ways'], risks: ['Comparison invites competitor rebuttal — keep claims category-level'] },
    aeo: {
        overall: 84,
        grade: 'A-',
        recommendations: [
            'Two bulleted qualifying lists are the most extractable blocks — preserve them verbatim',
            'Add a comparison table with 4-5 rows to win table-format citations',
            'Consider a named-competitor variant hosted off-domain for "Ken42 vs Meritto" queries',
        ],
    },
    metrics: { wordCount: 534, burstiness: 0.68, readingLevel: 'Grade 12', avgSentenceLength: 19 },
};

const naacBlog = {
    title: 'NAAC evidence collection: why it takes six weeks and what removes five of them',
    metaDescription:
        'Accreditation evidence is not a documentation problem, it is a data-residency problem. What institutions assemble by hand, and what a single student record makes continuous.',
    markdown: `## Six weeks is the norm, not the exception

Ask an IQAC coordinator how long the last cycle took and the answer is rarely under a month. The work is not writing the self-study report. It is finding, reconciling and formatting evidence that already exists — in four systems, three spreadsheet families and one departmental email archive.

## Where the six weeks actually go

**Week 1-2 — locating.** Attendance from the academic system, fee receipts from finance, placement records from the training office, faculty qualifications from HR. Every source has a different student identifier.

**Week 3 — reconciling.** The enrolment count in the academic system does not match the fee-paid count, because withdrawals were recorded in one and not the other. Somebody arbitrates by hand.

**Week 4-5 — formatting.** Evidence has to map to specific criteria and metrics. Departments submit what they have, not what the criterion asks for, so it goes back twice.

**Week 6 — review.** The coordinator finds the gaps that only appear once everything is in one document.

## The reframe: evidence is an output, not a project

If attendance, examinations, fees, placements and faculty workload live on one student record, criterion-level evidence is a query, not an expedition. The reconciliation week disappears because there is nothing to reconcile — there is one enrolment number and one fee status per student.

Institutions that made this change describe the difference less as speed and more as **defensibility**: when an assessor asks how a number was derived, there is a single audit trail instead of a chain of exports.

## What still takes human judgment

Narrative sections, best-practice write-ups and the institutional distinctiveness argument are genuinely authorial. No system writes those, and any vendor claiming otherwise is selling you a compliance risk. The goal is to spend week one on the argument instead of on locating the evidence.

## A test for your current stack

Pick one metric — say, graduation outcomes for the last completed batch. Time how long it takes to produce the number with an audit trail from enrolment to result. If it takes more than an afternoon, your accreditation cost is structural, and it recurs every cycle.`,
    schema: {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
            {
                '@type': 'Question',
                name: 'Why does NAAC evidence collection take so long?',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'Most of the time goes to locating evidence across separate academic, finance, placement and HR systems and reconciling identifiers between them — not to writing the self-study report.',
                },
            },
            {
                '@type': 'Question',
                name: 'How can institutions reduce accreditation preparation time?',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'Keeping attendance, examinations, fees, placements and faculty workload on one student record turns criterion-level evidence into a query with a single audit trail, removing the locating and reconciling phases.',
                },
            },
        ],
    },
    review: { overall: 93, strengths: ['Week-by-week breakdown is highly extractable', 'Names what the product does NOT do — builds trust'], risks: [] },
    aeo: {
        overall: 90,
        grade: 'A',
        recommendations: [
            'Week-by-week list is being cited directly — do not compress it',
            'FAQ schema matches on-page questions',
            'Add IQAC coordinator as an explicit audience term in the opening',
        ],
    },
    metrics: { wordCount: 498, burstiness: 0.74, readingLevel: 'Grade 11', avgSentenceLength: 18 },
};

export const contentItems = [
    // ── Completed SEO articles ───────────────────────────────────────────────
    seo('seo-migration', {
        status: 'completed',
        title: migrationBlog.title,
        target_keyword: 'switch admissions software mid-cycle',
        intent: 'commercial',
        payload: {
            blog: migrationBlog,
            moneyType: 'objection',
            tier: 'quick_win',
            volume: 210,
            difficulty: 14,
            opportunityScore: 30,
            metricStatus: 'measured',
            geo: { isCandidate: true, type: 'question', recommendedFormat: 'direct-answer guide with FAQ schema' },
            routing: { publish: true, assetType: 'answer guide', action: 'publish on domain' },
            rationale: 'The single most common objection in discovery calls, and nobody in the category answers it honestly.',
            gscMetrics: { impressions: 3184, clicks: 261, position: 4.2, ctr: 0.082 },
        },
        created_at: daysAgo(46),
        updated_at: daysAgo(44),
    }),
    seo('seo-stack', {
        status: 'completed',
        title: stackBlog.title,
        target_keyword: 'campus management platform vs admissions crm',
        intent: 'commercial',
        payload: {
            blog: stackBlog,
            moneyType: 'comparison',
            tier: 'growth',
            volume: 480,
            difficulty: 22,
            opportunityScore: 43,
            metricStatus: 'measured',
            geo: { isCandidate: true, type: 'comparison', recommendedFormat: 'comparison page' },
            routing: { publish: true, assetType: 'comparison page', action: 'publish on domain' },
            rationale: 'Category-defining comparison that reframes the shortlist in Ken42\'s favour without naming a competitor.',
            gscMetrics: { impressions: 6120, clicks: 402, position: 6.8, ctr: 0.066 },
        },
        created_at: daysAgo(38),
        updated_at: daysAgo(35),
    }),
    seo('seo-naac', {
        status: 'completed',
        title: naacBlog.title,
        target_keyword: 'naac evidence collection',
        intent: 'informational',
        payload: {
            blog: naacBlog,
            moneyType: 'none',
            tier: 'quick_win',
            volume: 890,
            difficulty: 11,
            opportunityScore: 80,
            metricStatus: 'measured',
            geo: { isCandidate: true, type: 'question', recommendedFormat: 'how-to guide with FAQ schema' },
            routing: { publish: true, assetType: 'answer guide', action: 'publish on domain' },
            rationale: 'Highest-volume, lowest-difficulty term in the set, and it maps to a real trigger event (accreditation cycle).',
            gscMetrics: { impressions: 11240, clicks: 1043, position: 3.1, ctr: 0.093 },
        },
        created_at: daysAgo(29),
        updated_at: daysAgo(27),
    }),

    // ── SEO queue (researched, not yet generated) ────────────────────────────
    seo('seo-q-meritto', {
        status: 'queue',
        title: 'Ken42 vs Meritto: admissions CRM or full lifecycle?',
        target_keyword: 'ken42 vs meritto',
        intent: 'transactional',
        payload: {
            moneyType: 'vs',
            tier: 'quick_win',
            volume: 90,
            difficulty: 8,
            opportunityScore: 34,
            metricStatus: 'measured',
            geo: { isCandidate: true, type: 'comparison', recommendedFormat: 'comparison page' },
            routing: { publish: false, assetType: 'comparison page', action: 'Win off-domain — G2 category page and a third-party roundup outrank vendor-owned vs pages for this query' },
            rationale: 'Buyers search this before the first call. Own the narrative off-domain where the answer engines look.',
        },
        created_at: daysAgo(11),
        updated_at: daysAgo(11),
    }),
    seo('seo-q-pricing', {
        status: 'queue',
        title: 'What does campus management software cost in India?',
        target_keyword: 'campus management software pricing india',
        intent: 'commercial',
        payload: {
            moneyType: 'pricing',
            tier: 'quick_win',
            volume: 340,
            difficulty: 17,
            opportunityScore: 60,
            metricStatus: 'measured',
            geo: { isCandidate: true, type: 'question', recommendedFormat: 'pricing explainer with ranges' },
            routing: { publish: true, assetType: 'pricing explainer', action: 'publish on domain' },
            rationale: 'Nobody in the category publishes ranges. A per-student band with honest caveats wins the citation outright.',
        },
        created_at: daysAgo(11),
        updated_at: daysAgo(11),
    }),
    seo('seo-q-sis', {
        status: 'queue',
        title: 'Student information system vs ERP: what a multi-campus group actually buys',
        target_keyword: 'student information system vs erp',
        intent: 'informational',
        payload: {
            moneyType: 'comparison',
            tier: 'growth',
            volume: 720,
            difficulty: 29,
            opportunityScore: 49,
            metricStatus: 'measured',
            geo: { isCandidate: true, type: 'definition', recommendedFormat: 'definition + comparison' },
            routing: { publish: true, assetType: 'comparison page', action: 'publish on domain' },
            rationale: 'CIO-persona entry point; currently answered by US-centric sources with no Indian regulatory context.',
        },
        created_at: daysAgo(11),
        updated_at: daysAgo(11),
    }),
    seo('seo-q-nirf', {
        status: 'queue',
        title: 'NIRF 2026 parameter weights: what institutions can still influence',
        target_keyword: 'nirf 2026 parameters',
        intent: 'informational',
        payload: {
            moneyType: 'none',
            tier: 'quick_win',
            volume: 1900,
            difficulty: 19,
            opportunityScore: 100,
            metricStatus: 'measured',
            geo: { isCandidate: true, type: 'list', recommendedFormat: 'reference table' },
            routing: { publish: true, assetType: 'reference page', action: 'publish on domain' },
            rationale: 'Seasonal spike term with a real reference table from the uploaded weights file. Highest opportunity score in the set.',
        },
        created_at: daysAgo(7),
        updated_at: daysAgo(7),
    }),
    seo('seo-q-whatsapp', {
        status: 'generating',
        title: 'WhatsApp for student communication: what is actually compliant',
        target_keyword: 'whatsapp student communication compliance',
        intent: 'informational',
        payload: {
            moneyType: 'none',
            tier: 'growth',
            volume: 260,
            difficulty: 21,
            opportunityScore: 37,
            metricStatus: 'measured',
            geo: { isCandidate: true, type: 'question', recommendedFormat: 'compliance explainer' },
            routing: { publish: true, assetType: 'answer guide', action: 'publish on domain' },
            rationale: 'KenMeet entry point; DPDP-era question with no credible Indian answer published yet.',
        },
        created_at: daysAgo(0.2),
        updated_at: daysAgo(0.1),
    }),

    // ── Ads ─────────────────────────────────────────────────────────────────
    {
        id: id('content-ads-linkedin-registrar'),
        workspace_id: WS,
        type: 'ads',
        status: 'completed',
        title: 'LinkedIn — Registrar pain, admissions cycle time',
        target_keyword: '',
        intent: '',
        source: 'ad-generator',
        campaign_id: id('campaign-intake'),
        campaign_step_id: 'step-ads-registrar',
        payload: {
            config: { platform: 'linkedin', objective: 'Book a KenRoll walkthrough with registrars before the November renewal window', campaignType: 'lead-gen', count: 4 },
            variants: [
                {
                    angle: 'outcome',
                    framework: 'PAS',
                    headline: '21 days to an offer. Your competitor answers in 9.',
                    primaryText:
                        'Every day between application and offer is a day a candidate keeps looking. One 14,000-student university cut application-to-offer from 21 days to 9 by putting admissions, verification and fee mapping on one record — no re-keying between counsellors and the academic office.\n\nSee what that looks like on your intake.',
                    description: 'KenRoll — admissions on one record',
                    cta: 'Book a walkthrough',
                    rationale: 'Leads with the cycle-time number registrars are measured on, not with features.',
                    validation: { ok: true, warnings: [] },
                },
                {
                    angle: 'objection',
                    framework: 'BAB',
                    headline: 'You can switch admissions software without risking the cycle',
                    primaryText:
                        '"We cannot migrate mid-cycle" is the most common thing we hear from registrars — and usually it is right. There is a safe window: one stage boundary, one owner per stage, one parallel run.\n\nWe wrote the honest version, including when to wait.',
                    description: 'Read the mid-cycle migration guide',
                    cta: 'Read the guide',
                    rationale: 'Answers the objection that kills deals before a demo, and routes to the top-performing article.',
                    validation: { ok: true, warnings: [] },
                },
                {
                    angle: 'authority',
                    framework: 'social_proof',
                    headline: 'Nine systems. One data model.',
                    primaryText:
                        'Most campuses run six to nine disconnected systems — admissions here, academics there, fees somewhere else. Ken42 replaces the stack with one AI-native platform, and institutions report 30-50% less manual administrative effort.\n\nBuilt in India, for Indian regulatory reality.',
                    description: 'The operating system for modern universities',
                    cta: 'See the platform',
                    rationale: 'Platform-level claim for CIO and VC audiences layered on the same campaign.',
                    validation: { ok: true, warnings: [] },
                },
                {
                    angle: 'urgency',
                    framework: 'direct_response',
                    headline: 'Renewal season is the only safe time to change this',
                    primaryText:
                        'Admissions CRM renewals land in November. It is also the only window where a migration does not touch a live merit list. If you are renewing a tool that stops at enrolment, this is the conversation to have now — not in March.',
                    description: 'KenRoll — 6-week implementation',
                    cta: 'Talk to us',
                    rationale: 'Ties urgency to a real procurement calendar rather than a manufactured deadline.',
                    validation: { ok: true, warnings: ['Headline at 46/70 chars — room to add the audience term'] },
                },
            ],
            targeting: {
                adjacentTitles: [
                    { title: 'Registrar', seniority: 'Director', why: 'Primary buyer — owns the enrolment number' },
                    { title: 'Director of Admissions', seniority: 'Director', why: 'Primary buyer, runs the counselling team' },
                    { title: 'Chief Information Officer', seniority: 'CXO', why: 'Technical veto on integration and data residency' },
                    { title: 'Vice-Chancellor', seniority: 'CXO', why: 'Economic buyer, releases budget' },
                    { title: 'Finance Controller', seniority: 'Director', why: 'Owns fee reconciliation — KenFin expansion path' },
                    { title: 'IQAC Coordinator', seniority: 'Manager', why: 'Feels accreditation evidence pain most acutely' },
                    { title: 'Training & Placement Officer', seniority: 'Manager', why: 'KenCareers influencer, ranking-linked metrics' },
                ],
                jobFunctions: ['Education Administration', 'Information Technology', 'Operations', 'Finance'],
                exclusions: ['Students', 'Teaching Assistants', 'K-12 school administrators', 'Coaching institute staff'],
                recommendedCombination:
                    'Industry: Higher Education + Company size 201-5000 + Seniority Director/VP/CXO + Function: Education Administration or IT + Geography: India (Bengaluru, Pune, Hyderabad, Chennai, Delhi NCR)',
            },
        },
        created_at: daysAgo(24),
        updated_at: daysAgo(23),
    },
    {
        id: id('content-ads-google-naac'),
        workspace_id: WS,
        type: 'ads',
        status: 'completed',
        title: 'Google Search — NAAC / accreditation intent',
        target_keyword: 'naac evidence software',
        intent: 'commercial',
        source: 'ad-generator',
        campaign_id: id('campaign-accreditation'),
        campaign_step_id: 'step-ads-naac',
        payload: {
            config: { platform: 'google', objective: 'Capture accreditation-cycle search intent for KenCompliance', campaignType: 'lead-gen', count: 3 },
            variants: [
                {
                    angle: 'outcome',
                    framework: 'feature_benefit',
                    headline: 'NAAC Evidence Without The Six-Week Scramble',
                    primaryText: '',
                    description: 'One student record. Criterion-level evidence with a full audit trail.',
                    cta: 'See how it works',
                    rationale: 'Mirrors the exact phrasing of the top-performing organic article.',
                    validation: { ok: true, warnings: [] },
                },
                {
                    angle: 'problem',
                    framework: 'PAS',
                    headline: 'Accreditation Evidence In Four Systems?',
                    primaryText: '',
                    description: 'Attendance, fees, placements and faculty data on one record. Query it, do not assemble it.',
                    cta: 'Book a demo',
                    rationale: 'Names the structural problem an IQAC coordinator recognises instantly.',
                    validation: { ok: true, warnings: [] },
                },
                {
                    angle: 'authority',
                    framework: 'direct_response',
                    headline: 'Built For NAAC, NIRF And AICTE Reporting',
                    primaryText: '',
                    description: 'Indian regulatory reality by design — not a retrofitted US student system.',
                    cta: 'Compare platforms',
                    rationale: 'Differentiates against Ellucian and PowerSchool on the axis boards care about.',
                    validation: { ok: true, warnings: [] },
                },
            ],
        },
        created_at: daysAgo(18),
        updated_at: daysAgo(18),
    },

    // ── Outreach (generated sequences, promoted to the send engine) ──────────
    {
        id: id('content-outreach-registrar'),
        workspace_id: WS,
        type: 'outreach',
        status: 'completed',
        title: 'Cold — Registrars, admissions cycle time (5 touch)',
        target_keyword: '',
        intent: '',
        source: 'sequence-generator',
        campaign_id: id('campaign-intake'),
        campaign_step_id: 'step-outreach-registrar',
        payload: {
            config: { mode: 'cold', touchCount: 5, channels: ['email', 'linkedin'], icp: 'Registrar / Director of Admissions' },
            sequence: {
                mode: 'cold',
                name: 'Registrars — cycle time (Q3)',
                steps: [
                    {
                        stepNumber: 1,
                        channel: 'email',
                        dayOffset: 0,
                        framework: 'PAS',
                        subject: 'the 21-day gap at {{company}}',
                        body: 'Hi {{firstname}},\n\nMost registrar offices I speak to lose candidates in the same place: the gap between a completed application and an issued offer. Three weeks is normal. Nine days is what one Karnataka university got to after they stopped re-keying applicant data between the admissions tool and the academic office.\n\nIs cycle time something you are actively trying to pull down for the next intake, or is the bigger problem further downstream?',
                        cta: 'Worth a 20-minute look at where your cycle actually stalls?',
                    },
                    {
                        stepNumber: 2,
                        channel: 'linkedin',
                        dayOffset: 3,
                        framework: 'connect',
                        subject: '',
                        body: 'Connecting after your panel comment on counsellor workload — the re-keying point matched what eleven registrars told us this quarter almost word for word.',
                        cta: '',
                    },
                    {
                        stepNumber: 3,
                        channel: 'email',
                        dayOffset: 5,
                        framework: 'value_add',
                        subject: 'the honest answer on mid-cycle migration',
                        body: 'Hi {{firstname}},\n\nThe objection I hear most is "we cannot migrate mid-cycle" — and most of the time that is correct. There is a narrow safe window, and there are three conditions that have to hold.\n\nWe wrote it up without the vendor gloss, including when to wait: the stage boundary, one owner per stage, and a parallel run of one full stage.\n\nSending it because it is useful whether or not you ever talk to us.',
                        cta: 'Happy to send the migration checklist as a one-pager if useful.',
                    },
                    {
                        stepNumber: 4,
                        channel: 'email',
                        dayOffset: 10,
                        framework: 'one_liner',
                        subject: 'one number',
                        body: 'Hi {{firstname}},\n\nOne number, then I will leave it: 38 counsellors, zero re-keying, same-day document verification. That was the operational change, not a new dashboard.\n\nIs the academic-office handover a problem worth 20 minutes at {{company}}?',
                        cta: 'Reply with a day and I will work around your calendar.',
                    },
                    {
                        stepNumber: 5,
                        channel: 'email',
                        dayOffset: 14,
                        framework: 'breakup',
                        subject: 'closing the loop',
                        body: 'Hi {{firstname}},\n\nI will stop here — clearly not the priority this cycle, which is fair in the middle of an intake.\n\nIf the handover between admissions and academics becomes the thing you want to fix before the next one, the door is open. And if the honest migration guide is the only useful thing that came out of this, that is a fine outcome too.',
                        cta: 'All the best with the intake.',
                    },
                ],
            },
        },
        created_at: daysAgo(21),
        updated_at: daysAgo(20),
    },
    {
        id: id('content-outreach-cio'),
        workspace_id: WS,
        type: 'outreach',
        status: 'completed',
        title: 'Cold — CIOs, stack consolidation (4 touch)',
        target_keyword: '',
        intent: '',
        source: 'sequence-generator',
        campaign_id: id('campaign-consolidation'),
        campaign_step_id: 'step-outreach-cio',
        payload: {
            config: { mode: 'cold', touchCount: 4, channels: ['email', 'linkedin'], icp: 'CIO / Head of Digital Transformation' },
            sequence: {
                mode: 'cold',
                name: 'CIOs — consolidation (Q3)',
                steps: [
                    {
                        stepNumber: 1,
                        channel: 'email',
                        dayOffset: 0,
                        framework: 'PAS',
                        subject: 'how many systems does one applicant touch at {{company}}?',
                        body: 'Hi {{firstname}},\n\nWhen I ask a registrar, a CIO and a finance controller at the same institution how many systems an applicant\'s data passes through before the first fee receipt, I usually get three different numbers. That gap is the integration work your team ends up owning.\n\nAre you consolidating at the group level, or holding the line with integration glue for now?',
                        cta: 'If a single-data-model architecture is on the table, worth a technical call.',
                    },
                    {
                        stepNumber: 2,
                        channel: 'linkedin',
                        dayOffset: 3,
                        framework: 'connect',
                        subject: '',
                        body: 'Connecting — we work with multi-campus groups on consolidating admissions, academics and fees onto one record. Happy to share the integration surface docs if that is a live question for you.',
                        cta: '',
                    },
                    {
                        stepNumber: 3,
                        channel: 'email',
                        dayOffset: 6,
                        framework: 'value_add',
                        subject: 'API docs, SSO and the data-residency answer',
                        body: 'Hi {{firstname}},\n\nSkipping the pitch — the three things every CIO asks before a first call: the integration surface, SSO and audit logging, and where the data physically sits.\n\nI can send all three as documentation you can hand to your security reviewer, plus a sandbox tenant so your team can test against real API responses instead of a slide.',
                        cta: 'Want the sandbox and the docs?',
                    },
                    {
                        stepNumber: 4,
                        channel: 'email',
                        dayOffset: 12,
                        framework: 'breakup',
                        subject: 'last one',
                        body: 'Hi {{firstname}},\n\nLast note from me. If the current ERP is supported and integration is holding, this is genuinely not urgent for you.\n\nIf an end-of-life or a group consolidation mandate lands, the sandbox offer stands — no commercial conversation needed to use it.',
                        cta: '',
                    },
                ],
            },
        },
        created_at: daysAgo(19),
        updated_at: daysAgo(19),
    },
];

// ── Social calendar ─────────────────────────────────────────────────────────

const socialPost = (key, { offset, platform, status, hook, body, hashtags, cta, voice, formula, campaignId = null, stepId = '' }) => ({
    id: id(`content-social-${key}`),
    workspace_id: WS,
    type: 'social',
    status,
    title: hook.length > 70 ? `${hook.slice(0, 67)}…` : hook,
    target_keyword: '',
    intent: '',
    source: 'content-calendar',
    campaign_id: campaignId,
    campaign_step_id: stepId,
    payload: {
        date: dateOffset(offset),
        platform,
        post: {
            platform,
            voice,
            formula,
            hook,
            body,
            hashtags,
            cta,
            validation: { ok: true, charCount: body.length, warnings: [] },
        },
    },
    created_at: daysAgo(Math.max(1, 14 - offset)),
    updated_at: daysAgo(Math.max(0.5, 13 - offset)),
});

export const socialItems = [
    socialPost('s1', {
        offset: -12,
        platform: 'linkedin',
        status: 'completed',
        voice: 'company',
        formula: 'contrarian',
        hook: 'Your admissions CRM is not the problem. The handover is.',
        body: 'Your admissions CRM is not the problem. The handover is.\n\nEvery institution we talk to has fixed the funnel. Enquiries get routed, counsellors follow up, applications get tracked.\n\nThen the applicant enrols, and the data gets typed into a second system by hand.\n\nThat is where the 21-day cycle comes from. Not slow counsellors — a boundary between two systems that were never designed to speak.\n\nThe fix is not a better CRM. It is one record that survives enrolment.',
        hashtags: ['#HigherEducation', '#CampusOperations'],
        cta: 'How many systems does an applicant touch at your institution before the first fee receipt?',
        campaignId: id('campaign-intake'),
        stepId: 'step-social-awareness',
    }),
    socialPost('s2', {
        offset: -9,
        platform: 'linkedin',
        status: 'completed',
        voice: 'founder',
        formula: 'time-anchor',
        hook: 'Six weeks. That is what one IQAC coordinator told me her last NAAC cycle cost her.',
        body: 'Six weeks. That is what one IQAC coordinator told me her last NAAC cycle cost her.\n\nNot writing the self-study report. Locating evidence.\n\nAttendance in one system. Fee receipts in another. Placements in a spreadsheet the training office owns. Faculty qualifications in HR. Four different student identifiers.\n\nWeek three went entirely to arbitrating why the enrolment count and the fee-paid count disagreed.\n\nI keep coming back to this because it is not a documentation problem. It is a data-residency problem, and it recurs every single cycle.',
        hashtags: ['#NAAC', '#HigherEd'],
        cta: 'IQAC folks — how long did your last cycle actually take?',
    }),
    socialPost('s3', {
        offset: -5,
        platform: 'linkedin',
        status: 'completed',
        voice: 'company',
        formula: 'list',
        hook: 'Three conditions for switching admissions software without wrecking your cycle:',
        body: 'Three conditions for switching admissions software without wrecking your cycle:\n\n1. A stage boundary you can freeze. Most Indian institutions have one between document verification and merit list.\n\n2. One source of truth per stage, in writing. Not "both systems" — each stage owned by exactly one system on a dated plan.\n\n3. A parallel run of one complete stage, with reconciled record counts before cutover.\n\nIf all three hold, mid-cycle is survivable. If any one fails, wait for the inter-cycle window.\n\nThe migration nobody should attempt: a live merit list.',
        hashtags: ['#Admissions', '#EdTech'],
        cta: 'Registrars — which of these three is hardest at your institution?',
    }),
    socialPost('s4', {
        offset: -2,
        platform: 'linkedin',
        status: 'completed',
        voice: 'company',
        formula: 'curiosity-gap',
        hook: 'We asked three people at the same university how many systems an applicant touches. We got three different answers.',
        body: 'We asked three people at the same university how many systems an applicant touches between enquiry and first fee receipt.\n\nThe registrar said four.\nThe CIO said seven.\nThe finance controller said "which fee?"\n\nNobody was wrong. They each see their own segment of a record that never travels intact.\n\nThat is the diagnostic. If the three answers disagree, the problem is not your funnel — it is that no one owns the whole record.',
        hashtags: ['#CampusManagement'],
        cta: 'Try it at your institution. Ask three people separately.',
    }),
    socialPost('s5', {
        offset: 1,
        platform: 'linkedin',
        status: 'queue',
        voice: 'founder',
        formula: 'anaphora',
        hook: 'Built in India. Built for NAAC. Built for the registrar who still reconciles by hand.',
        body: 'Built in India. Built for NAAC. Built for the registrar who still reconciles by hand at 9pm in admission season.\n\nWe did not start from a US student information system and localise it. The accreditation model, the fee structures, the scholarship exceptions, the merit-list logic — those were the first-class problems, not the configuration layer.\n\nThat is a slower way to build a platform. It is the only way it survives an Indian admission cycle.',
        hashtags: ['#MadeInIndia', '#HigherEducation'],
        cta: 'What is the one India-specific requirement your current system still cannot handle?',
    }),
    socialPost('s6', {
        offset: 3,
        platform: 'linkedin',
        status: 'queue',
        voice: 'company',
        formula: 'stat-lead',
        hook: '30-50% of administrative effort at a typical campus is manual reconciliation between systems.',
        body: '30-50% of administrative effort at a typical campus is manual reconciliation between systems.\n\nNot teaching. Not student support. Not admissions strategy.\n\nCopying a number out of one system so it can be typed into another, then checking why the two disagree.\n\nThat is the budget line nobody puts in a business case, because it is spread across every department as "the way things are".',
        hashtags: ['#HigherEd', '#Operations'],
        cta: 'Where does that time go at your institution?',
    }),
    socialPost('s7', {
        offset: 6,
        platform: 'x',
        status: 'queue',
        voice: 'company',
        formula: 'one-liner',
        hook: 'An admissions CRM manages a funnel. A campus platform manages a record. Buying the first when you need the second is how institutions pay twice.',
        body: 'An admissions CRM manages a funnel. A campus platform manages a record.\n\nBuying the first when you need the second is how institutions end up paying for the same capability twice.',
        hashtags: ['#EdTech'],
        cta: '',
    }),
    socialPost('s8', {
        offset: 8,
        platform: 'linkedin',
        status: 'queue',
        voice: 'founder',
        formula: 'lesson-learned',
        hook: 'The feature registrars ask for least and value most: an audit trail.',
        body: 'The feature registrars ask for least and value most: an audit trail.\n\nNobody puts it on an RFP. Then an assessor asks how a graduation-outcome number was derived, and the difference between one lineage and a chain of exports becomes the whole conversation.\n\nWe learned to demo it early, even though it never wins the room. It is what makes the numbers defensible six months later.',
        hashtags: ['#HigherEducation', '#Accreditation'],
        cta: 'What is the unglamorous feature that turned out to matter most in your stack?',
    }),
];

export const content_items = [...contentItems, ...socialItems];
