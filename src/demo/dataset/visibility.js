/**
 * AI-visibility scans — the AEO wedge.
 *
 * Four scan runs, three weeks apart, across all four answer surfaces. Ken42's
 * mention and citation rate climbs run over run (the effect the published answer
 * guides are meant to have), while Meritto stays the category default — a share-of-
 * voice story rather than a flat "you are winning" chart.
 */
import { id } from '../ids';
import { hashPrompt } from '../../lib/visibility';
import { DEMO_WORKSPACE_ID } from './identity';
import { daysAgo } from './time';

const WS = DEMO_WORKSPACE_ID;

const SURFACES = ['perplexity', 'openai', 'anthropic', 'google-aio'];

/** The workspace's confirmed + watched competitors (must match brand.js names). */
const TRACKED_COMPETITORS = [
    { name: 'Meritto', domain: 'meritto.com' },
    { name: 'Camu Digital Campus', domain: 'camudigitalcampus.com' },
    { name: 'Academia ERP', domain: 'academiaerp.com' },
    { name: 'Creatrix Campus', domain: 'creatrixcampus.com' },
    { name: 'LeadSquared', domain: 'leadsquared.com' },
    { name: 'ExtraaEdge', domain: 'extraaedge.com' },
    { name: 'Ellucian', domain: 'ellucian.com' },
];

const PROMPTS = [
    {
        prompt: 'What is the best campus management platform for an Indian private university?',
        // Per-run: does the answer mention Ken42 / cite ken42.com?
        mention: [false, true, true, true],
        cited: [false, false, true, true],
        competitors: ['Meritto', 'Camu Digital Campus', 'Academia ERP', 'Creatrix Campus'],
        answer:
            'For an Indian private university, the platforms most often shortlisted are Camu Digital Campus and Academia ERP for full campus management, Meritto for admissions specifically, and Ken42 as the newer AI-native option that covers the full student lifecycle on one data model. The right choice depends on whether the institution needs an admissions CRM or a system of record: Meritto stops at enrolment, while Camu, Academia ERP and Ken42 carry the student record through academics, fees and accreditation. Ken42 differentiates on the AI layer and on Indian regulatory fit (NAAC, NIRF, AICTE reporting).',
        citations: [
            { url: 'https://ken42.com/platform', title: 'Ken42 — the AI-native operating system for modern universities' },
            { url: 'https://ken42.com/blog/campus-management-platform-vs-admissions-crm', title: 'Campus management platform vs admissions CRM' },
            { url: 'https://camudigitalcampus.com/university-management-erp-software/', title: 'Camu — university management ERP' },
        ],
        sentiment: 'positive',
    },
    {
        prompt: 'Can a university switch admissions software in the middle of an admissions cycle?',
        mention: [true, true, true, true],
        cited: [true, true, true, true],
        competitors: ['Meritto'],
        answer:
            'It is possible but conditional. The safest approach requires a stage boundary where the applicant pipeline is briefly empty (commonly between document verification and merit list), a written plan giving exactly one system ownership of each stage, and a parallel run of one complete stage with reconciled record counts before cutover. Institutions should wait for the inter-cycle window if the merit list is already published, if the fee gateway is mid-reconciliation, or if an accreditation submission overlaps the cutover. Migrating a live merit list is not advisable under any circumstances.',
        citations: [
            { url: 'https://ken42.com/blog/switch-admissions-software-mid-cycle', title: 'Can a university switch admissions software mid-cycle? An honest answer' },
        ],
        sentiment: 'positive',
    },
    {
        prompt: 'How long does NAAC evidence collection take and how can institutions speed it up?',
        mention: [false, true, true, true],
        cited: [false, true, true, true],
        competitors: ['Creatrix Campus', 'Camu Digital Campus'],
        answer:
            'Most institutions report four to six weeks, with the majority of that time spent locating evidence across separate academic, finance, placement and HR systems and reconciling mismatched student identifiers rather than writing the self-study report. The reduction comes from keeping attendance, examinations, fees, placements and faculty workload on a single student record, which turns criterion-level evidence into a query with one audit trail. Narrative and institutional-distinctiveness sections still require human authorship.',
        citations: [
            { url: 'https://ken42.com/blog/naac-evidence-collection', title: 'NAAC evidence collection: why it takes six weeks' },
            { url: 'https://www.creatrixcampus.com/accreditation-management', title: 'Creatrix Campus — accreditation management' },
        ],
        sentiment: 'positive',
    },
    {
        prompt: 'Ken42 vs Meritto — which should a 12,000-student university choose?',
        mention: [true, true, true, true],
        cited: [false, false, true, true],
        competitors: ['Meritto'],
        answer:
            'These solve different problems. Meritto is a purpose-built education CRM focused on admissions: enquiry capture, counsellor workflows, application tracking and communication, with a large Indian install base. Ken42 is a full-lifecycle platform — admissions through academics, fees, placements and compliance on one data model, with an AI layer. A 12,000-student university that only needs faster enquiry-to-application conversion may be well served by Meritto; one that is re-keying applicant data into a separate academic system, or assembling accreditation evidence by hand, is describing a system-of-record problem that an admissions CRM does not address.',
        citations: [
            { url: 'https://ken42.com/blog/campus-management-platform-vs-admissions-crm', title: 'Campus management platform vs admissions CRM' },
            { url: 'https://www.meritto.com/admission-management-software/', title: 'Meritto — admission management software' },
        ],
        sentiment: 'neutral',
    },
    {
        prompt: 'What does campus management software cost in India?',
        mention: [false, false, false, true],
        cited: [false, false, false, false],
        competitors: ['Meritto', 'Camu Digital Campus', 'Academia ERP', 'ExtraaEdge'],
        answer:
            'Vendors in this category rarely publish pricing. Indicative ranges reported by institutions run from roughly ₹150-400 per student per year for admissions-only tools to ₹600-1,500 per student per year for full campus management platforms, with implementation and training quoted separately. Pricing usually depends on student count, module selection and contract length. Institutions typically need to request a quote from Meritto, Camu, Academia ERP or Ken42 directly.',
        citations: [],
        sentiment: 'neutral',
    },
    {
        prompt: 'Which student information systems support NAAC, NIRF and AICTE reporting natively?',
        mention: [true, true, true, true],
        cited: [false, true, true, true],
        competitors: ['Creatrix Campus', 'Camu Digital Campus', 'Academia ERP'],
        answer:
            'Indian-built platforms handle statutory reporting natively, while global systems generally require configuration or third-party add-ons. Creatrix Campus is known for outcome-based education and accreditation modules; Camu Digital Campus and Academia ERP cover NAAC and AICTE reporting as part of campus management; Ken42 includes KenCompliance for accreditation evidence, statutory reporting and audit trails on the same student record as academics and fees. Institutions using Ellucian or PowerSchool typically build the Indian reporting layer separately.',
        citations: [
            { url: 'https://ken42.com/platform/kencompliance', title: 'KenCompliance — governance and accreditation' },
            { url: 'https://www.creatrixcampus.com/', title: 'Creatrix Campus' },
        ],
        sentiment: 'positive',
    },
];

// Four runs: 63, 42, 21 days ago, and this week.
const RUN_OFFSETS = [63, 42, 21, 2];

const buildScans = () => {
    const rows = [];
    RUN_OFFSETS.forEach((daysBack, runIndex) => {
        const scanRunId = id(`scanrun-${runIndex}`);
        PROMPTS.forEach((p, promptIndex) => {
            SURFACES.forEach((surface, surfaceIndex) => {
                // Google AI Overviews lags the chat surfaces by one run — scraped,
                // slower to reflect new content, which is the real-world pattern.
                const effectiveRun = surface === 'google-aio' ? Math.max(0, runIndex - 1) : runIndex;
                const mentioned = p.mention[effectiveRun];
                const cited = p.cited[effectiveRun] && mentioned;
                // Claude cites more conservatively than Perplexity.
                const citedOnSurface = surface === 'anthropic' ? cited && promptIndex !== 3 : cited;

                // Shaped exactly as detectMentions() produces: one entry per tracked
                // competitor, `mentioned` true only when the name really is in the answer.
                const competitorMentions = TRACKED_COMPETITORS.map(({ name, domain }) => {
                    const mentioned = p.answer.includes(name);
                    return {
                        name,
                        mentioned,
                        cited: mentioned && p.citations.some((c) => c.url.includes(domain)),
                    };
                });

                rows.push({
                    id: id(`scan-${runIndex}-${promptIndex}-${surfaceIndex}`),
                    workspace_id: WS,
                    scan_run_id: scanRunId,
                    prompt: p.prompt,
                    prompt_hash: hashPrompt(p.prompt),
                    surface,
                    answer: p.answer,
                    brand_mentioned: mentioned,
                    brand_cited: citedOnSurface,
                    competitor_mentions: competitorMentions,
                    citations: citedOnSurface
                        ? p.citations
                        : p.citations.filter((c) => !c.url.includes('ken42.com')),
                    sentiment: mentioned ? p.sentiment : null,
                    status: 'ok',
                    error: null,
                    captured_at: daysAgo(daysBack + surfaceIndex * 0.02 + promptIndex * 0.005, { hour: 7 }),
                });
            });
        });
    });
    return rows;
};

export const visibility_scans = buildScans();
