// AEO / GEO citation-readiness signals (WS3). Deterministic, reproducible signals
// grounded in the Princeton GEO study (KDD 2024): the levers that actually move
// AI-citation likelihood are citing SOURCES (+40%), STATISTICS (+37%), QUOTATIONS
// (+30%), authoritative tone (+25%), and AVOIDING keyword stuffing (−10%). These
// pure functions compute those signals so aeoScoreService can score against real
// evidence instead of model vibes (and the visibility loop can reuse them).
// Pure + unit-tested (tests/aeo-signals.test.js).

const PRONOUNS = new Set(['it', 'they', 'them', 'this', 'that', 'these', 'those', 'he', 'she', 'its', 'their']);

// Common words excluded from the keyword-stuffing check (not "stuffing" if frequent).
const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'as', 'at', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'you', 'your', 'we', 'our', 'i', 'if', 'so', 'not',
    'can', 'will', 'that', 'this', 'it', 'its', 'from', 'into', 'about', 'more', 'than', 'then',
]);

export const stripMarkdown = (md) =>
    String(md ?? '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[#>*_`-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

/** Count inline source citations: markdown links, bare URLs, and attribution phrases. */
const countCitations = (markdown) => {
    const md = String(markdown ?? '');
    const links = (md.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
    const bareUrls = (md.match(/https?:\/\/[^\s)]+/g) || []).length;
    const attributions = (md.match(/\b(according to|as reported by|source:|per\s+[A-Z]|cited by|\(\d{4}\))/gi) || []).length;
    return links + bareUrls + attributions;
};

/** Count quoted passages of a few words or more (curly or straight quotes). */
const countQuotes = (text) =>
    (String(text ?? '').match(/[“”"][^“”"]{15,}[“”"]/g) || []).length;

/**
 * Keyword-stuffing signal: the most-repeated meaningful word as a share of content
 * words. A single non-stopword dominating the text is the classic stuffing pattern
 * the Princeton study penalizes (−10%).
 */
const keywordStuffing = (words) => {
    const counts = new Map();
    let considered = 0;
    for (const raw of words) {
        const w = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (w.length < 4 || STOPWORDS.has(w)) continue;
        counts.set(w, (counts.get(w) ?? 0) + 1);
        considered += 1;
    }
    let topWord = '';
    let topCount = 0;
    for (const [w, c] of counts) if (c > topCount) { topCount = c; topWord = w; }
    const ratio = considered ? Number((topCount / considered).toFixed(3)) : 0;
    return { topWord, topWordRatio: ratio, stuffed: considered >= 50 && ratio > 0.06 };
};

/**
 * Compute all AEO signals for a piece of content. Pure + deterministic.
 * @returns signals object (word/heading/list/stat counts + Princeton levers).
 */
export const computeAeoSignals = (markdown, { title = '', metaDescription = '' } = {}) => {
    const text = stripMarkdown(markdown);
    const words = text.split(/\s+/).filter(Boolean);
    const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
    const headings = (String(markdown).match(/^#{2,3}\s+/gm) || []).length;
    const lists = (String(markdown).match(/^\s*[-*]\s+/gm) || []).length;
    const statMatches = (text.match(/\b\d[\d,.]*%?\b|\$\d[\d,.]*/g) || []).length;
    const pronounCount = words.filter((w) => PRONOUNS.has(w.toLowerCase())).length;
    const citationCount = countCitations(markdown);
    const quoteCount = countQuotes(markdown);
    const stuffing = keywordStuffing(words);
    const per100 = (n) => (words.length ? Number(((n / words.length) * 100).toFixed(2)) : 0);

    return {
        wordCount: words.length,
        sentenceCount: sentences.length,
        headingCount: headings,
        listCount: lists,
        statCount: statMatches,
        statDensityPer100Words: per100(statMatches),
        citationCount,
        citationDensityPer100Words: per100(citationCount),
        quoteCount,
        pronounRatio: words.length ? Number((pronounCount / words.length).toFixed(3)) : 0,
        keywordStuffed: stuffing.stuffed,
        topWord: stuffing.topWord,
        topWordRatio: stuffing.topWordRatio,
        titleLength: title.length,
        titleLengthOk: title.length >= 40 && title.length <= 65,
        metaDescriptionLength: metaDescription.length,
        metaDescriptionOk: metaDescription.length >= 120 && metaDescription.length <= 165,
    };
};
