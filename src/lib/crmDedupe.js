// De-duplication of researched contacts against a connected CRM (Zoho). Pure +
// testable. Two confidence levels, because researched contacts frequently have
// NO email until enrichment:
//   'email' — same email address → confident duplicate (hide + exclude from save)
//   'name'  — same person name + same/unknown company → likely duplicate (flag only)

const lc = (v) => String(v ?? '').trim().toLowerCase();
const normName = (v) => lc(v).replace(/[^a-z0-9]+/g, ' ').trim();
const COMPANY_NOISE = /\b(inc|llc|ltd|co|corp|plc|gmbh|sa|ag|group|holdings|the)\b/g;
const normCompany = (v) =>
    lc(v).replace(/[^a-z0-9 ]+/g, ' ').replace(COMPANY_NOISE, ' ').replace(/\s+/g, ' ').trim();
const nameKey = (first, last) => `${normName(first)}|${normName(last)}`;

/** Build a lookup from a list of CRM contacts ({ firstName, lastName, email, company }). */
export const buildCrmIndex = (items = []) => {
    const emails = new Set();
    const names = new Map(); // nameKey -> Set of normalized companies ('' when CRM row had none)
    for (const it of Array.isArray(items) ? items : []) {
        const email = lc(it?.email);
        if (email) emails.add(email);
        const key = nameKey(it?.firstName, it?.lastName);
        if (key === '|') continue;
        if (!names.has(key)) names.set(key, new Set());
        names.get(key).add(normCompany(it?.company));
    }
    return { emails, names };
};

/**
 * Classify a contact against the CRM index.
 * @returns {'' | 'email' | 'name'}
 */
export const crmMatch = (contact, index) => {
    if (!index) return '';
    const email = lc(contact?.email);
    if (email && index.emails.has(email)) return 'email';
    const key = nameKey(contact?.firstName, contact?.lastName);
    if (key === '|' || !index.names.has(key)) return '';
    const companies = index.names.get(key);
    const c = normCompany(contact?.company);
    // Same name AND (same company, or company unknown on either side) => likely dup.
    // Same name but clearly different company => not a duplicate.
    if (!c || companies.has('') || companies.has(c)) return 'name';
    return '';
};
