/**
 * The demo's answer to `callAI()`.
 *
 * Two layers:
 *
 * 1. CURATED handlers for the generators a demo actually exercises — keyword
 *    research, the three-step blog pipeline, ad variants, LinkedIn targeting,
 *    social posts and calendars, outreach sequences, ABM research, campaign
 *    strategy. These return hand-written Ken42 output, so what appears on screen
 *    reads like the real thing.
 *
 * 2. A GENERIC filler for everything else. Kepler's prompts all embed a literal
 *    JSON skeleton ("Return JSON only: {...}") whose placeholder strings describe
 *    the value wanted. The filler parses that skeleton and synthesises a valid,
 *    on-topic object — so an un-curated generator still succeeds instead of
 *    throwing a parse error mid-demo.
 *
 * Nothing here reaches a model. Output is deterministic per prompt.
 */
import { DEMO_AI_LATENCY_MS, sleep } from './flag';
import { KEYWORD_METRICS } from './dataset/keywordMetrics';
import { APOLLO_PEOPLE } from './dataset/apollo';

// ── Shared Ken42 language bank ───────────────────────────────────────────────

const BRAND = {
    name: 'Ken42',
    domain: 'ken42.com',
    category: 'campus management platform',
    claim: '30-50% less manual administrative effort',
    proof: 'application-to-offer time cut from 21 days to 9 at a 14,000-student university',
    audience: 'registrars, CIOs and vice-chancellors at Indian private universities',
};

const SENTENCES = [
    'Most campuses run six to nine disconnected systems, and the gaps between them are where staff time disappears.',
    'An admissions CRM manages a funnel; a campus platform manages a record. Institutions that confuse the two pay for the same capability twice.',
    'The handover between admissions and academics is where a 21-day cycle comes from, not slow counsellors.',
    'Accreditation evidence is not a documentation problem. It is a data-residency problem, and it recurs every cycle.',
    'Registrars are measured on enrolment but rarely control the systems that produce it.',
    'When attendance, fees, placements and faculty workload sit on one student record, criterion-level evidence becomes a query rather than an expedition.',
    'A single data model is what makes an AI layer trustworthy — bolt AI onto four integrated systems and you get four confident answers.',
    'Migration risk is a one-time cost; the status quo is a recurring one.',
    'Built for Indian regulatory reality rather than retrofitted from a US student system.',
    'The unglamorous feature that decides accreditation conversations is a defensible audit trail.',
];

const QUESTIONS = [
    'What is the difference between a campus management platform and an admissions CRM?',
    'Can a university switch admissions software mid-cycle?',
    'How long does NAAC evidence collection take?',
    'What does campus management software cost in India?',
    'Which systems support NAAC, NIRF and AICTE reporting natively?',
    'How do institutions reduce admissions cycle time?',
];

const ANSWERS = [
    'An admissions CRM manages the enquiry-to-offer funnel and stops at enrolment. A campus management platform carries the student record onward through academics, fees, placements and accreditation on one data model.',
    'Yes, under three conditions: a stage boundary where the pipeline is briefly empty, exactly one system owning each stage on a dated plan, and a parallel run of one complete stage with reconciled counts before cutover.',
    'Institutions typically report four to six weeks, with most of it spent locating evidence across separate systems and reconciling mismatched student identifiers rather than writing the report.',
    'Vendors rarely publish pricing. Institutions report roughly ₹150-400 per student per year for admissions-only tools and ₹600-1,500 for full campus platforms, with implementation quoted separately.',
    'Indian-built platforms handle statutory reporting natively; global systems generally need configuration or add-ons. Ken42 covers this through KenCompliance on the same record as academics and fees.',
    'By removing the re-keying between the admissions tool and the academic office. One university reduced application-to-offer from 21 days to 9 without adding counsellors.',
];

const TITLES = [
    'Campus management platform vs admissions CRM: which do you need?',
    'NAAC evidence collection: where the six weeks actually go',
    'Switching admissions software mid-cycle: the honest answer',
    'Nine systems, one student record: the case for consolidation',
    'What campus management software really costs in India',
    'The admissions handover that costs you candidates',
];

const pick = (arr, i) => arr[Math.abs(i) % arr.length];

/** Pull a JSON array out of a prompt with `re`, or [] when it is absent/malformed. */
const parseArrayFrom = (text, re) => {
    try {
        const parsed = JSON.parse(re.exec(text)?.[1] ?? '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

/** Acronyms that must stay upper-case when a keyword becomes prose or a title. */
const ACRONYMS = ['naac', 'nirf', 'aicte', 'ugc', 'crm', 'erp', 'sis', 'iqac', 'seo', 'aeo', 'ai', 'api', 'sso', 'dpdp'];

/** "nirf 2026 parameters" → "NIRF 2026 parameters" (readable, not Title Case soup). */
const humanizeKeyword = (keyword) =>
    String(keyword ?? '')
        .split(/\s+/)
        .map((w) => (ACRONYMS.includes(w.toLowerCase()) ? w.toUpperCase() : w))
        .join(' ');

/** Sentence-case a keyword for use as a headline. */
const asTitle = (keyword) => {
    const s = humanizeKeyword(keyword);
    return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Deterministic small integer from a string — keeps demo output stable per prompt. */
const hash = (s) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < String(s).length; i += 1) {
        h ^= String(s).charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
};

// ── Generic JSON-skeleton filler ─────────────────────────────────────────────

/** Extract the literal JSON skeleton a Kepler prompt asks the model to fill. */
const extractSkeleton = (prompt) => {
    const marker = /Return\s+JSON\s+(?:only|object)?\s*:?/i;
    const match = marker.exec(prompt);
    const from = match ? match.index + match[0].length : prompt.indexOf('{');
    if (from < 0) return null;

    const start = prompt.indexOf('{', from);
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    for (let i = start; i < prompt.length; i += 1) {
        const ch = prompt[i];
        if (ch === '"' && prompt[i - 1] !== '\\') inString = !inString;
        if (inString) continue;
        if (ch === '{') depth += 1;
        if (ch === '}') {
            depth -= 1;
            if (depth === 0) return prompt.slice(start, i + 1);
        }
    }
    return null;
};

/**
 * Skeletons are illustrative, not valid JSON (trailing prose, `"..."` items, bare
 * numbers as placeholders). Parse leniently: strip comments, quote-normalise, and
 * fall back to null so the caller can bail to a simple object.
 */
const parseSkeleton = (raw) => {
    try {
        return JSON.parse(raw);
    } catch {
        try {
            return JSON.parse(raw.replace(/,(\s*[}\]])/g, '$1').replace(/'/g, '"'));
        } catch {
            return null;
        }
    }
};

const SCORE_KEYS = /score|overall|rating|confidence|readiness|grade/i;

/** Turn one placeholder string into a plausible value. */
const fillString = (placeholder, key, seed) => {
    const text = String(placeholder ?? '');
    const lower = `${key} ${text}`.toLowerCase();

    // "informational | navigational | commercial" → pick the first option.
    if (text.includes(' | ')) return text.split('|')[0].trim();
    if (/^\d+$/.test(text.trim())) return Number(text.trim());
    if (text.trim() === '...' || text.trim() === '') {
        return pick(SENTENCES, seed).slice(0, 90);
    }

    if (/\burl\b|link|href/.test(lower)) return `https://${BRAND.domain}/platform`;
    if (/\bhex\b|colour|color/.test(lower) && /#/.test(text)) return '#4f39c9';
    if (/question|^q$/.test(lower)) return pick(QUESTIONS, seed);
    if (/answer|^a$/.test(lower)) return pick(ANSWERS, seed);
    if (/title|headline|hook|h2|heading|name|pillar/.test(lower)) return pick(TITLES, seed);
    if (/summary|overview|rationale|why|reason|insight|takeaway|detail|description|brief|purpose|goal|note|recommendation|body|copy|text|point/.test(lower)) {
        return pick(SENTENCES, seed);
    }
    if (/keyword|term|query/.test(lower)) return pick(Object.keys(KEYWORD_METRICS), seed);
    if (/cta|call to action/.test(lower)) return 'Book a 20-minute walkthrough';
    if (/date/.test(lower)) return new Date(Date.now() + (seed % 21) * 86_400_000).toISOString().slice(0, 10);
    if (/tag|hashtag/.test(lower)) return pick(['#HigherEducation', '#EdTech', '#Admissions', '#NAAC', '#CampusOperations'], seed);
    if (/channel|platform/.test(lower)) return 'linkedin';
    if (/status/.test(lower)) return 'estimated';

    // Default: treat the placeholder as a description of the sentence wanted.
    return pick(SENTENCES, seed);
};

const fillValue = (node, key, seed, depth = 0) => {
    if (node === null) return null;
    if (typeof node === 'boolean') return true;
    if (typeof node === 'number') {
        if (SCORE_KEYS.test(key)) return 72 + (seed % 21);
        if (/count|words/i.test(key)) return 1200 + (seed % 600);
        return node === 0 ? 78 + (seed % 15) : node;
    }
    if (typeof node === 'string') return fillString(node, key, seed);

    if (Array.isArray(node)) {
        if (node.length === 0) return [];
        const count = depth === 0 ? 4 + (seed % 2) : 3;
        const template = node[0];
        return Array.from({ length: count }, (_, i) => fillValue(template, key, seed + i * 7, depth + 1));
    }

    if (typeof node === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(node)) {
            out[k] = fillValue(v, k, seed + hash(k) % 97, depth + 1);
        }
        return out;
    }

    return null;
};

const genericFill = (prompt) => {
    const raw = extractSkeleton(prompt);
    const skeleton = raw ? parseSkeleton(raw) : null;
    const seed = hash(prompt);
    if (!skeleton) {
        return { summary: pick(SENTENCES, seed), items: [pick(SENTENCES, seed + 1), pick(SENTENCES, seed + 2)] };
    }
    return fillValue(skeleton, 'root', seed, 0);
};

// ── Curated handlers ─────────────────────────────────────────────────────────

const keywordResearch = () => {
    const rows = [
        ['campus management software india', 'commercial', 'growth', 'Head term the whole category competes for — worth owning as the platform-level entry point.', 'comparison', 'comparison page'],
        ['best admissions software for universities', 'commercial', 'growth', 'High-intent shortlist query where an honest comparison beats a feature page.', 'list', 'comparison page'],
        ['ken42 vs meritto', 'transactional', 'quick_win', 'Buyers search this before the first call — own the narrative or a review site will.', 'comparison', 'comparison page'],
        ['campus management software pricing india', 'commercial', 'quick_win', 'Nobody in the category publishes ranges. Honest bands win the citation outright.', 'question', 'pricing explainer'],
        ['switch admissions software mid cycle', 'commercial', 'quick_win', 'The objection that kills deals before a demo. Answering it honestly is the cheapest trust available.', 'question', 'direct-answer guide'],
        ['naac evidence collection', 'informational', 'quick_win', 'Highest volume-to-difficulty ratio in the set, and it maps to a real trigger event.', 'question', 'how-to guide with FAQ schema'],
        ['nirf 2026 parameters', 'informational', 'quick_win', 'Seasonal spike term with a real reference table available from the uploaded weights file.', 'list', 'reference table'],
        ['student information system vs erp', 'informational', 'growth', 'CIO entry point, currently answered only by US-centric sources with no Indian context.', 'definition', 'definition + comparison'],
        ['university erp software', 'commercial', 'long_term', 'Competitive head term — target once the cluster has topical authority.', 'none', 'landing page'],
        ['fee management software for colleges', 'commercial', 'growth', 'KenFin entry point and the natural expansion path from admissions.', 'comparison', 'comparison page'],
        ['naac accreditation software', 'commercial', 'growth', 'Direct commercial intent against Creatrix, whose accreditation modules dominate this result.', 'list', 'comparison page'],
        ['whatsapp student communication compliance', 'informational', 'growth', 'DPDP-era question with no credible Indian answer published yet — KenMeet entry point.', 'question', 'compliance explainer'],
        ['how to reduce admissions cycle time', 'informational', 'quick_win', 'Maps directly to the registrar\'s personal metric and to a real case study.', 'how-to', 'how-to guide'],
        ['multi campus erp', 'commercial', 'growth', 'Group-level buyer term with low competition relative to its value.', 'definition', 'solution page'],
    ];

    return {
        executiveSummary:
            'The opportunity splits cleanly in two. Accreditation and NIRF terms are high-volume, low-difficulty and tied to a calendar trigger — those are the quick wins. The commercial shortlist terms (campus management software india, best admissions software, pricing) are where revenue sits but need the comparison and pricing pages published first. Buy-intent coverage is currently thin: eight of these fourteen terms are decision-stage and only two have an asset behind them.',
        keywords: rows.map(([term, intent, tier, rationale, geoType, format]) => {
            const m = KEYWORD_METRICS[term] ?? { volume: null, difficulty: null };
            return {
                term,
                intent,
                tier,
                volume: m.volume,
                difficulty: m.difficulty,
                metricStatus: m.volume ? 'measured' : 'estimated',
                rationale,
                geo: { isCandidate: geoType !== 'none', type: geoType, recommendedFormat: format },
            };
        }),
        clusters: [
            { pillar: 'Campus management platform (category)', clusterTerms: ['campus management software india', 'university erp software', 'multi campus erp', 'student information system vs erp'] },
            { pillar: 'Admissions operations', clusterTerms: ['best admissions software for universities', 'switch admissions software mid cycle', 'how to reduce admissions cycle time', 'ken42 vs meritto'] },
            { pillar: 'Accreditation and compliance', clusterTerms: ['naac evidence collection', 'naac accreditation software', 'nirf 2026 parameters'] },
            { pillar: 'Fees and student engagement', clusterTerms: ['fee management software for colleges', 'whatsapp student communication compliance'] },
        ],
        contentCalendar: [
            { month: 'Month 1', contentTitle: 'What campus management software actually costs in India', targetKeyword: 'campus management software pricing india', type: 'guide' },
            { month: 'Month 1', contentTitle: 'NIRF 2026 parameter weights: what you can still influence', targetKeyword: 'nirf 2026 parameters', type: 'blog' },
            { month: 'Month 2', contentTitle: 'Student information system vs ERP for multi-campus groups', targetKeyword: 'student information system vs erp', type: 'comparison' },
            { month: 'Month 2', contentTitle: 'Best admissions software for Indian universities: an honest shortlist', targetKeyword: 'best admissions software for universities', type: 'comparison' },
            { month: 'Month 3', contentTitle: 'Fee management for colleges: the reconciliation problem', targetKeyword: 'fee management software for colleges', type: 'guide' },
        ],
    };
};

const blogOutline = (prompt) => {
    const keyword = /Target keyword:\s*(.+)/i.exec(prompt)?.[1]?.trim() ?? 'campus management software india';
    const seed = hash(keyword);
    return {
        titleOptions: [
            `${asTitle(keyword)}: the honest guide for Indian institutions`,
            `What ${humanizeKeyword(keyword)} actually involves`,
            `${asTitle(keyword)} — a registrar's view`,
        ],
        metaDescription: `A direct, jargon-free guide to ${humanizeKeyword(keyword)} for Indian institutions — what it involves, what it costs in staff time, and when to wait. Written for registrars and CIOs.`,
        wordCount: 1500,
        sections: [
            { h2: 'The short answer', type: 'intro', keyPoints: [`Answer the ${humanizeKeyword(keyword)} question in the first 40 words`, 'Name who this is for'] },
            { h2: 'Why this question comes up now', type: 'concept', keyPoints: ['Renewal and accreditation calendars', 'The trigger events behind the search'] },
            { h2: 'What the fragmented stack actually costs', type: 'concept', keyPoints: ['Six to nine systems per campus', 'Where staff hours disappear', BRAND.claim] },
            { h2: 'How to evaluate it in practice', type: 'how-to', keyPoints: ['The three-people diagnostic', 'One source of truth per stage', 'What to ask a vendor'] },
            { h2: 'A worked example', type: 'example', keyPoints: [BRAND.proof, 'What changed operationally, not just in reporting'] },
            { h2: 'When to wait', type: 'comparison', keyPoints: ['Published merit list', 'Mid-reconciliation fee gateway', 'Overlapping accreditation window'] },
            { h2: 'What to take away', type: 'takeaways', keyPoints: ['The decision rule', 'The one number to measure'] },
        ],
        faq: [
            { q: pick(QUESTIONS, seed) },
            { q: pick(QUESTIONS, seed + 1) },
            { q: pick(QUESTIONS, seed + 2) },
        ],
        internalLinkZones: ['KenRoll admissions', 'KenCompliance accreditation', 'KenFin fees', 'Platform overview'],
    };
};

const blogDraft = (prompt) => {
    const keyword = /target keyword "([^"]+)"/i.exec(prompt)?.[1] ?? 'campus management software';
    const title = /Title:\s*(.+)/i.exec(prompt)?.[1]?.trim() ?? TITLES[0];

    const sections = parseArrayFrom(prompt, /Sections to cover:\s*(\[[\s\S]*?\])\s*\n/);
    const faq = parseArrayFrom(prompt, /FAQ to answer:\s*(\[[\s\S]*?\])\s*\n/);

    // Prose is assembled from complete paragraphs chosen by section TYPE, never by
    // echoing the outline's key points back as sentences — that reads as generated,
    // which is the one thing a demo of a content engine cannot afford.
    const bodyFor = (section, i) => {
        const type = String(section?.type ?? '').toLowerCase();
        const label = humanizeKeyword(keyword);
        const seed = hash(section?.h2 ?? String(i)) + i;

        if (type === 'intro' || i === 0) {
            return `The short version: ${pick(ANSWERS, seed)}\n\nThis is written for the people who own the problem rather than the software — registrars, CIOs and the IQAC coordinator who assembles the evidence. ${pick(SENTENCES, seed + 1)}`;
        }
        if (type === 'how-to') {
            return `${pick(SENTENCES, seed)}\n\n**1. Find the stage boundary.** Map where an applicant's record actually stops and starts. In most Indian institutions there is one clean break between document verification and merit list.\n\n**2. Give each stage one owner.** Not "both systems" — one, in writing, on a dated plan every counsellor has seen.\n\n**3. Run one stage twice.** Process a complete stage in both systems and reconcile the record counts before you cut over.\n\nIf a step cannot be completed on paper, it will not survive the intake. That is the useful part of the exercise.`;
        }
        if (type === 'example') {
            return `A 14,000-student private university in Karnataka consolidated three admissions tools ahead of its 2025 intake. Application-to-offer fell from 21 days to nine. Thirty-eight counsellors stopped re-keying applicant data. Document verification moved from four days to same-day.\n\nThe number leadership noticed was the cycle time. The number the registrar's office noticed was the three-week fee reconciliation at cycle close that simply did not happen, because the fee schedule and the merit list were reading the same record.`;
        }
        if (type === 'comparison') {
            return `${pick(SENTENCES, seed)}\n\nAn admissions CRM is the right purchase when:\n\n- Enquiry-to-application conversion is the named problem this cycle\n- Nobody is re-keying data into the academic system after enrolment\n- Counsellor routing and telephony are the daily bottleneck\n\nA full platform is the right purchase when:\n\n- Applicant data is re-entered downstream by hand\n- Fee mapping is reconciled manually at cycle close\n- Accreditation evidence takes weeks to assemble from four departments\n- Leadership cannot get enrolment, collection and placement in one view`;
        }
        if (type === 'takeaways') {
            return `If you take three things from this:\n\n- The funnel is rarely the expensive part. The handover after enrolment is.\n- Ask three colleagues how many systems an applicant touches before the first fee receipt. Disagreement is the diagnosis.\n- Migration risk is paid once. A fragmented stack is paid every cycle.\n\n${pick(SENTENCES, seed + 2)}`;
        }
        // concept / default — two substantive paragraphs plus a grounding line.
        return `${pick(SENTENCES, seed)}\n\nThat matters for ${label} specifically, because the cost never appears as a line item. It is spread across every department as "the way things are" — a counsellor re-entering an applicant, a finance assistant checking why two enrolment counts disagree, an IQAC coordinator rebuilding a number that already exists somewhere.\n\n${pick(SENTENCES, seed + 3)}`;
    };

    return {
        title,
        metaDescription: `A practical guide to ${humanizeKeyword(keyword)} for Indian institutions — what it involves, what it costs in staff time, and how to evaluate it without a six-month procurement cycle.`,
        tags: ['higher education', 'campus management', 'admissions', 'accreditation', 'india'],
        keyTakeaways: [
            'An admissions CRM manages a funnel; a campus platform manages a student record.',
            'The expensive part is rarely the funnel — it is the handover after enrolment.',
            'Ask three people how many systems an applicant touches. If the answers differ, the record is the problem.',
            'Migration risk is a one-time cost; a fragmented stack is a recurring one.',
        ],
        sections: (sections.length ? sections : blogOutline(prompt).sections).map((s, i) => ({
            h2: s.h2 ?? `Section ${i + 1}`,
            body: bodyFor(s, i),
        })),
        faq: (faq.length ? faq : blogOutline(prompt).faq).map((f, i) => ({
            q: f.q ?? pick(QUESTIONS, i),
            a: pick(ANSWERS, hash(f.q ?? '') + i),
        })),
    };
};

const blogReview = (prompt) => {
    const banned = /banned AI phrases found:\s*(.+)/i.exec(prompt)?.[1]?.trim() ?? 'none';
    const clean = banned === 'none';
    return {
        categoryScores: { content: clean ? 27 : 23, seo: 22, eeat: 13, technical: 14, aiCitation: 14 },
        overall: clean ? 90 : 86,
        issues: [
            ...(clean ? [] : [`Remove the flagged filler phrases (${banned}) — they read as generated.`]),
            'Two sections open with a claim but never give a concrete number; add the one you can defend.',
            'No named institution reference yet — the case-study numbers would carry more weight with an approved name.',
        ],
        strengths: [
            'Direct answer inside the first 40 words, which is what answer engines lift.',
            'Says plainly when NOT to act — the strongest trust signal in the draft.',
            'Extractable structure: a table and two qualifying lists.',
            'No fabricated statistics; every number traces to the uploaded case study.',
        ],
    };
};

const adVariants = (prompt) => {
    const isGoogle = /Platform:\s*Google/i.test(prompt);
    const base = [
        {
            angle: 'outcome', framework: 'PAS',
            headline: isGoogle ? 'Admissions Offers In 9 Days, Not 21' : '21 days to an offer. Your competitor answers in 9.',
            primaryText: isGoogle ? '' : 'Every day between application and offer is a day a candidate keeps looking. One 14,000-student university cut application-to-offer from 21 days to 9 by putting admissions, verification and fee mapping on one record.',
            description: 'One record from enquiry to enrolment.',
            cta: 'Book a walkthrough',
            rationale: 'Leads with the cycle-time number registrars are personally measured on.',
        },
        {
            angle: 'objection', framework: 'BAB',
            headline: isGoogle ? 'Switch Admissions Software Safely' : 'You can switch admissions software without risking the cycle',
            primaryText: isGoogle ? '' : '"We cannot migrate mid-cycle" is usually right — but there is a safe window. One stage boundary, one owner per stage, one parallel run. We wrote the honest version, including when to wait.',
            description: 'The three conditions for a safe migration.',
            cta: 'Read the guide',
            rationale: 'Answers the objection that kills deals before a demo and routes to the best-performing asset.',
        },
        {
            angle: 'authority', framework: 'social_proof',
            headline: isGoogle ? 'Nine Systems. One Data Model.' : 'Nine systems. One data model.',
            primaryText: isGoogle ? '' : `Most campuses run six to nine disconnected systems. Ken42 replaces the stack with one AI-native platform, and institutions report ${BRAND.claim}.`,
            description: 'The operating system for modern universities.',
            cta: 'See the platform',
            rationale: 'Platform-level claim for the CIO and VC seats on the same campaign.',
        },
        {
            angle: 'problem', framework: 'feature_benefit',
            headline: isGoogle ? 'NAAC Evidence Without The Scramble' : 'Your IQAC team spends six weeks locating evidence',
            primaryText: isGoogle ? '' : 'Attendance in one system, fees in another, placements in a spreadsheet. Six weeks of the accreditation cycle goes to locating and reconciling — not to writing the report.',
            description: 'Criterion-level evidence with an audit trail.',
            cta: 'See KenCompliance',
            rationale: 'Targets the accreditation trigger, which is the most reliable event in the category.',
        },
        {
            angle: 'urgency', framework: 'direct_response',
            headline: isGoogle ? 'Renewal Season Is The Safe Window' : 'Renewal season is the only safe time to change this',
            primaryText: isGoogle ? '' : 'Admissions CRM renewals land in November — also the only window where migration does not touch a live merit list. If you are renewing a tool that stops at enrolment, this is the conversation to have now.',
            description: 'Six-week implementation, inter-cycle.',
            cta: 'Talk to us',
            rationale: 'Ties urgency to a real procurement calendar rather than a manufactured deadline.',
        },
    ];
    const count = Number(/Generate (\d+) ad variants/i.exec(prompt)?.[1] ?? 5);
    return { variants: base.slice(0, Math.max(3, Math.min(count, base.length))) };
};

const linkedinTargeting = () => ({
    adjacentTitles: [
        { title: 'Registrar', seniority: 'Director', why: 'Primary buyer — owns the enrolment number and defines the requirement.' },
        { title: 'Director of Admissions', seniority: 'Director', why: 'Runs the counselling team that feels the re-keying daily.' },
        { title: 'Chief Information Officer', seniority: 'CXO', why: 'Technical veto on integration, SSO and data residency.' },
        { title: 'Vice-Chancellor', seniority: 'CXO', why: 'Economic buyer; releases budget against a growth or ranking mandate.' },
        { title: 'Finance Controller', seniority: 'Director', why: 'Owns fee reconciliation — the KenFin expansion path.' },
        { title: 'IQAC Coordinator', seniority: 'Manager', why: 'Feels accreditation evidence pain most acutely and champions internally.' },
        { title: 'Training & Placement Officer', seniority: 'Manager', why: 'KenCareers influencer with ranking-linked metrics.' },
        { title: 'Controller of Examinations', seniority: 'Director', why: 'Academic-operations stakeholder for KenLearn.' },
    ],
    jobFunctions: ['Education Administration', 'Information Technology', 'Operations', 'Finance'],
    exclusions: ['Students', 'Teaching assistants', 'K-12 school administrators', 'Coaching institute staff', 'Job seekers'],
    recommendedCombination:
        'Industry: Higher Education + Company size 201-5000 + Seniority Director/VP/CXO + Function: Education Administration or IT + Geography: India (Bengaluru, Pune, Hyderabad, Chennai, Delhi NCR)',
});

const SOCIAL_POSTS = [
    {
        formula: 'contrarian',
        hook: 'Your admissions CRM is not the problem. The handover is.',
        body: 'Your admissions CRM is not the problem. The handover is.\n\nEvery institution we talk to has fixed the funnel. Enquiries get routed, counsellors follow up, applications get tracked.\n\nThen the applicant enrols, and the data gets typed into a second system by hand.\n\nThat is where the 21-day cycle comes from. Not slow counsellors — a boundary between two systems that were never designed to speak.\n\nThe fix is not a better CRM. It is one record that survives enrolment.',
        hashtags: ['#HigherEducation', '#CampusOperations'],
        cta: 'How many systems does an applicant touch at your institution before the first fee receipt?',
    },
    {
        formula: 'stat-lead',
        hook: '30-50% of administrative effort at a typical campus is manual reconciliation between systems.',
        body: '30-50% of administrative effort at a typical campus is manual reconciliation between systems.\n\nNot teaching. Not student support. Not admissions strategy.\n\nCopying a number out of one system so it can be typed into another, then checking why the two disagree.\n\nThat is the budget line nobody puts in a business case, because it is spread across every department as "the way things are".',
        hashtags: ['#HigherEd', '#Operations'],
        cta: 'Where does that time go at your institution?',
    },
    {
        formula: 'list',
        hook: 'Three conditions for switching admissions software without wrecking your cycle:',
        body: 'Three conditions for switching admissions software without wrecking your cycle:\n\n1. A stage boundary you can freeze. Most Indian institutions have one between document verification and merit list.\n\n2. One source of truth per stage, in writing. Each stage owned by exactly one system on a dated plan.\n\n3. A parallel run of one complete stage, with reconciled record counts before cutover.\n\nIf all three hold, mid-cycle is survivable. If any one fails, wait for the inter-cycle window.',
        hashtags: ['#Admissions', '#EdTech'],
        cta: 'Registrars — which of these three is hardest at your institution?',
    },
    {
        formula: 'curiosity-gap',
        hook: 'We asked three people at the same university how many systems an applicant touches. We got three different answers.',
        body: 'We asked three people at the same university how many systems an applicant touches between enquiry and first fee receipt.\n\nThe registrar said four.\nThe CIO said seven.\nThe finance controller said "which fee?"\n\nNobody was wrong. They each see their own segment of a record that never travels intact.\n\nThat is the diagnostic. If the three answers disagree, the problem is not your funnel.',
        hashtags: ['#CampusManagement'],
        cta: 'Try it at your institution. Ask three people separately.',
    },
    {
        formula: 'time-anchor',
        hook: 'Six weeks. That is what one IQAC coordinator told me her last NAAC cycle cost her.',
        body: 'Six weeks. That is what one IQAC coordinator told me her last NAAC cycle cost her.\n\nNot writing the self-study report. Locating evidence.\n\nAttendance in one system. Fee receipts in another. Placements in a spreadsheet the training office owns. Faculty qualifications in HR. Four different student identifiers.\n\nWeek three went entirely to arbitrating why the enrolment count and the fee-paid count disagreed.',
        hashtags: ['#NAAC', '#HigherEd'],
        cta: 'IQAC folks — how long did your last cycle actually take?',
    },
    {
        formula: 'anaphora',
        hook: 'Built in India. Built for NAAC. Built for the registrar who still reconciles by hand.',
        body: 'Built in India. Built for NAAC. Built for the registrar who still reconciles by hand at 9pm in admission season.\n\nWe did not start from a US student information system and localise it. The accreditation model, the fee structures, the scholarship exceptions, the merit-list logic — those were the first-class problems, not the configuration layer.\n\nThat is a slower way to build a platform. It is the only way it survives an Indian admission cycle.',
        hashtags: ['#MadeInIndia', '#HigherEducation'],
        cta: 'What is the one India-specific requirement your current system still cannot handle?',
    },
    {
        formula: 'lesson-learned',
        hook: 'The feature registrars ask for least and value most: an audit trail.',
        body: 'The feature registrars ask for least and value most: an audit trail.\n\nNobody puts it on an RFP. Then an assessor asks how a graduation-outcome number was derived, and the difference between one lineage and a chain of exports becomes the whole conversation.\n\nWe learned to demo it early, even though it never wins the room.',
        hashtags: ['#HigherEducation', '#Accreditation'],
        cta: 'What is the unglamorous feature that turned out to matter most in your stack?',
    },
    {
        formula: 'one-liner',
        hook: 'An admissions CRM manages a funnel. A campus platform manages a record.',
        body: 'An admissions CRM manages a funnel. A campus platform manages a record.\n\nBuying the first when you need the second is how institutions end up paying for the same capability twice.',
        hashtags: ['#EdTech'],
        cta: '',
    },
];

const socialPosts = (prompt) => {
    const count = Number(/Write (\d+) distinct/i.exec(prompt)?.[1] ?? 0);
    const platformMatch = /"platform":"([a-z]+)"/i.exec(prompt)?.[1];
    const channelMatch = /"channel":"([a-z]+)"/i.exec(prompt)?.[1];
    const isCalendar = /content calendar|scheduled slot|each post carries|"date"/i.test(prompt);
    const wantsVoice = /"voice"/.test(prompt) || /VOICE:/.test(prompt);
    const founderVoice = /FIRST PERSON as the FOUNDER/.test(prompt);
    const mixVoice = /MIX/.test(prompt);

    const total = count || (isCalendar ? 12 : 3);
    const posts = Array.from({ length: total }, (_, i) => {
        const src = SOCIAL_POSTS[i % SOCIAL_POSTS.length];
        const post = {
            platform: platformMatch ?? 'linkedin',
            ...(channelMatch ? { channel: channelMatch } : {}),
            formula: src.formula,
            hook: src.hook,
            body: src.body,
            hashtags: src.hashtags,
            cta: src.cta,
            sourceKeyPoint: src.hook,
        };
        if (wantsVoice) {
            post.voice = mixVoice ? (i % 2 === 0 ? 'company' : 'founder') : (founderVoice ? 'founder' : 'company');
        }
        return post;
    });
    return { posts };
};

const sequenceCopy = (prompt) => {
    const steps = [
        {
            stepNumber: 1, channel: 'email', dayOffset: 0, framework: 'PAS',
            subject: 'the 21-day gap at {{company}}',
            body: 'Hi {{firstname}},\n\nMost registrar offices lose candidates in the same place: the gap between a completed application and an issued offer. Three weeks is normal. Nine days is what one Karnataka university got to after they stopped re-keying applicant data between the admissions tool and the academic office.\n\nIs cycle time something you are trying to pull down for the next intake, or is the bigger problem further downstream?',
            cta: 'Worth a 20-minute look at where your cycle actually stalls?',
        },
        {
            stepNumber: 2, channel: 'linkedin', dayOffset: 3, framework: 'connect',
            subject: '',
            body: 'Connecting — we work with registrar offices on the handover between admissions and academics. Happy to share the migration guide if that is a live question at {{company}}.',
            cta: '',
        },
        {
            stepNumber: 3, channel: 'email', dayOffset: 5, framework: 'value_add',
            subject: 'the honest answer on mid-cycle migration',
            body: 'Hi {{firstname}},\n\nThe objection I hear most is "we cannot migrate mid-cycle" — and most of the time that is correct. There is a narrow safe window, and three conditions that have to hold.\n\nWe wrote it up without the vendor gloss, including when to wait.\n\nSending it because it is useful whether or not you ever talk to us.',
            cta: 'Happy to send the one-page checklist if useful.',
        },
        {
            stepNumber: 4, channel: 'email', dayOffset: 10, framework: 'one_liner',
            subject: 'one number',
            body: 'Hi {{firstname}},\n\nOne number, then I will leave it: 38 counsellors, zero re-keying, same-day document verification. That was the operational change, not a new dashboard.\n\nIs the academic-office handover worth 20 minutes at {{company}}?',
            cta: 'Reply with a day and I will work around your calendar.',
        },
        {
            stepNumber: 5, channel: 'email', dayOffset: 14, framework: 'breakup',
            subject: 'closing the loop',
            body: 'Hi {{firstname}},\n\nI will stop here — clearly not the priority this cycle, which is fair mid-intake.\n\nIf the handover between admissions and academics becomes the thing you want to fix before the next one, the door is open.',
            cta: 'All the best with the intake.',
        },
    ];
    const count = Number(/(\d+)\s*(?:touch|step|email)/i.exec(prompt)?.[1] ?? 5);
    return {
        steps: steps.slice(0, Math.max(3, Math.min(count, steps.length))),
        emails: steps.slice(0, Math.max(3, Math.min(count, steps.length))).map((s) => ({
            order: s.stepNumber, subject: s.subject, body: s.body, goal: s.framework, delay: `Day ${s.dayOffset}`,
        })),
    };
};

// ── ABM: the three-stage pipeline (research prose → structure → score) ───────

const companyFromPrompt = (text) =>
    /assess its fit:\s*([^\n(]+)/i.exec(text)?.[1]?.trim()
    ?? /COMPANY:\s*(.+)/i.exec(text)?.[1]?.trim()
    ?? /Company(?: name)?:\s*(.+)/i.exec(text)?.[1]?.trim()
    ?? 'the account';

/**
 * Domain for a researched company. Prefers the real domain of a company that
 * exists in the demo's Apollo dataset, so the account-scoped contact pull in
 * stage 3 actually finds people; otherwise slugs the name.
 */
const domainFor = (company) => {
    const target = String(company).trim().toLowerCase();
    const known = APOLLO_PEOPLE.find((p) => p.company.toLowerCase() === target)
        ?? APOLLO_PEOPLE.find((p) => target && p.company.toLowerCase().includes(target.split(/\s+/)[0]));
    return known?.domain ?? `${target.replace(/[^a-z0-9]+/g, '')}.edu.in`;
};

/** Stage 1 — grounded prose. Starts with COMPANY/DOMAIN so stage 2 can parse them. */
const abmResearchProse = (prompt) => {
    const company = companyFromPrompt(prompt);
    return `COMPANY: ${company}
DOMAIN: ${domainFor(company)}

FIRMOGRAPHICS
${company} sits in the 1,000-5,000 employee band (Mid-Market to Large Enterprise for an institution of this type), with estimated annual fee revenue of ₹300-400 Cr. Single-brand institution with a stated intake expansion for the coming cycle.

DIGITAL ENGINE & TECH SIGNALS
Admissions runs on a dedicated CRM whose renewal window is visible in procurement notices; academics run on a separate system, with fee reconciliation handled in spreadsheets at cycle close. Google Workspace across staff, a payment gateway on the fee portal, and no evidence of a single student record spanning admissions and academics.

ICP FIT: HIGH
Three independent signals line up. The stack is split exactly where Ken42's wedge sits — an admissions tool that stops at enrolment and an academic system that cannot see it, so applicant data is re-keyed after enrolment. Programme expansion raises applicant volume against the same administrative headcount. An accreditation cycle falls inside the next 14 months, which is the category's most reliable trigger and comes with a hard deadline.

RECOMMENDED TARGET PERSONAS
- Registrar / Director of Admissions (director) — operational owner of cycle time, defines the requirement, recommends the purchase.
- Chief Information Officer / Head of IT (c_suite) — integration veto; owns the incumbent academic system and will decide whether the migration path is credible.
- Vice-Chancellor / Pro Vice-Chancellor (c_suite) — economic buyer against the growth mandate; delegates evaluation but releases budget.
- IQAC Coordinator (manager) — feels the accreditation evidence problem annually and champions internally.

ENTRY STRATEGY
Lead with cycle time to the registrar rather than platform consolidation; consolidation is the CIO conversation and lands better once the registrar has named the handover as the problem. Expect the technical crux to be the existing academic system's migration path, and expect institutional attachment to it — frame Ken42 as replacing fragmentation, not replacing their team's work.

UNCERTAINTY
Revenue and employee bands are estimates from public pages. The accreditation date is inferred from the registry listing rather than confirmed by the institution.`;
};

/** Stage 2 — typed account + the Apollo query used to pull real people. */
const abmStructure = (prompt) => {
    const company = companyFromPrompt(prompt);
    const domain = /DOMAIN:\s*([^\s]+)/i.exec(prompt)?.[1]?.trim() ?? domainFor(company);
    return {
        account: {
            companyName: company,
            domain,
            tier: 'mid-market',
            icpFit: 'high',
            employeeSize: '1000-5000',
            revenue: '₹300-400 Cr (est.)',
            techSignals: [
                'Admissions CRM with a visible renewal window',
                'Separate academic system, no shared student record',
                'Spreadsheet fee reconciliation at cycle close',
                'Google Workspace',
            ],
            whyGrounding:
                `${company} runs a split admissions/academic stack, which is exactly the handover gap Ken42 closes, and has both programme expansion and an accreditation cycle inside 14 months. Fit is graded high on those three independent signals rather than on size alone.`,
            recommendedChannel: 'Registrar-first personalised email, then a platform-level LinkedIn touch to the CIO in the same week',
        },
        apolloQuery: {
            titles: [
                'Registrar',
                'Director of Admissions',
                'Head of Admissions',
                'Deputy Registrar',
                'Chief Information Officer',
                'Head of IT',
                'Director — Digital Transformation',
                'Vice-Chancellor',
                'Pro Vice-Chancellor',
                'IQAC Coordinator',
                'Finance Controller',
            ],
            seniorities: ['c_suite', 'vp', 'head', 'director', 'manager'],
            employeeRanges: ['1000,5000'],
            organizationDomains: [domain],
        },
    };
};

/** Stage 3 — score the REAL Apollo candidates by index. Never authors identity. */
const abmValidate = (prompt) => {
    const candidates = parseArrayFrom(prompt, /CANDIDATES[^:]*:\s*(\[[\s\S]*?\])\s*\n\n/);

    const TIER = [
        { re: /vice-chancellor|provost|^director \(institution\)/i, tier: 'c_suite', score: 72, why: 'Economic buyer against the growth mandate; releases budget but delegates evaluation.', relevance: 'Vice-Chancellor / Pro-VC — economic buyer', channel: 'referral' },
        { re: /chief information|head of it|digital transformation|academic systems/i, tier: 'c_suite', score: 81, why: 'Integration gatekeeper — owns the incumbent academic system and can veto on architecture.', relevance: 'CIO / Head of Digital Transformation — secondary ICP', channel: 'linkedin' },
        { re: /registrar|admissions/i, tier: 'director', score: 92, why: 'Operational owner of admissions cycle time — the metric this campaign leads with — and defines the requirement.', relevance: 'Registrar / Director of Admissions — primary ICP', channel: 'email' },
        { re: /iqac|quality/i, tier: 'manager', score: 84, why: 'Feels the accreditation evidence problem annually and champions internally, though without budget.', relevance: 'Accreditation owner — matches the pending IQAC persona', channel: 'email' },
        { re: /finance|cfo|bursar/i, tier: 'director', score: 78, why: 'Owns fee reconciliation across the cycle — the KenFin expansion argument stands on its own with this seat.', relevance: 'Finance buyer — KenFin expansion path', channel: 'email' },
        { re: /placement|corporate relations/i, tier: 'manager', score: 66, why: 'KenCareers influencer with ranking-linked metrics; useful second-wave contact.', relevance: 'Placements — narrow entry via KenCareers', channel: 'email' },
        { re: /examination/i, tier: 'director', score: 70, why: 'Academic-operations stakeholder for KenLearn; relevant once the record conversation is open.', relevance: 'Academic operations — KenLearn', channel: 'email' },
    ];
    const SKIP = /assistant|intern|student|coordinator \(events\)|support/i;

    const contacts = candidates
        .map((c, i) => {
            const title = String(c?.title ?? '');
            if (!title || SKIP.test(title)) return { i, keep: false };
            const match = TIER.find((t) => t.re.test(title));
            if (!match) return { i, keep: false };
            return {
                i: Number.isInteger(c?.i) ? c.i : i,
                keep: true,
                seniorityTier: match.tier,
                fitScore: match.score,
                fitReasoning: match.why,
                icpRelevance: match.relevance,
                recommendedChannel: match.channel,
                confidence: 'high',
                flags: [],
            };
        })
        .filter((c) => c.keep);

    return { contacts };
};

const campaignStrategy = (prompt) => {
    const goal = /Goal:\s*(.+)/i.exec(prompt)?.[1]?.trim() ?? 'Book qualified walkthroughs with registrars before the renewal window';
    return {
        goal,
        campaignType: /awareness/i.test(prompt) ? 'awareness' : 'lead-gen',
        strategySummary:
            'Registrars renew admissions software in November and evaluate in the inter-cycle window, so the campaign is timed to that calendar rather than to our quarter. The wedge is cycle time — a number the buyer is personally measured on — and the blocker is migration fear. Answer the migration objection honestly first to earn credibility, reinforce it on LinkedIn against the full buying committee, then sequence into a researched account list. Every asset points at the same claim.',
        steps: [
            {
                module: 'seo-aeo', title: 'Answer the mid-cycle migration objection',
                brief: 'Direct-answer guide: can a university switch admissions software mid-cycle? Answer in the first 40 words, give the three conditions, add a realistic duration table and FAQ schema, and say plainly when to wait.',
                rationale: 'This objection kills deals before a demo, and no competitor has published an honest version.',
                suggestedOrder: 1, offsetDays: 0, suggestedConfig: { intent: 'commercial' },
            },
            {
                module: 'social-media', title: 'Reframe the problem on LinkedIn',
                brief: 'Three-post arc: the handover is the problem (not the CRM), the three-condition migration checklist, and the three-people diagnostic. Company voice, no product pitch.',
                rationale: 'Registrars and CIOs share operational reframes; product posts get ignored in this category.',
                suggestedOrder: 2, offsetDays: 7, suggestedConfig: { platforms: ['linkedin'], postsPerWeek: 3 },
            },
            {
                module: 'ad-campaigns', title: 'LinkedIn paid against the buying committee',
                brief: 'Four variants across outcome, objection, authority and urgency angles, with adjacent titles layered so the CIO and VC see the platform claim while registrars see cycle time.',
                rationale: 'The registrar recommends but does not sign — paid has to reach all three seats or the internal case stalls.',
                suggestedOrder: 3, offsetDays: 14, suggestedConfig: { platform: 'linkedin', count: 4 },
            },
            {
                module: 'outreach', title: 'Five-touch sequence into researched accounts',
                brief: 'Email and LinkedIn rotation over 14 days into the Tier-1 registrar list. Touch 3 gives away the migration guide with no ask.',
                rationale: 'Warm-by-content cold outreach: the sequence references an asset the buyer may already have read.',
                suggestedOrder: 4, offsetDays: 21, suggestedConfig: { mode: 'cold', touchCount: 5, channels: ['email', 'linkedin'] },
            },
        ],
        successCriteria: [
            '25 booked walkthroughs with a registrar or admissions head present',
            'Reply rate above 8% on the cold sequence',
            'Migration guide ranking top 3 for its primary term',
            'At least 6 opportunities with a November renewal date attached',
        ],
        assumptions: [
            'Renewal decisions cluster in November-January',
            'Cycle time is the registrar\'s primary personal metric',
        ],
    };
};

const mentionAnswer = () => ({
    answer:
        'Having been through this on the vendor side, the honest version is that mid-cycle migrations are survivable but conditional. What matters is finding a stage boundary where your applicant pipeline is briefly empty — usually between document verification and merit list — and agreeing in writing which system owns each stage from a specific date. Then run one complete stage in both systems and reconcile record counts before you cut over. If the counts do not match, you have found the problem while it is still cheap to fix.\n\nWhat actually breaks is rarely data loss. It is counsellors working in two systems with no agreed source of truth, so applicants get called twice and offers go out on stale data.\n\nI work at Ken42, which sells a platform in this space, so treat that as disclosed bias — but the advice above applies whichever vendor you pick. If your merit list is already published or your fee gateway is mid-reconciliation, wait for the inter-cycle window.',
    mentionsBrand: true,
    disclosed: true,
    recommendation: 'post',
});

/**
 * Ordered matchers — first hit wins. Each `test` receives the SYSTEM PROMPT AND
 * the user prompt joined, because several of Kepler's JSON contracts live in the
 * system prompt (the ABM pipeline, for one) rather than in the user message.
 */
const CURATED = [
    { test: (t) => /Research this company and assess its fit/i.test(t), run: abmResearchProse },
    { test: (t) => /"apolloQuery"/.test(t), run: abmStructure },
    { test: (t) => /FILTER and SCORE|CANDIDATES \(from Apollo/i.test(t), run: abmValidate },
    { test: (t) => /"keywords":\[/.test(t) && /"clusters"/.test(t), run: keywordResearch },
    { test: (t) => /Produce a blog outline/i.test(t), run: blogOutline },
    { test: (t) => /Write the full blog post/i.test(t), run: blogDraft },
    { test: (t) => /Review this blog draft/i.test(t), run: blogReview },
    { test: (t) => /"variants":\[/.test(t), run: adVariants },
    { test: (t) => /"adjacentTitles"|recommendedCombination/i.test(t), run: linkedinTargeting },
    { test: (t) => /"posts":\[/.test(t), run: socialPosts },
    { test: (t) => /"steps":\[\{"stepNumber"|"emails":\[|sequence/i.test(t) && /subject/i.test(t), run: sequenceCopy },
    { test: (t) => /"strategySummary"|"module":"seo-aeo/i.test(t), run: campaignStrategy },
    { test: (t) => /helpful community answer|mentionsBrand/i.test(t), run: mentionAnswer },
];

/**
 * Demo replacement for `callAI(prompt, config)`. Mirrors the real return contract:
 * a parsed object when `json`, a string otherwise, wrapped when `includeModelMeta`.
 */
export const callDemoAI = async (prompt, config = {}) => {
    const { json = false, includeModelMeta = false, grounding = false, systemPrompt = null } = config;

    await sleep(DEMO_AI_LATENCY_MS + (hash(prompt) % 700));

    const matchText = `${systemPrompt ?? ''}\n${prompt}`;
    const curated = CURATED.find((c) => c.test(matchText));
    const payload = curated ? curated.run(prompt) : genericFill(matchText);

    // Grounded calls return prose on Vertex (grounding and forced JSON are mutually
    // exclusive), and a downstream non-grounded call structures it — so match that.
    const content = json && !grounding
        ? payload
        : typeof payload === 'string'
            ? payload
            : Object.values(payload).flatMap((v) => (Array.isArray(v) ? v : [v]))
                .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
                .join('\n\n')
                .slice(0, 4000);

    if (!includeModelMeta) return content;

    return {
        content,
        modelUsed: 'gemini-2.5-flash (demo)',
        usage: { prompt_tokens: Math.round(prompt.length / 4), completion_tokens: 820, total_tokens: Math.round(prompt.length / 4) + 820 },
        ...(grounding
            ? {
                grounding: [
                    { title: 'Ken42 — platform overview', uri: 'https://ken42.com/platform' },
                    { title: 'NAAC evidence collection guide', uri: 'https://ken42.com/blog/naac-evidence-collection' },
                    { title: 'Meritto — admission management software', uri: 'https://www.meritto.com/admission-management-software/' },
                ],
            }
            : {}),
    };
};
