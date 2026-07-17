import { callAI, FREE_MODEL_FALLBACKS } from './aiClient';
import { getBrandContextForGeneration } from './brandContextService';
import { feedbackService } from './feedbackService';
import { integrationService } from './integrationService';
import { str, normalizeAccount, normalizeApolloQuery, normalizeContacts } from './abmNormalize';

// ABM research pipeline: a GTM segmentation analyst that researches a target
// company and returns an ICP-fit classification + a validated contact list.
// Three AI stages, because Vertex Gemini can't combine Google Search grounding
// with forced-JSON in one call (see [[abm-grounding-pipeline]]):
//   1. RESEARCH  - grounded, prose. Live web research + ICP-fit reasoning, graded
//                  against the workspace's OWN brand + ICP (not a static product).
//   2. STRUCTURE - non-grounded JSON. Turns the brief into a typed account +
//                  an Apollo query (titles/seniorities/domains) for the pull.
//   3. PULL      - Apollo People Search scoped to the account (real contacts).
//   4. VALIDATE  - non-grounded JSON. Scores/filters the Apollo rows against the
//                  research + ICP (Apollo is noisy), never fabricating PII.
// All JSON robustness is centralized in callAI - no per-call parsing here.
// The pure output validators live in [[abmNormalize]] (unit-tested).

const RESEARCH_SYSTEM = `You are a B2B Go-To-Market Segmentation Analyst. Using live web search, you research a target company and assess whether it is a strong account for the product described in "OUR PRODUCT & ICP" (provided in the user message).

Ground every claim in what you find. Prefer recent, specific facts: employee count (LinkedIn/Crunchbase), named tech in their stack, funding, engineering org / "labs" / engineering blog. If a company's core business is physical (retail, bank, logistics, rental) look for a "digital engine" - a large internal tech org, cloud-native apps, or a dedicated tech brand - which can still make it a strong fit.

Write a concise research brief covering:
- Firmographics: employee-count band; tier (Large Enterprise 1000+ / Mid-Market 100-999 / SMB <100); estimated revenue.
- Digital engine & tech signals: notable tools/platforms, engineering scale, relevant infrastructure.
- ICP fit (High / Medium / Low) vs OUR ICP, with the specific reasons.
- Recommended target personas: the leadership TITLES + seniorities to pitch (Head of / Director / VP / C-suite; buyers, not individual-contributor users), and why each matters for OUR product.

Be explicit about uncertainty. Do NOT invent people's names, emails, or phone numbers - persona targeting is by TITLE at this stage.`;

const STRUCTURE_SYSTEM = `You convert a research brief into ONE raw JSON object (no markdown, no code fences, no commentary). Do not add facts beyond the brief. Use "unknown" for genuinely unknown fields.

Shape:
{"account":{"companyName":"","domain":"primary web domain only, no protocol/path","tier":"enterprise|mid-market|smb","icpFit":"high|medium|low","employeeSize":"e.g. 1000-5000","revenue":"e.g. $500M+ or unknown","techSignals":["short signals"],"whyGrounding":"1-3 sentences of evidence behind the tier + fit call","recommendedChannel":"e.g. 1:1 LinkedIn + personalized email"},"apolloQuery":{"titles":["leadership titles to search for"],"seniorities":["subset of: founder,c_suite,vp,head,director,manager"],"employeeRanges":["Apollo ranges as min,max e.g. 1000,5000"],"organizationDomains":["the account's domain(s)"]}}`;

const VALIDATE_SYSTEM = `You validate and score a target contact list for an ABM pitch. You are given the target ACCOUNT, the RESEARCH brief, OUR PRODUCT & ICP, and CANDIDATES pulled from a contact database (Apollo) which is often noisy and inaccurate.

Return ONE raw JSON object (no markdown/fences): {"contacts":[ ... ]}.

Rules:
- Keep only people who plausibly work AT the target account in a relevant LEADERSHIP role (C-suite/founder/VP/Head/Director). Drop wrong-company rows, junior individual contributors, and irrelevant functions (sales, HR, support).
- Score fit 0-100 against OUR ICP; add a one-line fitReasoning and icpRelevance.
- seniorityTier: one of c_suite, founder, vp, head, director, manager, other.
- source: "apollo" for a candidate from the list, "research" for anyone you add from the brief.
- confidence: high|medium|low that this is a real, correctly-attributed person.
- NEVER fabricate email or phone. Use ONLY values present in the candidate data; if absent leave "" and put "needs-enrichment" in flags. Add other flags for issues (e.g. "title-mismatch","unverified").

Contact shape:
{"firstName":"","lastName":"","title":"","seniorityTier":"","company":"","linkedinUrl":"","email":"","phone":"","fitScore":0,"fitReasoning":"","icpRelevance":"","recommendedChannel":"","source":"apollo|research","confidence":"high|medium|low","flags":[]}`;

// Compact Apollo candidates for the validation prompt (drop noise, cap count).
const serializeCandidates = (people = []) =>
    people.slice(0, 40).map((p, i) => ({
        i,
        firstName: p.firstName ?? '',
        lastName: p.lastName ?? '',
        title: p.title ?? '',
        company: p.company ?? '',
        linkedinUrl: p.linkedinUrl ?? '',
        email: p.email ?? '',
        seniority: p.seniority ?? '',
        externalId: p.externalId ?? '',
    }));

const AI_BASE = {
    model: FREE_MODEL_FALLBACKS[0],
    modelFallbacks: FREE_MODEL_FALLBACKS,
    includeModelMeta: true,
};

export const abmResearchService = {
    /**
     * Run the full research pipeline for one company.
     * @returns {Promise<{ok:true, account, contacts, sources, modelUsed, apolloUsed:boolean, note?:string}
     *                   | {ok:false, error:string, errorKind?:string}>}
     */
    researchAccount: async (workspaceId, { companyName = '', notes = '', website = '' } = {}) => {
        if (!workspaceId) return { ok: false, error: 'workspaceId is required' };
        const company = str(companyName, 200);
        const site = str(website, 255);
        if (!company) return { ok: false, error: 'Enter a company name or website to research.' };

        // 0. Brand + ICP grounding (the analyst grades against OUR product, not a
        //    static one) + the cross-module feedback guidance loop.
        let brandContext;
        try {
            brandContext = await getBrandContextForGeneration(workspaceId, { module: 'outreach', depth: 'profile' });
        } catch (err) {
            return { ok: false, error: `Could not load brand context: ${err.message}` };
        }
        if (!brandContext.meta.hasBrand) {
            return {
                ok: false,
                errorKind: 'insufficient_context',
                error: 'Add a brand profile in Brand Intelligence before researching accounts - the analyst grades fit against your ICP.',
            };
        }
        const guidance = await feedbackService.getGuidance(workspaceId, 'abm');
        const productBlock = `OUR PRODUCT & ICP:\n${brandContext.prompt}${guidance}`;

        // 1. RESEARCH (grounded prose + citations).
        let research;
        try {
            research = await callAI(
                `${productBlock}\n\nResearch this company and assess its fit: ${company}${site ? ` (website: ${site})` : ''}${notes ? `\nExtra focus from the user: ${notes}` : ''}`,
                { ...AI_BASE, grounding: true, maxTokens: 2200, temperature: 0.4, systemPrompt: RESEARCH_SYSTEM },
            );
        } catch (err) {
            return { ok: false, error: `Research failed: ${err.message}` };
        }
        const researchProse = String(research?.content ?? '').trim();
        const sources = Array.isArray(research?.grounding) ? research.grounding : [];
        if (!researchProse) {
            return { ok: false, errorKind: 'empty_content', error: 'The analyst could not research that company. Try the full company name or its website.' };
        }

        // 2. STRUCTURE (non-grounded JSON) -> account + Apollo query.
        let structured;
        try {
            structured = await callAI(
                `RESEARCH BRIEF:\n${researchProse}\n\nExtract the account and the Apollo query as specified.`,
                { ...AI_BASE, json: true, maxTokens: 1200, temperature: 0.2, systemPrompt: STRUCTURE_SYSTEM },
            );
        } catch (err) {
            return { ok: false, error: `Could not structure the research: ${err.message}` };
        }
        const account = normalizeAccount(structured?.content?.account, { companyName: company, sources, website: site });
        const apolloQuery = normalizeApolloQuery(structured?.content?.apolloQuery, account);

        // 3. PULL (Apollo, optional). Degrades to research-only if not connected.
        let apolloPeople = [];
        let apolloUsed = false;
        let note = '';
        try {
            const status = await integrationService.getStatus(workspaceId, 'apollo');
            if (status?.status === 'connected' && apolloQuery.titles.length) {
                const res = await integrationService.fetchFromConnector(workspaceId, 'apollo', {
                    titles: apolloQuery.titles,
                    seniorities: apolloQuery.seniorities,
                    employeeRanges: apolloQuery.employeeRanges,
                    organizationDomains: apolloQuery.organizationDomains,
                    keywords: account.companyName,
                    perPage: 25,
                });
                apolloPeople = res?.result?.people ?? [];
                apolloUsed = true;
                if (!apolloPeople.length) note = 'Apollo returned no matches for the recommended titles - contacts below are analyst-surfaced.';
            } else if (status?.status !== 'connected') {
                note = 'Apollo is not connected - contacts are analyst-surfaced (best-effort). Connect Apollo for verified contacts.';
            }
        } catch {
            note = 'Apollo lookup failed - contacts below are analyst-surfaced. Try again or check the Apollo connection.';
        }

        // 4. VALIDATE + score (non-grounded JSON). Gemini filters Apollo's noise.
        let validated;
        try {
            validated = await callAI(
                `${productBlock}\n\nACCOUNT: ${JSON.stringify({ companyName: account.companyName, domain: account.domain, tier: account.tier, icpFit: account.icpFit })}\n\nRESEARCH BRIEF:\n${researchProse}\n\nCANDIDATES (from Apollo, may be noisy):\n${JSON.stringify(serializeCandidates(apolloPeople))}\n\nValidate, score and return the contacts.`,
                { ...AI_BASE, json: true, maxTokens: 3000, temperature: 0.3, systemPrompt: VALIDATE_SYSTEM },
            );
        } catch (err) {
            return { ok: false, error: `Could not validate contacts: ${err.message}` };
        }
        const contacts = normalizeContacts(validated?.content?.contacts, { companyName: account.companyName });

        return {
            ok: true,
            account,
            contacts,
            sources,
            apolloUsed,
            note,
            modelUsed: research?.modelUsed ?? validated?.modelUsed ?? null,
        };
    },
};

export default abmResearchService;
