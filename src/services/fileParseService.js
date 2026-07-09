const TEXT_TYPES = new Set([
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'text/html',
]);

const TEXT_EXTENSIONS = /\.(txt|md|markdown|csv|json|html|htm)$/i;

const MAX_EXTRACT_CHARS = 15000;
const MAX_THEME_COUNT = 6;
const MAX_STATS_COUNT = 3;

const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'you', 'our',
    'are', 'was', 'were', 'have', 'has', 'had', 'into', 'about', 'their', 'them',
    'they', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'must',
    'than', 'then', 'when', 'where', 'what', 'which', 'who', 'how', 'why',
    'not', 'but', 'all', 'any', 'out', 'per', 'via', 'new', 'more', 'most',
    'also', 'over', 'under', 'between', 'after', 'before', 'during', 'because',
]);

const readAsText = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
        reader.readAsText(file);
    });

const isPdf = (file) =>
    file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name ?? '');

// pdfjs is heavy (~1MB) and only needed when a PDF is parsed, so it is loaded
// lazily via dynamic import. The worker is configured once per session.
let pdfWorkerConfigured = false;

const extractPdfText = async (file) => {
    const pdfjs = await import('pdfjs-dist');
    if (!pdfWorkerConfigured) {
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        pdfWorkerConfigured = true;
    }

    const data = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data }).promise;
    try {
        const parts = [];
        let total = 0;
        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
            const page = await doc.getPage(pageNum);
            const content = await page.getTextContent();
            const pageText = content.items
                .map((item) => (typeof item.str === 'string' ? item.str : ''))
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (pageText) {
                parts.push(pageText);
                total += pageText.length;
            }
            if (total >= MAX_EXTRACT_CHARS) break;
        }
        return parts.join('\n').trim();
    } finally {
        try { await doc.destroy(); } catch { /* best-effort cleanup */ }
    }
};

const stripHtml = (text) => text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeTextForAnalysis = (text) =>
    String(text ?? '')
        .replace(/\r/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

const extractThemes = (text) => {
    const freq = new Map();
    const tokens = text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? [];
    for (const token of tokens) {
        if (STOP_WORDS.has(token)) continue;
        freq.set(token, (freq.get(token) ?? 0) + 1);
    }
    return Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_THEME_COUNT)
        .map(([token]) => token);
};

const extractStatLines = (text) => {
    const lines = text
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
    const stats = [];
    for (const line of lines) {
        if (stats.length >= MAX_STATS_COUNT) break;
        const hasNumber = /\b\d[\d,.]*\b/.test(line);
        const hasUnit = /%|percent|x|kpi|roi|mrr|arr|ctr|cvr|cac|ltv|weeks?|months?|years?/i.test(line);
        if (hasNumber && hasUnit) stats.push(line.slice(0, 180));
    }
    return stats;
};

const deriveModuleImpacts = (text) => {
    const lower = text.toLowerCase();
    const impacts = [];
    const matches = (patterns) => patterns.some((p) => p.test(lower));
    if (matches([/\bbrand\b/, /\btone\b/, /\bpositioning\b/, /\bvoice\b/, /\bvisual\b/])) impacts.push('brand');
    if (matches([/\bseo\b/, /\bkeyword\b/, /\bserp\b/, /\bsearch\b/, /\borganic\b/])) impacts.push('seo');
    if (matches([/\boutreach\b/, /\bcold email\b/, /\bprospect\b/, /\bsequence\b/])) impacts.push('outreach');
    if (matches([/\bsocial\b/, /\blinkedin\b/, /\binstagram\b/, /\bpost\b/, /\bcontent calendar\b/])) impacts.push('social');
    if (matches([/\bads?\b/, /\bppc\b/, /\bmeta ads?\b/, /\bgoogle ads?\b/, /\bcampaign\b/])) impacts.push('ads');
    return impacts;
};

export const summarizeExtractedText = (text) => {
    const normalized = normalizeTextForAnalysis(text);
    if (!normalized) {
        return {
            extractedThemes: [],
            extractedStats: [],
            modulesLikelyImpacted: [],
        };
    }
    return {
        extractedThemes: extractThemes(normalized),
        extractedStats: extractStatLines(normalized),
        modulesLikelyImpacted: deriveModuleImpacts(normalized),
    };
};

export const canParseFileClientSide = (file) =>
    TEXT_TYPES.has(file.type) || TEXT_EXTENSIONS.test(file.name) || isPdf(file);

export const extractTextFromFile = async (file) => {
    if (!canParseFileClientSide(file)) {
        return {
            ok: false,
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            text: '',
            error: 'Binary file - text extraction deferred',
        };
    }

    try {
        let text;
        if (isPdf(file)) {
            text = await extractPdfText(file);
            if (!text) {
                // PDF is supported but yielded no extractable text (e.g. a scanned
                // image PDF). Mark as a real failure, not "deferred/unsupported".
                return {
                    ok: false,
                    name: file.name,
                    mimeType: file.type || 'application/pdf',
                    text: '',
                    error: 'No extractable text found (the PDF may be scanned/image-only)',
                };
            }
        } else {
            text = await readAsText(file);
            if (file.type === 'text/html' || /\.html?$/i.test(file.name)) {
                text = stripHtml(text);
            }
        }
        if (text.length > MAX_EXTRACT_CHARS) {
            text = `${text.slice(0, MAX_EXTRACT_CHARS)}\n…[truncated]`;
        }
        return {
            ok: true,
            name: file.name,
            mimeType: file.type || (isPdf(file) ? 'application/pdf' : 'text/plain'),
            text,
            error: null,
        };
    } catch (err) {
        return {
            ok: false,
            name: file.name,
            mimeType: file.type || '',
            text: '',
            error: err.message,
        };
    }
};

export const extractTextFromBlob = async ({ blob, name = 'file.txt', mimeType = '' }) => {
    const pseudoFile = new File([blob], name, { type: mimeType || blob?.type || 'text/plain' });
    return extractTextFromFile(pseudoFile);
};

export const buildFilesContextBlock = (fileTexts) => {
    if (!fileTexts?.length) return '';
    return fileTexts
        .filter((f) => f.text?.trim())
        .map((f) => `--- File: ${f.name} ---\n${f.text}`)
        .join('\n\n');
};
