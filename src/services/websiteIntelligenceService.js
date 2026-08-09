import { DEMO_MODE } from '../demo/flag';
import { fetchDemoWebsiteContent } from '../demo/website';

const MAX_CONTENT_CHARS = 12000;
const WEBSITE_FETCH_TIMEOUT_MS = 12000;

const stripHtml = (html) =>
    String(html)
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const extractMeta = (html, name) => {
    const re = new RegExp(
        `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,
        'i'
    );
    const match = html.match(re);
    return match?.[1]?.trim() ?? '';
};

const extractTitle = (html) => {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match?.[1]?.trim() ?? '';
};

const truncate = (text, max = MAX_CONTENT_CHARS) =>
    text.length <= max ? text : `${text.slice(0, max)}\n…[truncated]`;

const fetchWithTimeout = async (url, options = {}, timeoutMs = WEBSITE_FETCH_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
        if (err?.name === 'AbortError') {
            throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
};

/**
 * Fetch readable website content for brand population.
 * Tries Jina Reader first (CORS-friendly), then direct fetch as fallback.
 */
export const normalizeUrl = (url) => {
    const trimmed = String(url ?? '').trim();
    if (!trimmed) return '';
    const candidate = /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed.replace(/^\/+/, '')}`;
    try {
        const parsed = new URL(candidate);
        if (!parsed.hostname) return '';
        return `${parsed.protocol}//${parsed.host}${parsed.pathname || '/'}`.replace(/\/+$/, '');
    } catch {
        return '';
    }
};

const buildCandidateUrls = (normalized) => {
    if (!normalized) return [];
    const out = new Set([normalized]);
    try {
        const parsed = new URL(normalized);
        if (!parsed.hostname.startsWith('www.')) {
            out.add(`${parsed.protocol}//www.${parsed.hostname}`);
        }
        if (parsed.protocol === 'https:') {
            out.add(`http://${parsed.hostname}`);
        }
    } catch {
        // normalized already validated; ignore.
    }
    return Array.from(out);
};

export const fetchWebsiteContent = async (url) => {
    // The demo build reads its own site snapshot instead of reaching the network,
    // so website-grounded features work with no connectivity at all.
    if (DEMO_MODE) return fetchDemoWebsiteContent(url);

    const normalized = normalizeUrl(url);
    if (!normalized) {
        return {
            ok: false,
            url: '',
            source: null,
            title: '',
            description: '',
            bodyText: '',
            errors: ['invalid URL normalization'],
        };
    }

    const candidates = buildCandidateUrls(normalized);
    const errors = [];

    for (const candidate of candidates) {
        // Jina Reader - expects the RAW target URL in the path (no percent-encoding),
        // e.g. https://r.jina.ai/https://example.com
        try {
            const jinaRes = await fetchWithTimeout(`https://r.jina.ai/${candidate}`, {
                headers: { Accept: 'text/plain' },
            });
            if (jinaRes.ok) {
                const text = await jinaRes.text();
                if (text.trim().length > 80) {
                    return {
                        ok: true,
                        url: candidate,
                        source: 'jina',
                        title: text.split('\n')[0]?.replace(/^#+\s*/, '').trim() ?? '',
                        description: '',
                        bodyText: truncate(text),
                    };
                }
                errors.push(`empty page extraction (jina): ${candidate}`);
            } else {
                errors.push(`fetch failure (jina ${jinaRes.status}): ${candidate}`);
            }
        } catch (err) {
            errors.push(`fetch failure (jina): ${candidate} (${err.message})`);
        }

        // Direct fetch - works when target allows CORS
        try {
            const res = await fetchWithTimeout(candidate, { mode: 'cors' });
            if (res.ok) {
                const html = await res.text();
                const bodyText = truncate(stripHtml(html));
                if (bodyText.length > 40) {
                    return {
                        ok: true,
                        url: candidate,
                        source: 'direct',
                        title: extractTitle(html) || extractMeta(html, 'og:title'),
                        description: extractMeta(html, 'description') || extractMeta(html, 'og:description'),
                        bodyText,
                    };
                }
                errors.push(`empty page extraction (direct): ${candidate}`);
            } else {
                errors.push(`fetch failure (direct ${res.status}): ${candidate}`);
            }
        } catch (err) {
            errors.push(`fetch failure (direct): ${candidate} (${err.message})`);
        }
    }

    return {
        ok: false,
        url: candidates[0] ?? normalized,
        source: null,
        title: '',
        description: '',
        bodyText: '',
        errors,
    };
};

export const buildWebsiteContextBlock = (scrapeResult) => {
    if (!scrapeResult?.ok) return '';
    const parts = [
        scrapeResult.title && `Title: ${scrapeResult.title}`,
        scrapeResult.description && `Description: ${scrapeResult.description}`,
        scrapeResult.bodyText && `Page content:\n${scrapeResult.bodyText}`,
    ].filter(Boolean);
    return parts.join('\n\n');
};
