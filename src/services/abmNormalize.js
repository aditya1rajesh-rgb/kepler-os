// Pure normalizers for the ABM research pipeline. Deliberately dependency-free
// (no aiClient/supabase) so they are trivially unit-testable and reusable: the
// model's output is never trusted raw - every field is clamped, every enum is
// coerced, PII is never fabricated, contacts are deduped + ranked.

// Apollo People Search seniority tokens (mirror Prospecting's filter set).
export const APOLLO_SENIORITIES = ['founder', 'c_suite', 'vp', 'head', 'director', 'manager'];
export const SENIORITY_TIERS = ['c_suite', 'founder', 'vp', 'head', 'director', 'manager', 'other'];
export const ICP_FIT = ['high', 'medium', 'low'];
export const TIERS = ['enterprise', 'mid-market', 'smb'];
export const CONFIDENCE = ['high', 'medium', 'low'];
export const MAX_CONTACTS = 25;

export const str = (v, max = 600) => String(v ?? '').trim().slice(0, max);
export const lower = (v) => str(v).toLowerCase();
export const oneOf = (v, allowed, fallback = '') => (allowed.includes(lower(v)) ? lower(v) : fallback);
export const intIn = (v, lo, hi) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return lo;
    return Math.min(hi, Math.max(lo, n));
};
export const strList = (v, maxItems, maxLen = 120) =>
    (Array.isArray(v) ? v : []).map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems);

// PII we will NEVER fabricate: keep an email only if it is well-formed and not an
// Apollo "locked" placeholder; otherwise blank (a flag is added downstream).
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const cleanEmail = (v) => {
    const e = lower(v);
    if (!e || e.includes('not_unlocked') || e.includes('email_not_unlocked') || !EMAIL_RE.test(e)) return '';
    return e.slice(0, 320);
};
export const cleanPhone = (v) => {
    const p = str(v, 40);
    return (p.replace(/\D/g, '').length >= 7) ? p : '';
};
export const cleanDomain = (v) => lower(v).replace(/^https?:\/\//, '').replace(/\/.*$/, '').slice(0, 255);

/** Validate the STRUCTURE stage's account object. Pure - never throws. */
export const normalizeAccount = (raw, ctx = {}) => {
    const a = raw && typeof raw === 'object' ? raw : {};
    return {
        companyName: str(a.companyName, 300) || str(ctx.companyName, 300),
        // Prefer the model's domain; fall back to a caller-supplied website hint
        // (e.g. the website column from an uploaded company list).
        domain: cleanDomain(a.domain) || cleanDomain(ctx.website),
        tier: oneOf(a.tier, TIERS, ''),
        icpFit: oneOf(a.icpFit, ICP_FIT, ''),
        employeeSize: str(a.employeeSize, 60),
        revenue: str(a.revenue, 100),
        techSignals: strList(a.techSignals, 20),
        whyGrounding: str(a.whyGrounding, 2000),
        recommendedChannel: str(a.recommendedChannel, 120),
        sources: Array.isArray(ctx.sources) ? ctx.sources.slice(0, 12) : [],
        status: 'researched',
    };
};

/** Constrain the STRUCTURE stage's Apollo query to what the connector accepts. */
export const normalizeApolloQuery = (raw, account = {}) => {
    const q = raw && typeof raw === 'object' ? raw : {};
    const seniorities = (Array.isArray(q.seniorities) ? q.seniorities : [])
        .map(lower).filter((s) => APOLLO_SENIORITIES.includes(s));
    const employeeRanges = (Array.isArray(q.employeeRanges) ? q.employeeRanges : [])
        .map((r) => str(r, 20)).filter((r) => /^\d+,\d+$/.test(r));
    const domains = (Array.isArray(q.organizationDomains) ? q.organizationDomains : [])
        .map(cleanDomain).filter(Boolean);
    if (!domains.length && account.domain) domains.push(account.domain);
    return {
        titles: Array.from(new Set(strList(q.titles, 12, 120))),
        seniorities: Array.from(new Set(seniorities)),
        employeeRanges: Array.from(new Set(employeeRanges)),
        organizationDomains: Array.from(new Set(domains)),
    };
};

/** Validate one contact from the VALIDATE stage. Pure - never throws. */
export const normalizeContact = (raw, ctx = {}) => {
    const c = raw && typeof raw === 'object' ? raw : {};
    const email = cleanEmail(c.email);
    const phone = cleanPhone(c.phone);
    const flags = strList(c.flags, 12, 60);
    // Enforce the blank-PII rule: no verified email => enrichment needed.
    if (!email && !flags.includes('needs-enrichment')) flags.push('needs-enrichment');
    return {
        firstName: str(c.firstName, 200),
        lastName: str(c.lastName, 200),
        title: str(c.title, 300),
        seniorityTier: oneOf(c.seniorityTier, SENIORITY_TIERS, 'other'),
        company: str(c.company, 300) || str(ctx.companyName, 300),
        linkedinUrl: str(c.linkedinUrl, 500),
        email,
        phone,
        fitScore: intIn(c.fitScore, 0, 100),
        fitReasoning: str(c.fitReasoning, 1000),
        icpRelevance: str(c.icpRelevance, 300),
        recommendedChannel: str(c.recommendedChannel, 120),
        source: oneOf(c.source, ['apollo', 'research'], 'research'),
        externalId: str(c.externalId, 200),
        confidence: oneOf(c.confidence, CONFIDENCE, ''),
        flags,
    };
};

/**
 * Merge the VALIDATE stage's SCORES onto the real Apollo candidates. Identity
 * (name/title/company/LinkedIn/externalId) comes ONLY from Apollo — the model can
 * never author a person, a LinkedIn URL, or an email. The model output is just a
 * per-candidate score keyed by index `i` (or externalId as a fallback); anything
 * that doesn't resolve to a real candidate is dropped. Email is always blank here
 * (revealed later by enrichment). Pure + unit-tested.
 */
export const mergeScoredContacts = (candidates, scores, ctx = {}) => {
    const cands = Array.isArray(candidates) ? candidates : [];
    const list = Array.isArray(scores) ? scores : [];
    const byExternal = new Map(cands.map((c, i) => [str(c.externalId, 200), i]).filter(([id]) => id));
    const seen = new Set();
    const out = [];
    for (const s of list) {
        if (!s || s.keep === false) continue;
        // Resolve the REAL candidate: by index first, then externalId.
        let idx = Number(s.i);
        if (!Number.isInteger(idx) || idx < 0 || idx >= cands.length) {
            idx = s.externalId != null ? byExternal.get(str(s.externalId, 200)) : undefined;
        }
        if (idx == null || !cands[idx]) continue;
        const cand = cands[idx];
        const firstName = str(cand.firstName, 200);
        const lastName = str(cand.lastName, 200);
        const title = str(cand.title, 300);
        if (!firstName && !lastName && !title) continue;
        const externalId = str(cand.externalId, 200);
        const key = externalId || `n:${lower(firstName)} ${lower(lastName)}|${lower(title)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
            firstName,
            lastName,
            title,
            company: str(cand.company, 300) || str(ctx.companyName, 300),
            linkedinUrl: str(cand.linkedinUrl, 500), // real Apollo URL, never model-authored
            email: '',                               // revealed by enrichment, never guessed
            phone: '',
            seniorityTier: oneOf(s.seniorityTier, SENIORITY_TIERS, '') || oneOf(cand.seniority, SENIORITY_TIERS, 'other'),
            fitScore: intIn(s.fitScore, 0, 100),
            fitReasoning: str(s.fitReasoning, 1000),
            icpRelevance: str(s.icpRelevance, 300),
            recommendedChannel: str(s.recommendedChannel, 120),
            source: 'apollo',
            externalId,
            confidence: oneOf(s.confidence, CONFIDENCE, ''),
            flags: Array.from(new Set([...strList(s.flags, 12, 60), 'needs-enrichment'])),
        });
    }
    return out.sort((x, y) => y.fitScore - x.fitScore).slice(0, MAX_CONTACTS);
};

/** Normalize + dedupe + rank the VALIDATE stage's contact array. Pure. */
export const normalizeContacts = (rawList, ctx = {}) => {
    const list = Array.isArray(rawList) ? rawList : [];
    const seen = new Set();
    const out = [];
    for (const raw of list) {
        const c = normalizeContact(raw, ctx);
        if (!c.firstName && !c.lastName && !c.title) continue;
        const key = c.externalId
            || (c.email ? `e:${c.email}` : `n:${lower(c.firstName)} ${lower(c.lastName)}|${lower(c.title)}`);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(c);
    }
    return out.sort((x, y) => y.fitScore - x.fitScore).slice(0, MAX_CONTACTS);
};
