/**
 * ABM research — grounded account research with scored contacts.
 *
 * Institutions are fictional (see outreach.js). `why_grounding` and `sources`
 * carry the kind of citation trail the real grounded-research pipeline produces.
 */
import { id } from '../ids';
import { DEMO_WORKSPACE_ID } from './identity';
import { daysAgo } from './time';

const WS = DEMO_WORKSPACE_ID;

const account = (key, fields) => ({
    id: id(`abm-${key}`),
    workspace_id: WS,
    ...fields,
});

export const abm_accounts = [
    account('anantara', {
        company_name: 'Anantara University',
        domain: 'anantara.edu.in',
        tier: 'Tier 1',
        icp_fit: 'high',
        employee_size: '1,001-5,000',
        revenue: '₹380-450 Cr annual fee revenue (est.)',
        tech_signals: ['Meritto (admissions CRM)', 'Legacy in-house SIS', 'Tally (finance)', 'Google Workspace', 'Razorpay fee gateway'],
        why_grounding:
            'Announced two new schools (Design, Public Health) for the 2027 intake, which raises applicant volume against an admissions team that publicly described counsellor workload as its constraint. Runs Meritto for admissions but an in-house SIS for academics — the exact handover gap KenRoll closes. NAAC cycle due within 14 months, and the registrar has spoken publicly about manual evidence collection.',
        recommended_channel: 'Email to the registrar first, then a platform-level LinkedIn touch to the CIO and VC in the same week',
        sources: [
            { title: 'Anantara University — two new schools for 2027 intake', url: 'https://anantara.edu.in/newsroom/new-schools-2027', capturedAt: daysAgo(30) },
            { title: 'AIU admissions panel — counsellor workload remarks', url: 'https://example-highered-news.in/aiu-panel-2026', capturedAt: daysAgo(30) },
            { title: 'NAAC accreditation status registry', url: 'https://example-naac-registry.in/anantara', capturedAt: daysAgo(30) },
        ],
        status: 'saved',
        meta: {
            researchBrief:
                'Anantara is the strongest Tier-1 fit in the current set. Three signals line up: expanding programme count (volume pressure), a split admissions/academic stack (handover pain), and an accreditation cycle inside 14 months (trigger event with a deadline).\n\nThe buying committee is unusually visible. The registrar, Meera Krishnan, is the operational owner and has described the re-keying problem in public. Sundar Iyer as CIO is the integration gatekeeper and will ask about the in-house SIS migration path — expect that to be the technical crux, since a home-grown system has no vendor to coordinate with. Ramesh Gowda as VC carries the growth mandate the new schools imply.\n\nEntry strategy: lead with cycle time to the registrar, not with platform consolidation. The consolidation argument is the CIO conversation and lands better once the registrar has named the handover as the problem. Do not lead with NAAC — it is a real trigger but the IQAC coordinator is not yet identified, and pitching compliance before operations makes this look like a reporting tool.\n\nRisk: the in-house SIS is somebody\'s career artefact. Expect institutional attachment and position Ken42 as replacing the fragmentation, not their work.',
        },
        created_at: daysAgo(30),
        updated_at: daysAgo(29),
    }),
    account('vidyapeeth', {
        company_name: 'Vidyapeeth Education Group',
        domain: 'vidyapeethgroup.edu.in',
        tier: 'Tier 1',
        icp_fit: 'high',
        employee_size: '5,001-10,000',
        revenue: '₹900 Cr-1,100 Cr group fee revenue (est.)',
        tech_signals: ['Academia ERP (2018 version, one campus)', 'LeadSquared', 'SAP (group finance)', 'Microsoft 365', 'Multiple campus-level spreadsheets'],
        why_grounding:
            'Seven campuses with three distinct fee structures and at least one campus on an unsupported 2018 ERP version. A group-level vendor-consolidation mandate was communicated last month, which is the strongest possible buying signal for a platform play. The group CFO is a named stakeholder because fee reconciliation runs across campuses.',
        recommended_channel: 'CIO-first technical track — documentation and a sandbox tenant, with the group CFO looped in on the fee-consolidation argument',
        sources: [
            { title: 'Vidyapeeth Group — vendor consolidation mandate', url: 'https://vidyapeethgroup.edu.in/announcements/it-consolidation', capturedAt: daysAgo(27) },
            { title: 'Academia ERP version support matrix', url: 'https://www.academiaerp.com/support-lifecycle', capturedAt: daysAgo(27) },
        ],
        status: 'saved',
        meta: {
            researchBrief:
                'The largest opportunity in the set and the one most likely to close on architecture rather than on features. A consolidation mandate already exists, so the question is not whether they will replace something — it is whether Ken42 or an incumbent expansion wins the group standard.\n\nFarhan Qureshi (Head of IT — Campus Systems) has already engaged and set the bar explicitly: seven campuses, three fee structures, one unsupported ERP. That is a test, not an objection. The winning response is a phased campus-by-campus migration plan with the 2018-ERP campus LAST, not first — leading with the hardest campus is how vendors lose credibility here.\n\nSuresh Patel as group CFO is the second seat. Fee reconciliation across seven campuses with three structures is a KenFin argument that stands on its own, and the CFO can fund a group deal the individual campuses cannot.\n\nRisk: group deals stall in committee. Push for a single-campus pilot with group-standard intent rather than a seven-campus decision.',
        },
        created_at: daysAgo(27),
        updated_at: daysAgo(26),
    }),
    account('sanjeevani', {
        company_name: 'Sanjeevani University',
        domain: 'sanjeevaniuniv.edu.in',
        tier: 'Tier 1',
        icp_fit: 'high',
        employee_size: '1,001-5,000',
        revenue: '₹410 Cr annual fee revenue (est.)',
        tech_signals: ['Camu Digital Campus', 'Zoho CRM', 'Custom fee portal', 'AWS Mumbai'],
        why_grounding:
            'Already on Camu, which means the "one system" argument has been made and accepted — the displacement conversation is about the AI layer and accreditation depth, not consolidation. NAAC re-accreditation submission is inside nine months and the IQAC coordinator is identifiable and active.',
        recommended_channel: 'IQAC-first via the accreditation sequence, with the registrar as the second seat',
        sources: [
            { title: 'Sanjeevani University — IQAC annual report', url: 'https://sanjeevaniuniv.edu.in/iqac/annual-report', capturedAt: daysAgo(19) },
            { title: 'Camu customer showcase', url: 'https://camudigitalcampus.com/customers', capturedAt: daysAgo(19) },
        ],
        status: 'saved',
        meta: {
            researchBrief:
                'A displacement, not a greenfield. Sanjeevani bought the consolidation story already — from Camu — so repeating it wastes the first call. The wedge is depth: accreditation evidence with a real audit trail, and the AI layer that answers criterion-level questions instead of exporting to a spreadsheet.\n\nKavita Joshi (IQAC Coordinator) is the highest-intent contact because her deadline is nine months out and her pain is annual. Neha Bhatt as registrar is the budget path but will not initiate.\n\nEntry: accreditation sequence to Kavita, then a joint session with the registrar. Expect a direct Camu comparison request — have the honest version ready, including what Camu does well. A dishonest comparison loses this account permanently, because they already know the product.',
        },
        created_at: daysAgo(19),
        updated_at: daysAgo(18),
    }),
    account('himgiri', {
        company_name: 'Himgiri University Group',
        domain: 'himgirigroup.edu.in',
        tier: 'Tier 1',
        icp_fit: 'medium',
        employee_size: '5,001-10,000',
        revenue: '₹1,200 Cr+ group fee revenue (est.)',
        tech_signals: ['Ellucian (two campuses)', 'Salesforce Education Cloud', 'Meritto', 'Workday'],
        why_grounding:
            'Nine campuses and the most mature existing stack in the set — Ellucian plus Salesforce Education Cloud means a board that already spent on "global standard" software. Fit is medium not high: the consolidation pain is real but switching costs and internal politics are the highest of any account here.',
        recommended_channel: 'Long-cycle CIO relationship; no urgency play. Be present for the Ellucian renewal.',
        sources: [
            { title: 'Himgiri Group — digital campus initiative', url: 'https://himgirigroup.edu.in/about/digital-campus', capturedAt: daysAgo(16) },
        ],
        status: 'saved',
        meta: {
            researchBrief:
                'Qualify carefully. The revenue is attractive and the fragmentation is real, but a board that approved Ellucian and Salesforce has already answered the "global standard" question, and an Indian challenger has to win on regulatory fit and cost of ownership rather than capability.\n\nThe honest read: this is a 12-18 month relationship, not a Q3 opportunity. Arjun Malhotra as CIO is the only sensible entry, and the only credible offer is documentation plus a narrow-scope pilot in an area Ellucian handles badly — most likely NAAC/AICTE evidence, where a US-built SIS has no native model.\n\nDo not run the standard sequence here. Reply rates on CXOs at this size are low and a generic touch burns the name.',
        },
        created_at: daysAgo(16),
        updated_at: daysAgo(16),
    }),
    account('kaveri', {
        company_name: 'Kaveri Global University',
        domain: 'kaveriglobal.edu.in',
        tier: 'Tier 2',
        icp_fit: 'high',
        employee_size: '501-1,000',
        revenue: '₹180-220 Cr annual fee revenue (est.)',
        tech_signals: ['ExtraaEdge', 'Spreadsheet-based academics', 'Tally', 'WhatsApp Business API'],
        why_grounding:
            'Runs a low-cost admissions CRM with genuinely spreadsheet-based academic operations — the highest raw pain-to-complexity ratio in the set. Small enough to decide in one cycle and to implement without a group committee.',
        recommended_channel: 'Registrar email sequence; expect price sensitivity, lead with time saved rather than platform breadth',
        sources: [
            { title: 'Kaveri Global University — administration page', url: 'https://kaveriglobal.edu.in/administration', capturedAt: daysAgo(14) },
        ],
        status: 'saved',
        meta: {
            researchBrief:
                'The fastest realistic close in the set. Tier 2, single campus, no incumbent platform to displace beyond a light CRM, and a registrar who is personally doing reconciliation work.\n\nPrice will be the objection, not capability. Lead with KenRoll plus KenFin only — a full-platform quote will read as unaffordable and end the conversation. Time-saved framing beats consolidation framing at this size, because there is no CIO to sell architecture to.\n\nLakshmi Venkatesh is the whole committee in practice, with the VC signing. Two seats, one cycle.',
        },
        created_at: daysAgo(14),
        updated_at: daysAgo(13),
    }),
    account('sarala', {
        company_name: 'Sarala Education Trust',
        domain: 'saralatrust.edu.in',
        tier: 'Tier 1',
        icp_fit: 'high',
        employee_size: '1,001-5,000',
        revenue: '₹540 Cr group fee revenue (est.)',
        tech_signals: ['In-house ERP', 'Meritto', 'Zoho Books', 'Azure'],
        why_grounding:
            'Four campuses on an in-house ERP that the trust maintains with a small internal team — high maintenance burden, no vendor support path, and a director of digital transformation whose mandate is explicitly consolidation. Already replied to outbound asking for a sandbox and security documentation.',
        recommended_channel: 'Technical track — sandbox tenant plus SSO/audit documentation, already in motion',
        sources: [
            { title: 'Sarala Education Trust — digital transformation charter', url: 'https://saralatrust.edu.in/digital-charter', capturedAt: daysAgo(12) },
        ],
        status: 'saved',
        meta: {
            researchBrief:
                'Warmest technical opportunity: Divya Nambiar replied to the first touch asking for the sandbox and security documentation, and explicitly removed timeline pressure ("ERP supported until next year").\n\nThat combination — engaged, technical, no urgency — means the deal is won or lost in the security review, not in a demo. Send documentation that survives a reviewer without a call, and let the sandbox do the selling.\n\nThe in-house ERP is the same institutional-attachment risk as Anantara, with the added factor that the maintaining team reports to the person evaluating us. Frame as relieving their team of maintenance, never as replacing their build.',
        },
        created_at: daysAgo(12),
        updated_at: daysAgo(3),
    }),
    account('coastal', {
        company_name: 'Coastal Institutes Consortium',
        domain: 'coastalconsortium.edu.in',
        tier: 'Tier 2',
        icp_fit: 'medium',
        employee_size: '501-1,000',
        revenue: '₹240 Cr consortium fee revenue (est.)',
        tech_signals: ['Creatrix Campus', 'Google Workspace', 'Manual placement tracking'],
        why_grounding:
            'Three institutions under a consortium with Creatrix already handling accreditation — so the compliance wedge is closed. Remaining gap is placements and the academic-to-finance handover. Medium fit: real pain, but a narrower entry point than the Tier 1 accounts.',
        recommended_channel: 'KenCareers-led conversation with the head of academic systems',
        sources: [
            { title: 'Coastal Institutes Consortium — placement reports', url: 'https://coastalconsortium.edu.in/placements', capturedAt: daysAgo(10) },
        ],
        status: 'researched',
        meta: {
            researchBrief:
                'Qualified but deliberately deprioritised. Creatrix owns the accreditation argument, which is our strongest wedge at this size, so we are left selling placements and a handover — a smaller cheque and a longer explanation.\n\nWorth keeping warm through content rather than sequence. If Creatrix renewal timing becomes visible, re-rank immediately.',
        },
        created_at: daysAgo(10),
        updated_at: daysAgo(10),
    }),
    account('varshini', {
        company_name: 'Varshini University',
        domain: 'varshini.edu.in',
        tier: 'Tier 1',
        icp_fit: 'high',
        employee_size: '1,001-5,000',
        revenue: '₹300-360 Cr annual fee revenue (est.)',
        tech_signals: ['Incumbent admissions CRM (November renewal)', 'Separate academic system', 'Custom fee portal'],
        why_grounding:
            'Admissions-CRM renewal falls in November, which is both the decision window and the only safe migration window. The director of admissions has already replied asking for indicative pricing for 12,000 students across KenRoll plus fees, and asked whether Ken42 can co-exist with the academic system for one cycle — a buying question, not an objection.',
        recommended_channel: 'Active deal — pricing plus a co-existence plan, with the Pro-VC as the second seat',
        sources: [
            { title: 'Varshini University — admissions portal footer (vendor attribution)', url: 'https://varshini.edu.in/admissions', capturedAt: daysAgo(21) },
        ],
        status: 'saved',
        meta: {
            researchBrief:
                'The nearest-term revenue in the set. Rahul Deshpande replied to touch 2 asking for pricing for 12,000 students (KenRoll + KenFin) and for a co-existence answer, and forwarded the migration guide internally to the CIO — meaning the internal case is already being built without us in the room.\n\nTwo things decide this: an indicative price that survives a procurement comparison against the incumbent renewal, and a written one-cycle co-existence plan. The co-existence question is the real one — they are asking permission to de-risk, and a clean parallel-run plan converts this.\n\nSunita Kulkarni (Pro-VC) is the second seat and the budget release. Bring her in only after pricing lands, with the growth framing rather than the operations framing.',
        },
        created_at: daysAgo(21),
        updated_at: daysAgo(1.3),
    }),
];

const contact = (key, accountKey, fields) => ({
    id: id(`abmc-${key}`),
    workspace_id: WS,
    account_id: id(`abm-${accountKey}`),
    source: 'apollo',
    external_id: `apollo_${id(`abmc-${key}`).slice(0, 12)}`,
    confidence: 'high',
    flags: [],
    prospect_id: null,
    meta: {},
    created_at: daysAgo(20),
    updated_at: daysAgo(20),
    phone: '',
    ...fields,
});

export const abm_contacts = [
    // Anantara
    contact('anantara-registrar', 'anantara', {
        first_name: 'Meera', last_name: 'Krishnan', title: 'Registrar', seniority_tier: 'decision_maker',
        company: 'Anantara University', email: 'meera.krishnan@anantara.edu.in', linkedin_url: 'https://www.linkedin.com/in/meera-krishnan-reg',
        fit_score: 94,
        fit_reasoning: 'Operational owner of the exact metric the campaign leads with, and has described the re-keying problem publicly. Recommends the purchase and defines the requirement.',
        recommended_channel: 'email', icp_relevance: 'Registrar / Director of Admissions — primary ICP',
        prospect_id: id('prospect-anantara-registrar'),
        created_at: daysAgo(30), updated_at: daysAgo(29),
    }),
    contact('anantara-cio', 'anantara', {
        first_name: 'Sundar', last_name: 'Iyer', title: 'Chief Information Officer', seniority_tier: 'gatekeeper',
        company: 'Anantara University', email: 'sundar.iyer@anantara.edu.in', linkedin_url: 'https://www.linkedin.com/in/sundar-iyer-cio',
        fit_score: 81,
        fit_reasoning: 'Owns the in-house SIS that Ken42 would absorb — can veto instantly, and the migration path for a home-grown system is the technical crux of this deal.',
        recommended_channel: 'linkedin', icp_relevance: 'CIO / Head of Digital Transformation — secondary ICP',
        prospect_id: id('prospect-anantara-cio'),
        created_at: daysAgo(30), updated_at: daysAgo(29),
    }),
    contact('anantara-vc', 'anantara', {
        first_name: 'Ramesh', last_name: 'Gowda', title: 'Vice-Chancellor', seniority_tier: 'economic_buyer',
        company: 'Anantara University', email: 'vc@anantara.edu.in', linkedin_url: 'https://www.linkedin.com/in/ramesh-gowda-vc',
        fit_score: 72,
        fit_reasoning: 'Economic buyer with a visible growth mandate (two new schools), but will delegate evaluation. Reach only after the registrar has named the problem.',
        recommended_channel: 'referral', icp_relevance: 'Vice-Chancellor / Pro-VC — economic buyer',
        confidence: 'medium', flags: ['generic_email'],
        prospect_id: id('prospect-anantara-vc'),
        created_at: daysAgo(30), updated_at: daysAgo(29),
    }),

    // Vidyapeeth
    contact('vidyapeeth-cio', 'vidyapeeth', {
        first_name: 'Farhan', last_name: 'Qureshi', title: 'Head of IT — Campus Systems', seniority_tier: 'decision_maker',
        company: 'Vidyapeeth Education Group', email: 'farhan.qureshi@vidyapeethgroup.edu.in', linkedin_url: 'https://www.linkedin.com/in/farhan-qureshi-it',
        fit_score: 96,
        fit_reasoning: 'Already engaged and set the technical bar himself. Holds the consolidation mandate that makes this a live evaluation rather than a cold pitch.',
        recommended_channel: 'email', icp_relevance: 'CIO / Head of Digital Transformation — primary ICP for the consolidation track',
        prospect_id: id('prospect-vidyapeeth-cio'),
        created_at: daysAgo(27), updated_at: daysAgo(8),
    }),
    contact('vidyapeeth-cfo', 'vidyapeeth', {
        first_name: 'Suresh', last_name: 'Patel', title: 'Group Chief Financial Officer', seniority_tier: 'economic_buyer',
        company: 'Vidyapeeth Education Group', email: 'suresh.patel@vidyapeethgroup.edu.in', linkedin_url: 'https://www.linkedin.com/in/suresh-patel-cfo',
        fit_score: 84,
        fit_reasoning: 'Three fee structures across seven campuses is a KenFin argument that stands alone, and he can fund a group standard the campuses cannot.',
        recommended_channel: 'email', icp_relevance: 'Finance buyer — matches the pending Group CFO ICP suggestion',
        prospect_id: id('prospect-vidyapeeth-cfo'),
        created_at: daysAgo(27), updated_at: daysAgo(26),
    }),

    // Sanjeevani
    contact('sanjeevani-iqac', 'sanjeevani', {
        first_name: 'Kavita', last_name: 'Joshi', title: 'IQAC Coordinator', seniority_tier: 'champion',
        company: 'Sanjeevani University', email: 'kavita.joshi@sanjeevaniuniv.edu.in', linkedin_url: 'https://www.linkedin.com/in/kavita-joshi-iqac',
        fit_score: 89,
        fit_reasoning: 'Nine-month accreditation deadline and annual, personally-felt pain. Highest-intent contact at this account even though she does not hold budget.',
        recommended_channel: 'email', icp_relevance: 'Accreditation owner — matches the pending IQAC persona',
        prospect_id: id('prospect-sanjeevani-iqac'),
        created_at: daysAgo(19), updated_at: daysAgo(18),
    }),
    contact('sanjeevani-registrar', 'sanjeevani', {
        first_name: 'Neha', last_name: 'Bhatt', title: 'Registrar', seniority_tier: 'decision_maker',
        company: 'Sanjeevani University', email: 'neha.bhatt@sanjeevaniuniv.edu.in', linkedin_url: 'https://www.linkedin.com/in/neha-bhatt-registrar',
        fit_score: 76,
        fit_reasoning: 'Budget path, but already runs Camu — will not initiate a displacement. Bring in once the IQAC gap is established.',
        recommended_channel: 'email', icp_relevance: 'Registrar / Director of Admissions — primary ICP',
        prospect_id: id('prospect-sanjeevani-registrar'),
        created_at: daysAgo(19), updated_at: daysAgo(18),
    }),

    // Sarala
    contact('sarala-cio', 'sarala', {
        first_name: 'Divya', last_name: 'Nambiar', title: 'Director — Digital Transformation', seniority_tier: 'decision_maker',
        company: 'Sarala Education Trust', email: 'divya.nambiar@saralatrust.edu.in', linkedin_url: 'https://www.linkedin.com/in/divya-nambiar-dt',
        fit_score: 92,
        fit_reasoning: 'Replied to the first touch requesting a sandbox and security documentation. Mandate is explicitly consolidation, and she controls the evaluation.',
        recommended_channel: 'email', icp_relevance: 'CIO / Head of Digital Transformation — primary ICP',
        prospect_id: id('prospect-sarala-cio'),
        created_at: daysAgo(12), updated_at: daysAgo(3),
    }),

    // Varshini
    contact('varshini-admissions', 'varshini', {
        first_name: 'Rahul', last_name: 'Deshpande', title: 'Director of Admissions', seniority_tier: 'decision_maker',
        company: 'Varshini University', email: 'rahul.deshpande@varshini.edu.in', linkedin_url: 'https://www.linkedin.com/in/rahul-deshpande-adm',
        fit_score: 95,
        fit_reasoning: 'Asked for pricing unprompted and forwarded the migration guide to the CIO — the internal case is already being built. November renewal gives a real decision date.',
        recommended_channel: 'email', icp_relevance: 'Registrar / Director of Admissions — primary ICP',
        prospect_id: id('prospect-varshini-admissions'),
        created_at: daysAgo(21), updated_at: daysAgo(1.3),
    }),
    contact('varshini-provc', 'varshini', {
        first_name: 'Sunita', last_name: 'Kulkarni', title: 'Pro Vice-Chancellor', seniority_tier: 'economic_buyer',
        company: 'Varshini University', email: 'sunita.kulkarni@varshini.edu.in', linkedin_url: 'https://www.linkedin.com/in/sunita-kulkarni-provc',
        fit_score: 70,
        fit_reasoning: 'Releases budget once pricing lands. Growth framing, not operations framing.',
        recommended_channel: 'referral', icp_relevance: 'Vice-Chancellor / Pro-VC — economic buyer',
        prospect_id: id('prospect-varshini-provc'),
        created_at: daysAgo(21), updated_at: daysAgo(20),
    }),

    // Kaveri
    contact('kaveri-registrar', 'kaveri', {
        first_name: 'Lakshmi', last_name: 'Venkatesh', title: 'Registrar', seniority_tier: 'decision_maker',
        company: 'Kaveri Global University', email: 'lakshmi.venkatesh@kaveriglobal.edu.in', linkedin_url: 'https://www.linkedin.com/in/lakshmi-venkatesh-reg',
        fit_score: 88,
        fit_reasoning: 'Effectively the entire committee at a single-campus Tier 2 institution, and personally doing the reconciliation work KenRoll removes.',
        recommended_channel: 'email', icp_relevance: 'Registrar / Director of Admissions — primary ICP',
        prospect_id: id('prospect-kaveri-registrar'),
        created_at: daysAgo(14), updated_at: daysAgo(13),
    }),
    contact('kaveri-vc', 'kaveri', {
        first_name: 'Balaji', last_name: 'Subramanian', title: 'Vice-Chancellor', seniority_tier: 'economic_buyer',
        company: 'Kaveri Global University', email: 'balaji.subramanian@kaveriglobal.edu.in', linkedin_url: 'https://www.linkedin.com/in/balaji-subramanian-vc',
        fit_score: 68,
        fit_reasoning: 'Signs, but delegates entirely. Price-sensitive institution — keep the quote narrow.',
        recommended_channel: 'referral', icp_relevance: 'Vice-Chancellor / Pro-VC — economic buyer',
        confidence: 'medium',
        prospect_id: id('prospect-kaveri-vc'),
        created_at: daysAgo(14), updated_at: daysAgo(13),
    }),

    // Himgiri
    contact('himgiri-cio', 'himgiri', {
        first_name: 'Arjun', last_name: 'Malhotra', title: 'Chief Information Officer', seniority_tier: 'decision_maker',
        company: 'Himgiri University Group', email: 'arjun.malhotra@himgirigroup.edu.in', linkedin_url: 'https://www.linkedin.com/in/arjun-malhotra-cio',
        fit_score: 64,
        fit_reasoning: 'Only sensible entry at a nine-campus group already committed to Ellucian and Salesforce. A 12-18 month relationship, not a Q3 opportunity.',
        recommended_channel: 'linkedin', icp_relevance: 'CIO / Head of Digital Transformation — secondary ICP',
        prospect_id: id('prospect-himgiri-cio'),
        created_at: daysAgo(16), updated_at: daysAgo(16),
    }),

    // Coastal
    contact('coastal-it', 'coastal', {
        first_name: 'Pooja', last_name: 'Reddy', title: 'Head of Academic Systems', seniority_tier: 'champion',
        company: 'Coastal Institutes Consortium', email: 'pooja.reddy@coastalconsortium.edu.in', linkedin_url: 'https://www.linkedin.com/in/pooja-reddy-as',
        fit_score: 61,
        fit_reasoning: 'Feels the placement and handover gap, but Creatrix already owns the accreditation wedge. Keep warm through content.',
        recommended_channel: 'email', icp_relevance: 'CIO track — narrow entry via KenCareers',
        confidence: 'medium',
        prospect_id: id('prospect-coastal-it'),
        created_at: daysAgo(10), updated_at: daysAgo(10),
    }),
];
