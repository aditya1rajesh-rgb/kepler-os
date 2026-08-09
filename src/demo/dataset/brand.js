/**
 * Brand Intelligence for the demo workspace: Ken42 (ken42.com).
 *
 * Ken42 is a real company — an AI-native operating system for higher education,
 * built in Bengaluru. Its positioning, module names and headline claims here are
 * taken from its public site. Everything else in this dataset (colours, ICP
 * detail, prospects, metrics, pipeline) is INVENTED for the demo.
 */
import { id } from '../ids';
import { DEMO_USER_ID, DEMO_WORKSPACE_ID } from './identity';
import { daysAgo } from './time';
import { KEN42_SITE } from './website';

const WS = DEMO_WORKSPACE_ID;

export const workspaces = [
    {
        id: WS,
        name: 'Ken42',
        url: 'https://ken42.com',
        tagline: 'The AI-native operating system for modern universities',
        industry: 'Higher Education SaaS',
        logo_color: '#4f39c9',
        brand_colors: ['#4f39c9', '#8b7bf0', '#16c79a', '#0b1020'],
        last_active_module: 'Measurement',
        brand_intel_status: 100,
        created_at: daysAgo(94),
        updated_at: daysAgo(0.3),
    },
];

export const workspace_members = [
    {
        id: id('member-priya'),
        workspace_id: WS,
        user_id: DEMO_USER_ID,
        role: 'owner',
        created_at: daysAgo(94),
    },
];

export const user_profiles = [
    {
        id: DEMO_USER_ID,
        display_name: 'Priya Menon',
        active_workspace_id: WS,
        onboarding_complete: true,
        created_at: daysAgo(96),
        updated_at: daysAgo(0.3),
    },
];

const proofPoints = [
    { text: '30-50% reduction in manual administrative effort across admissions and academics', source: 'ken42.com/platform', confidence: 'high' },
    { text: 'Single platform replacing 6-9 point tools per campus', source: 'ken42.com', confidence: 'high' },
    { text: 'Admissions cycle time cut from 21 days to 9 days at a 14,000-student private university', source: 'Case study (KenRoll)', confidence: 'medium' },
    { text: 'Built in India, designed for the world — deployed across multi-campus groups', source: 'ken42.com', confidence: 'high' },
];

export const brand_profiles = [
    {
        id: id('brand-ken42'),
        workspace_id: WS,
        name: 'Ken42',
        url: 'https://ken42.com',
        tagline: 'The AI-native operating system for modern universities',
        overview:
            'Ken42 replaces the fragmented stack most universities run — a separate admissions CRM, an SIS, a fee tool, a placement tracker, spreadsheets everywhere — with one AI-native platform. Nine products cover the full student lifecycle: KenRoll (admissions and enrolment), KenLearn (academic operations), KenMeet (student engagement), KenFin (fees and finance), KenCareers (placements and alumni), KenOps (administration), KenCompliance (governance and accreditation) and KenNovate. Buyers are registrars, CIOs and vice-chancellors at standalone universities and multi-campus education groups, primarily in India and increasingly across the GCC and South-East Asia. The wedge is operational: institutions adopt Ken42 to remove 30-50% of manual administrative effort, then expand module by module.',
        colors: ['#4f39c9', '#8b7bf0', '#16c79a', '#0b1020', '#f5f6fb', '#111322'],
        fonts: ['Inter', 'Söhne', 'IBM Plex Sans'],
        brand_values: [
            'Institutional trust before novelty',
            'Operational proof over promises',
            'Built for Indian regulatory reality',
            'One platform, not another tool',
            'Faculty and staff time is the real currency',
        ],
        aesthetic: ['Modern institutional', 'Deep indigo and violet', 'Data-forward', 'Calm, uncluttered', 'Campus photography over illustration'],
        tone: ['Credible', 'Plain-spoken', 'Consultative', 'Evidence-led', 'Respectful of academia'],
        color_identity: {
            primaryColor: '#4f39c9',
            secondaryColor: '#8b7bf0',
            accentColor: '#16c79a',
            supportDarkColor: '#0b1020',
            backgroundLightColor: '#f5f6fb',
            textColor: '#111322',
            typographySuggestion: 'Inter for UI and body, tighter tracking on headlines; avoid decorative serifs — buyers read this as ed-tech seriousness.',
            visualDirectionNotes:
                'Deep indigo carries the "operating system" claim; the mint accent is reserved for outcome numbers (time saved, cycle-time cut). Use real campus and staff photography — stock illustration reads as early-stage to a registrar.',
        },
        business_details: {
            industry: 'Higher Education SaaS (campus management / student lifecycle)',
            productsServices:
                'KenRoll, KenLearn, KenMeet, KenFin, KenCareers, KenOps, KenCompliance, KenNovate — modular products on one platform and data model.',
            offersProducts:
                'KenRoll (admissions & enrolment); KenLearn (academic operations); KenMeet (student engagement); KenFin (fees & finance); KenCareers (placements & alumni); KenOps (administration); KenCompliance (governance, NAAC/NIRF/AICTE reporting); KenNovate (AI layer)',
            offerDescriptions:
                'KenRoll — application-to-enrolment workflow, counsellor pipelines, document verification, offer letters. KenLearn — timetabling, attendance, examinations, results, faculty workload. KenMeet — student communication and support across WhatsApp, email and app. KenFin — fee schedules, collections, refunds, scholarships, reconciliation. KenCareers — placement drives, recruiter pipelines, alumni engagement. KenOps — hostel, transport, inventory, HR adjacency. KenCompliance — accreditation evidence, statutory reporting, audit trails. KenNovate — the AI layer: agentic workflows, predictive intervention, natural-language reporting.',
            targetMarket:
                'Private universities and deemed-to-be universities (3,000-40,000 students), multi-campus education groups, and autonomous colleges. India first (Tier 1 and Tier 2 cities), expanding to GCC and South-East Asia.',
            valueProposition:
                'One AI-native platform for the whole student lifecycle, so an institution stops paying — in licence fees and in staff hours — for six systems that do not talk to each other.',
            differentiators:
                'AI-native rather than AI-bolted-on: the platform ships agentic workflows and predictive intervention on a single data model, so a registrar gets answers instead of exports. Built for Indian regulatory and accreditation reality (NAAC, NIRF, AICTE, UGC) instead of retrofitted from a US SIS. Modular commercial model — start with admissions, expand across the lifecycle without a re-implementation.',
            painPointsSolved:
                'Six-to-nine disconnected systems per campus; admissions data that never reaches academics; 21-day application cycles losing candidates to faster institutions; accreditation evidence assembled by hand every cycle; staff spending 30-50% of their week on manual reconciliation; leadership without a live view of enrolment or fee collection.',
            proofPoints: proofPoints,
            companySize: '80-150 employees, Bengaluru HQ, founded 2019',
            geographicFocus: 'India (primary), GCC and South-East Asia (expansion)',
            keyMessages: [
                'Not another tool — the intelligent backbone of your institution',
                'Replace the stack, not just the CRM',
                'AI-native, not AI-bolted-on',
                'Built in India, designed for the world',
                '30-50% less manual administrative effort',
            ],
        },
        // Keys are the camelCase paths in BRAND_HEALTH_PATHS (src/lib/brandHealth.js) —
        // that is what the health strip scores, so every scored field has an entry.
        field_provenance: {
            tagline: { origin: 'website', updatedAt: daysAgo(12) },
            overview: { origin: 'combined', updatedAt: daysAgo(12) },
            tone: { origin: 'manual', updatedAt: daysAgo(11) },
            values: { origin: 'manual', updatedAt: daysAgo(11) },
            colors: { origin: 'website', updatedAt: daysAgo(12) },
            fonts: { origin: 'website', updatedAt: daysAgo(12) },
            aesthetic: { origin: 'workspace', updatedAt: daysAgo(24) },
            colorIdentity: { origin: 'website', updatedAt: daysAgo(12) },
            'businessDetails.offersProducts': { origin: 'website', updatedAt: daysAgo(12) },
            'businessDetails.offerDescriptions': { origin: 'combined', updatedAt: daysAgo(12) },
            'businessDetails.differentiators': { origin: 'manual', updatedAt: daysAgo(9) },
            'businessDetails.painPointsSolved': { origin: 'manual', updatedAt: daysAgo(9) },
            'businessDetails.valueProposition': { origin: 'manual', updatedAt: daysAgo(9) },
            'businessDetails.keyMessages': { origin: 'learned', updatedAt: daysAgo(6) },
            'businessDetails.proofPoints': { origin: 'file', updatedAt: daysAgo(26) },
        },
        population_meta: {
            lastRunAt: daysAgo(12),
            lastRunStatus: 'success',
            lastRunErrors: [],
            sourcesUsed: ['website:ken42.com', 'file:Ken42-Institutional-Deck-2026.pdf', 'file:KenRoll-Case-Study.pdf'],
            autoRunCompleted: true,
            // Baseline for the source-freshness check — identical to what the demo
            // page reader returns, so the site reads "In sync" rather than drifted.
            websiteSource: {
                url: 'https://ken42.com',
                fetchedAt: daysAgo(12),
                bodyText: KEN42_SITE.bodyText,
            },
        },
        created_at: daysAgo(94),
        updated_at: daysAgo(9),
    },
];

export const personas = [
    {
        id: id('persona-registrar'),
        workspace_id: WS,
        role: 'Registrar / Director of Admissions',
        titles: ['Registrar', 'Director of Admissions', 'Deputy Registrar (Academics)', 'Head of Admissions', 'Admissions Manager'],
        pain_points:
            'Owns the enrolment number but not the systems that produce it. Application data sits in a CRM the academic office cannot see, so every merit list, offer letter and fee mapping is re-keyed by hand. Peak season means 40-person counselling teams working off spreadsheets, and a 21-day cycle that loses candidates to institutions that answer in three.',
        channels: ['Email', 'LinkedIn', 'Industry conferences', 'Peer referral', 'WhatsApp'],
        source_origin: 'ai',
        details: {
            segment: 'Private and deemed universities, 3,000-40,000 students',
            companyType: 'Standalone university or autonomous college',
            geography: 'India — Bengaluru, Pune, Hyderabad, Delhi NCR, Chennai, Coimbatore',
            triggers:
                'Admission season post-mortem showing lost applicants; a NAAC or NIRF cycle exposing manual evidence gathering; a new vice-chancellor with a growth mandate; the incumbent admissions CRM contract coming up for renewal.',
            blockers:
                'Fear of a mid-cycle migration; IT team says integration with the existing SIS is impossible; procurement wants three quotes and a reference from a peer institution; last vendor over-promised.',
            buyingContext:
                'Recommends, rarely signs alone. Needs the CIO to bless integration and the VC or trustee board to release budget. Decides between admission cycles — a November-to-January window.',
            messagingHooks: [
                'Your counsellors re-key the same applicant four times',
                'From 21 days to 9 days to an accepted offer',
                'Admissions data the academic office can actually see',
                'One platform your registrar office does not have to reconcile',
            ],
            useCases: 'KenRoll first, then KenFin for fee mapping and KenLearn for the academic handover.',
        },
        created_at: daysAgo(92),
    },
    {
        id: id('persona-cio'),
        workspace_id: WS,
        role: 'CIO / Head of Digital Transformation',
        titles: ['Chief Information Officer', 'Head of IT', 'Director — Digital Transformation', 'IT Manager (Campus Systems)', 'Head of Academic Systems'],
        pain_points:
            'Inherited nine systems from nine procurement cycles, each with its own vendor, database and downtime. Spends the year writing integration glue and answering "why is this number different in two places". Every new request from academics or finance means another point tool to support with the same three-person team.',
        channels: ['LinkedIn', 'Email', 'Technical webinars', 'Analyst reports', 'CIO peer groups'],
        source_origin: 'ai',
        details: {
            segment: 'Multi-campus education groups, 10,000-60,000 students across campuses',
            companyType: 'Education group / multi-institution trust',
            geography: 'India (multi-city groups), GCC',
            triggers:
                'A data-integrity incident between systems; a group-level mandate to consolidate vendors; an ERP end-of-life or unsupported version; a security or DPDP-compliance review.',
            blockers:
                'Sunk cost in the current ERP; migration risk during a live semester; wants API documentation, SSO, audit logs and a real data-residency answer before a first call.',
            buyingContext:
                'The technical gatekeeper — can veto instantly. Evaluates architecture, single data model, integration surface and roadmap ownership. Wants a sandbox, not a slide.',
            messagingHooks: [
                'Nine systems, one data model',
                'Stop writing integration glue between admissions and academics',
                'SSO, audit trails and DPDP-ready by default',
                'A sandbox tenant before you commit a semester',
            ],
            useCases: 'Platform-level consolidation: KenOps and KenLearn as the spine, KenCompliance for audit.',
        },
        created_at: daysAgo(92),
    },
    {
        id: id('persona-vc'),
        workspace_id: WS,
        role: 'Vice-Chancellor / Pro-VC (growth mandate)',
        titles: ['Vice-Chancellor', 'Pro Vice-Chancellor', 'Provost', 'Director (Institution)', 'Trustee — Academics'],
        pain_points:
            'Judged on enrolment growth, NIRF rank and placement outcomes, but has no live view of any of them. Board meetings run on month-old spreadsheets assembled by four departments. Knows the institution is losing candidates to faster peers but cannot see where in the funnel.',
        channels: ['Peer referral', 'Industry conferences', 'Email', 'Analyst and ranking reports', 'LinkedIn'],
        source_origin: 'manual',
        details: {
            segment: 'Ambitious private universities and deemed universities',
            companyType: 'Standalone university with a growth or ranking mandate',
            geography: 'India, GCC',
            triggers:
                'A disappointing NIRF or NAAC outcome; a board-approved growth target; a new campus or programme launch; a competitor institution visibly modernising.',
            blockers:
                'Budget cycles tied to the academic year; wants named peer references; delegates evaluation to the registrar and CIO, so the business case has to survive two translations.',
            buyingContext:
                'The economic buyer. Cares about enrolment, ranking and reputation, not features. Buys an outcome and a partner, and needs the story to be defensible to a trustee board.',
            messagingHooks: [
                'A live view of enrolment, fees and placements in one place',
                'The institutions climbing NIRF are the ones that fixed operations first',
                'Accreditation evidence that assembles itself',
                'Your staff spend half their week reconciling — reclaim it',
            ],
            useCases: 'Executive dashboards across KenRoll, KenFin and KenCareers; KenCompliance for accreditation.',
        },
        created_at: daysAgo(58),
    },
];

export const competitors = [
    {
        id: id('comp-meritto'),
        workspace_id: WS,
        name: 'Meritto',
        url: 'https://www.meritto.com',
        confirmed: true,
        notes: 'Formerly NoPaperForms. The default admissions CRM in Indian education and the incumbent Ken42 displaces most often. Strong brand, education-specific, deep counsellor workflows. Weakness: admissions-only — stops at enrolment, so academics, fees and compliance stay fragmented. Beat them on lifecycle, not on CRM features.',
        created_at: daysAgo(92),
    },
    {
        id: id('comp-camu'),
        workspace_id: WS,
        name: 'Camu Digital Campus',
        url: 'https://camudigitalcampus.com',
        confirmed: true,
        notes: 'Closest functional overlap: SIS plus CRM in one product, so they make the same "you do not need two systems" argument. Differentiate on the AI layer and on modular expansion rather than a single monolithic implementation.',
        created_at: daysAgo(92),
    },
    {
        id: id('comp-academia'),
        workspace_id: WS,
        name: 'Academia ERP',
        url: 'https://www.academiaerp.com',
        confirmed: true,
        notes: 'By Serosoft. Established higher-ed ERP with a long install base and international presence. Perceived as reliable but heavy; implementations run long. Ken42 wins on time-to-value and on the registrar experience.',
        created_at: daysAgo(92),
    },
    {
        id: id('comp-creatrix'),
        workspace_id: WS,
        name: 'Creatrix Campus',
        url: 'https://www.creatrixcampus.com',
        confirmed: true,
        notes: 'Strong on accreditation and outcome-based education modules — the direct rival whenever NAAC or ABET evidence drives the evaluation. Counter with KenCompliance plus the single data model.',
        created_at: daysAgo(76),
    },
    {
        id: id('comp-leadsquared'),
        workspace_id: WS,
        name: 'LeadSquared',
        url: 'https://www.leadsquared.com',
        confirmed: true,
        notes: 'Horizontal sales-execution CRM with a large education vertical. Wins on marketing automation and counsellor telephony. Not an institutional system of record — position them as the top of the funnel Ken42 subsumes.',
        created_at: daysAgo(76),
    },
    {
        id: id('comp-extraaedge'),
        workspace_id: WS,
        name: 'ExtraaEdge',
        url: 'https://www.extraaedge.com',
        confirmed: false,
        notes: 'Admissions-CRM challenger, aggressive on price in Tier 2 deals. Shows up in mid-market bake-offs against KenRoll alone. Unconfirmed — appeared in two AI answer sets and one lost-deal note.',
        created_at: daysAgo(31),
    },
    {
        id: id('comp-ellucian'),
        workspace_id: WS,
        name: 'Ellucian',
        url: 'https://www.ellucian.com',
        confirmed: false,
        notes: 'Global higher-ed incumbent. Only appears in GCC and international-campus deals, where "global standard" carries weight with boards. Counter on Indian regulatory fit and cost of ownership.',
        created_at: daysAgo(24),
    },
];

export const brand_suggestions = [
    {
        id: id('sugg-icp-cfo'),
        workspace_id: WS,
        suggestion_type: 'icp',
        payload: {
            role: 'Group CFO / Finance Controller',
            titles: ['Group CFO', 'Finance Controller', 'Head of Finance', 'Bursar'],
            painPoints:
                'Fee collection reconciled across campuses by hand, no live view of outstanding dues, scholarship and refund exceptions tracked in email. Signs off the spend but is measured on collection efficiency.',
            channels: ['Email', 'LinkedIn', 'CFO peer groups'],
            rationale:
                'KenFin closes 34% of expansion revenue but no ICP represents the finance buyer. Three of your last five expansions were finance-led.',
        },
        origin: 'ai',
        status: 'pending',
        created_at: daysAgo(6),
    },
    {
        id: id('sugg-icp-placement'),
        workspace_id: WS,
        suggestion_type: 'icp',
        payload: {
            role: 'Head of Placements / Corporate Relations',
            titles: ['Head of Placements', 'Director — Corporate Relations', 'Training & Placement Officer'],
            painPoints:
                'Placement percentage is a ranking input and a marketing claim, but drives are run on spreadsheets and recruiter email threads. Cannot prove outcomes to NIRF without a month of collation.',
            channels: ['LinkedIn', 'Email', 'Recruiter networks'],
            rationale: 'KenCareers appears in 6 of 11 recent AI answer sets about Ken42 but has no dedicated ICP or content.',
        },
        origin: 'ai',
        status: 'pending',
        created_at: daysAgo(6),
    },
    {
        id: id('sugg-comp-classplus'),
        workspace_id: WS,
        suggestion_type: 'competitor',
        payload: {
            name: 'PowerSchool',
            url: 'https://www.powerschool.com',
            rationale:
                'Named alongside Ken42 in 4 of 12 Perplexity answers for "best campus management platform". K-12-weighted, but it is shaping the answer set buyers read.',
        },
        origin: 'ai',
        status: 'pending',
        created_at: daysAgo(4),
    },
];

export const workspace_files = [
    {
        id: id('file-deck'),
        workspace_id: WS,
        name: 'Ken42-Institutional-Deck-2026.pdf',
        size_bytes: 4_812_004,
        status: 'analyzed',
        scope: ['brand', 'seo', 'ads', 'outreach'],
        storage_path: `${WS}/ken42-institutional-deck-2026.pdf`,
        mime_type: 'application/pdf',
        origin: 'upload',
        included_in_analysis: true,
        extracted_text:
            'Ken42 — the AI-native operating system for modern universities. Nine products, one data model: KenRoll, KenLearn, KenMeet, KenFin, KenCareers, KenOps, KenCompliance, KenNovate. Institutions run six to nine disconnected systems; Ken42 replaces the stack. Outcome: 30-50% reduction in manual administrative effort. Admissions cycle time reduced from 21 days to 9. Built in India, designed for the world.',
        analyzed_at: daysAgo(38),
        analysis_meta: {
            extractedThemes: ['Stack consolidation', 'AI-native architecture', 'Admissions cycle time', 'Indian regulatory fit', 'Modular expansion'],
            extractedStats: ['30-50% less manual admin effort', '6-9 systems replaced per campus', '21 days → 9 days admissions cycle', '9 products on one data model'],
            modulesLikelyImpacted: ['brand-intelligence', 'seo-aeo', 'ad-campaigns', 'outreach'],
            canReprocess: true,
        },
        created_at: daysAgo(38),
    },
    {
        id: id('file-casestudy'),
        workspace_id: WS,
        name: 'KenRoll-Case-Study-Private-University.pdf',
        size_bytes: 1_204_880,
        status: 'analyzed',
        scope: ['brand', 'seo', 'outreach'],
        storage_path: `${WS}/kenroll-case-study.pdf`,
        mime_type: 'application/pdf',
        origin: 'upload',
        included_in_analysis: true,
        extracted_text:
            'A 14,000-student private university in Karnataka consolidated three admissions tools into KenRoll ahead of the 2025 intake. Application-to-offer time fell from 21 days to 9. Counsellor re-keying eliminated across 38 counsellors. Document verification moved from 4 days to same-day. Fee mapping handover to KenFin removed a 3-week reconciliation at cycle close.',
        analyzed_at: daysAgo(37),
        analysis_meta: {
            extractedThemes: ['Admissions cycle time', 'Counsellor productivity', 'Document verification', 'Fee handover'],
            extractedStats: ['21 → 9 days application-to-offer', '38 counsellors, zero re-keying', 'Same-day document verification', '3-week reconciliation removed'],
            modulesLikelyImpacted: ['seo-aeo', 'outreach', 'ad-campaigns'],
            canReprocess: true,
        },
        created_at: daysAgo(37),
    },
    {
        id: id('file-icp-notes'),
        workspace_id: WS,
        name: 'Discovery-call-notes-Q2-registrars.docx',
        size_bytes: 86_420,
        status: 'analyzed',
        scope: ['brand', 'outreach'],
        storage_path: `${WS}/discovery-notes-q2.docx`,
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        origin: 'upload',
        included_in_analysis: true,
        extracted_text:
            'Eleven discovery calls with registrars and admissions heads, April-June. Recurring objection: "we cannot migrate mid-cycle". Recurring trigger: NAAC evidence collection. Every registrar named the academic-office handover as the worst part of the cycle. Three asked unprompted whether Ken42 replaces Meritto or sits alongside it.',
        analyzed_at: daysAgo(29),
        analysis_meta: {
            extractedThemes: ['Mid-cycle migration fear', 'NAAC evidence trigger', 'Academic handover pain', 'Meritto displacement question'],
            extractedStats: ['11 discovery calls', '3 of 11 asked about Meritto displacement'],
            modulesLikelyImpacted: ['outreach', 'seo-aeo', 'brand-intelligence'],
            canReprocess: true,
        },
        created_at: daysAgo(29),
    },
    {
        id: id('file-nirf'),
        workspace_id: WS,
        name: 'NIRF-2026-parameter-weights.xlsx',
        size_bytes: 248_112,
        status: 'analyzed',
        scope: ['seo'],
        storage_path: `${WS}/nirf-2026-weights.xlsx`,
        mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        origin: 'upload',
        included_in_analysis: true,
        extracted_text:
            'NIRF 2026 parameter weights: Teaching, Learning & Resources 30%; Research & Professional Practice 30%; Graduation Outcomes 20%; Outreach & Inclusivity 10%; Perception 10%. Data submission window and evidence requirements per parameter.',
        analyzed_at: daysAgo(21),
        analysis_meta: {
            extractedThemes: ['NIRF parameters', 'Evidence requirements', 'Graduation outcomes'],
            extractedStats: ['TLR 30%', 'RPP 30%', 'GO 20%', 'OI 10%', 'Perception 10%'],
            modulesLikelyImpacted: ['seo-aeo'],
            canReprocess: true,
        },
        created_at: daysAgo(21),
    },
];
