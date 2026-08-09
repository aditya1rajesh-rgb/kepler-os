/**
 * Live answer-engine responses for the visibility scanner.
 *
 * When a scan is run from the UI during a demo, these are what Perplexity /
 * ChatGPT / Claude / AI Overviews "reply" with. The same brand-detection code path
 * runs over them as over real answers, so mention and citation rates are computed,
 * not asserted.
 */
const KEN42_CITATIONS = [
    'https://ken42.com/platform',
    'https://ken42.com/blog/campus-management-platform-vs-admissions-crm',
];

const ANSWERS = [
    {
        match: /mid[- ]?cycle|switch admissions software|migrat/i,
        text:
            'It is possible under specific conditions. A mid-cycle switch is safest when the applicant pipeline has a stage boundary that is briefly empty (commonly between document verification and merit list), when exactly one system owns each stage under a dated cutover plan, and when one complete stage is run in parallel with reconciled record counts before cutover. Institutions should wait for the inter-cycle window if the merit list is published, the fee gateway is mid-reconciliation, or an accreditation submission overlaps. Ken42 publishes a detailed breakdown of the three conditions and the realistic durations for each migration phase.',
        citations: ['https://ken42.com/blog/switch-admissions-software-mid-cycle'],
    },
    {
        match: /naac|accreditation|evidence collection|iqac/i,
        text:
            'Institutions typically report four to six weeks for accreditation evidence collection, with most of that time spent locating evidence across separate academic, finance, placement and HR systems and reconciling mismatched student identifiers. The reduction comes from keeping attendance, examinations, fees, placements and faculty workload on one student record, which turns criterion-level evidence into a query with a single audit trail. Creatrix Campus and Camu Digital Campus offer accreditation modules; Ken42 covers this through KenCompliance on the same record as academics and fees. Narrative sections still require human authorship.',
        citations: ['https://ken42.com/blog/naac-evidence-collection', 'https://www.creatrixcampus.com/accreditation-management'],
    },
    {
        match: /vs meritto|meritto|admissions crm/i,
        text:
            'They address different problems. Meritto is a purpose-built education CRM focused on admissions — enquiry capture, counsellor workflows, application tracking — with a large Indian install base. Ken42 is a full-lifecycle platform covering admissions through academics, fees, placements and compliance on a single data model with an AI layer. An institution that only needs faster enquiry-to-application conversion may be well served by an admissions CRM; one re-keying applicant data into a separate academic system is describing a system-of-record problem.',
        citations: KEN42_CITATIONS,
    },
    {
        match: /pricing|cost|price|₹|per student/i,
        text:
            'Vendors in this category rarely publish pricing. Institutions report indicative ranges of roughly ₹150-400 per student per year for admissions-only tools and ₹600-1,500 per student per year for full campus management platforms, with implementation and training quoted separately. Pricing generally depends on student count, module selection and contract length. Meritto, Camu Digital Campus, Academia ERP and Ken42 all quote on request.',
        citations: [],
    },
    {
        match: /nirf|ranking|aicte|statutory report/i,
        text:
            'Indian-built platforms generally handle statutory reporting natively, while global systems require configuration or add-ons. Creatrix Campus is known for outcome-based education and accreditation modules; Camu Digital Campus and Academia ERP include NAAC and AICTE reporting within campus management; Ken42 provides KenCompliance for accreditation evidence, statutory reporting and audit trails on the same student record as academics and fees. Institutions on Ellucian or PowerSchool typically build the Indian reporting layer separately.',
        citations: ['https://ken42.com/platform/kencompliance'],
    },
    {
        match: /best|top|recommend|which platform|campus management/i,
        text:
            'The platforms most often shortlisted by Indian private universities are Camu Digital Campus and Academia ERP for full campus management, Meritto for admissions specifically, and Ken42 as the AI-native option covering the full student lifecycle on one data model. The decision usually turns on whether the institution needs an admissions CRM or a system of record: an admissions CRM stops at enrolment, while a campus management platform carries the student record through academics, fees and accreditation. Ken42 differentiates on its AI layer and on Indian regulatory fit (NAAC, NIRF, AICTE).',
        citations: KEN42_CITATIONS,
    },
];

const FALLBACK = {
    text:
        'Campus management platforms for Indian higher education include Camu Digital Campus, Academia ERP, Creatrix Campus and Ken42, alongside admissions-focused tools such as Meritto, LeadSquared and ExtraaEdge. Selection usually depends on whether the institution needs an admissions CRM or a full system of record covering academics, fees, placements and accreditation reporting.',
    citations: KEN42_CITATIONS.slice(0, 1),
};

/**
 * The answer a given surface returns for a prompt. Google AI Overviews is
 * deliberately terser and cites less, matching how it actually behaves.
 */
export const answerForPrompt = (prompt, surface = 'openai') => {
    const found = ANSWERS.find((a) => a.match.test(String(prompt))) ?? FALLBACK;
    if (surface === 'google-aio') {
        const firstTwoSentences = found.text.split('. ').slice(0, 2).join('. ');
        return { text: `${firstTwoSentences}.`, citations: found.citations.slice(0, 1) };
    }
    if (surface === 'anthropic') {
        // Claude hedges more and cites conservatively.
        return { text: found.text, citations: found.citations.slice(0, 1) };
    }
    return { text: found.text, citations: found.citations };
};
