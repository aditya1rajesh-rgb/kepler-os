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

/** Standard permissive robots.txt that points crawlers at the sitemap. */
export const buildRobots = (sitemapUrl) =>
    `User-agent: *\nAllow: /\n${sitemapUrl ? `\nSitemap: ${sitemapUrl}\n` : ''}`;
