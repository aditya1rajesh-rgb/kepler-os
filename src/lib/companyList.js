import { sanitizeText, isValidUrl } from './validation';

// Parse a pasted or uploaded company list into a deduped, bounded array of
// { name, website }. Newline-first (one company per row); each row is 1-2 columns
// separated by a comma OR tab (name[, website]). A leading header row such as
// "company,website" is dropped. Bounded by MAX_COMPANIES to keep batch cost +
// runtime in check (the ABM batch cap). Pure + dependency-light so it's unit-tested.

export const MAX_COMPANIES = 50;

// Exact-match header words only (so a real company literally named "Company X"
// is NOT mistaken for a header — we match the whole first cell, not a prefix).
const HEADER_NAMES = new Set([
    'company', 'companies', 'name', 'names', 'account', 'accounts',
    'organization', 'organizations', 'organisation', 'organisations',
]);
const HEADER_SITE_RE = /^(website|websites|domain|domains|url|urls|site|sites)$/i;

const isHeaderRow = (c0 = '', c1 = '') => {
    const a = String(c0).trim().toLowerCase();
    if (!a) return false;
    if (c1) return HEADER_NAMES.has(a) && HEADER_SITE_RE.test(String(c1).trim());
    return HEADER_NAMES.has(a) || HEADER_SITE_RE.test(a);
};

const cleanDomain = (v) => {
    const s = String(v ?? '').trim();
    if (!s || !isValidUrl(s)) return '';
    return s.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase().slice(0, 255);
};

/**
 * @param {string} raw            pasted text or file contents
 * @param {object} [opts]
 * @param {number} [opts.max]     hard cap on returned companies (default 50)
 * @returns {{ name: string, website: string }[]}
 */
export const parseCompanyList = (raw, { max = MAX_COMPANIES } = {}) => {
    const lines = String(raw ?? '').split(/\r?\n/);
    const out = [];
    const seen = new Set();
    let firstContentLine = true;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        const cols = line.split(/[,\t]/).map((c) => c.trim());
        if (firstContentLine) {
            firstContentLine = false;
            if (isHeaderRow(cols[0], cols[1])) continue; // drop a leading header row
        }

        const name = sanitizeText(cols[0], 200);
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue; // dedupe by name

        seen.add(key);
        out.push({ name, website: cleanDomain(cols[1]) });
        if (out.length >= max) break;
    }

    return out;
};

export default parseCompanyList;
