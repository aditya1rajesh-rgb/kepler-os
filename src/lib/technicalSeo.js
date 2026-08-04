// Deterministic technical-SEO generators (no AI): XML sitemap + robots.txt from
// the workspace's published blog set. Per-post JSON-LD schema is generated in the
// blog pipeline and exported from each blog's view.

const escapeXml = (s) =>
    String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

/** URL-safe slug from a title. */
export const slugify = (title) =>
    String(title ?? '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80) || 'post';

/** Ensure an https:// scheme and no trailing slash. Returns '' for empty input. */
export const normalizeBaseUrl = (url) => {
    const u = String(url ?? '').trim().replace(/\/+$/, '');
    if (!u) return '';
    return /^https?:\/\//i.test(u) ? u : `https://${u}`;
};

/**
 * Build a valid urlset XML sitemap.
 * @param {{loc:string, lastmod?:string}[]} entries
 */
export const buildSitemap = (entries = []) => {
    const urls = entries
        .filter((e) => e?.loc)
        .map((e) => `  <url>\n    <loc>${escapeXml(e.loc)}</loc>${e.lastmod ? `\n    <lastmod>${escapeXml(e.lastmod)}</lastmod>` : ''}\n  </url>`)
        .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
};

// AI answer-engine crawlers worth explicitly welcoming for AEO (WS4-tech). Being
// crawlable by these is a prerequisite for being CITED. Bingbot matters extra now
// that ChatGPT leans on Bing's index (2026). Listed as ALLOW — the goal is citation.
export const AI_BOTS = [
    'OAI-SearchBot',      // OpenAI search (ChatGPT citations)
    'ChatGPT-User',       // ChatGPT live browsing
    'GPTBot',             // OpenAI crawler
    'PerplexityBot',      // Perplexity
    'ClaudeBot',          // Anthropic crawler
    'Claude-Web',         // Anthropic browsing
    'Google-Extended',    // Google AI Overviews / Gemini
    'Applebot-Extended',  // Apple Intelligence
    'Bingbot',            // Bing (ChatGPT retrieval)
    'CCBot',              // Common Crawl (feeds many LLMs)
];

/**
 * robots.txt pointing crawlers at the sitemap. With aiBots (default) it adds
 * explicit Allow blocks welcoming AI answer-engine crawlers — crawlability is a
 * prerequisite for AI citation.
 */
export const buildRobots = (sitemapUrl, { aiBots = true } = {}) => {
    const blocks = ['User-agent: *', 'Allow: /'];
    if (aiBots) for (const bot of AI_BOTS) blocks.push('', `User-agent: ${bot}`, 'Allow: /');
    let out = `${blocks.join('\n')}\n`;
    if (sitemapUrl) out += `\nSitemap: ${sitemapUrl}\n`;
    return out;
};

/**
 * Build an llms.txt (llmstxt.org spec) — a machine-readable map of the site for
 * AI answer engines: title, one-line summary, and key pages with links.
 * @param {{brandName?:string, baseUrl?:string, summary?:string, pages?:{loc:string,title?:string,description?:string}[]}} opts
 */
export const buildLlmsTxt = ({ brandName = '', baseUrl = '', summary = '', pages = [] } = {}) => {
    const lines = [`# ${brandName || 'Site'}`, ''];
    if (summary) lines.push(`> ${String(summary).replace(/\s+/g, ' ').trim().slice(0, 300)}`, '');
    const base = normalizeBaseUrl(baseUrl);
    if (base) lines.push(`Canonical site: ${base}`, '');
    const valid = pages.filter((p) => p?.loc);
    if (valid.length) {
        lines.push('## Key pages', '');
        for (const p of valid) lines.push(`- [${p.title || p.loc}](${p.loc})${p.description ? `: ${String(p.description).slice(0, 160)}` : ''}`);
        lines.push('');
    }
    return `${lines.join('\n').trim()}\n`;
};

/** Generate an IndexNow key (32 hex chars; IndexNow accepts 8-128). */
export const generateIndexNowKey = () => {
    const bytes = new Uint8Array(16);
    (globalThis.crypto ?? crypto).getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** The key file to host at the site root so IndexNow can verify ownership. */
export const indexNowKeyFile = (key) => ({ name: `${key}.txt`, content: `${key}\n` });

/**
 * Build the IndexNow submission (endpoint + JSON body) to ping Bing/Yandex when
 * content changes. The user hosts the key file, then POSTs this body.
 */
export const buildIndexNowPayload = (baseUrl, key, urls = []) => {
    const base = normalizeBaseUrl(baseUrl);
    let host = '';
    try { host = base ? new URL(base).host : ''; } catch { host = ''; }
    return {
        endpoint: 'https://api.indexnow.org/indexnow',
        body: {
            host,
            key,
            keyLocation: base && key ? `${base}/${key}.txt` : '',
            urlList: urls.filter(Boolean),
        },
    };
};

/**
 * GEO-readiness checklist derived from the completed content set. Pure.
 * @param {Array<{aeo?:object,schema?:object}>} blogs completed blog payloads
 */
export const buildGeoReadiness = (blogs = []) => {
    const n = blogs.length;
    const half = Math.ceil(n / 2);
    const cited = blogs.filter((b) => (b?.aeo?.signals?.citationCount ?? 0) > 0).length;
    const strong = blogs.filter((b) => (b?.aeo?.overall ?? 0) >= 70).length;
    const schema = blogs.filter((b) => b?.schema).length;
    return [
        { label: 'Content published', done: n > 0, detail: `${n} completed piece${n === 1 ? '' : 's'}` },
        { label: 'Structured schema', done: n > 0 && schema === n, detail: `${schema}/${n} carry JSON-LD` },
        { label: 'Cites real sources', done: n > 0 && cited >= half, detail: `${cited}/${n} cite sources` },
        { label: 'AEO-strong (≥70)', done: n > 0 && strong >= half, detail: `${strong}/${n} score ≥70` },
        { label: 'AI crawlers welcomed', done: true, detail: 'robots.txt allows AI answer-engine bots' },
    ];
};
