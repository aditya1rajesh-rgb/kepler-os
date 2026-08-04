// Blog JSON-LD schema builder (WS3). Deeper than the old BlogPosting+FAQPage:
// picks BlogPosting vs HowTo by intent, adds a BreadcrumbList, real publisher +
// author E-E-A-T signals, and richer article metadata (keywords, language,
// mainEntityOfPage). Pure + unit-tested (tests/blog-schema.test.js).
//
// E-E-A-T honesty: author defaults to the Organization unless a REAL author
// Person is supplied — we never fabricate a named human author.

const str = (v, max = 300) => String(v ?? '').trim().slice(0, max);

const isHowTo = ({ intent = '', targetKeyword = '', title = '' }) =>
    // HowTo is for genuine step-by-step instruction — "how to" / "step by step" /
    // "tutorial", or an explicit how-to intent. NOT any title containing "guide".
    /\bhow[\s-]?to\b|step[\s-]?by[\s-]?step|\btutorial\b/i.test(`${intent} ${targetKeyword} ${title}`);

const authorNode = (author, brandName) => {
    const name = str(author?.name, 120);
    if (!name) return { '@type': 'Organization', name: brandName || 'Brand' };
    return {
        '@type': 'Person',
        name,
        ...(author.jobTitle ? { jobTitle: str(author.jobTitle, 120) } : {}),
        ...(author.url ? { url: str(author.url, 300) } : {}),
        ...(author.sameAs?.length ? { sameAs: author.sameAs.map((u) => str(u, 300)).filter(Boolean) } : {}),
    };
};

/**
 * Build a JSON-LD @graph for a generated blog draft.
 * @param {object} draft { title, metaDescription, tags, sections, faq }
 * @param {object} meta { brandName, brandUrl?, author?, intent?, targetKeyword? }
 * @returns {object} schema.org @graph document
 */
export const buildBlogSchema = (draft = {}, meta = {}) => {
    const { brandName = 'Brand', brandUrl = '', author = null, intent = '', targetKeyword = '' } = meta;
    const now = new Date().toISOString();
    const url = str(brandUrl, 300).replace(/\/$/, '');
    const howTo = isHowTo({ intent, targetKeyword, title: draft.title });

    const publisher = { '@type': 'Organization', name: brandName || 'Brand', ...(url ? { url } : {}) };

    const main = {
        '@type': howTo ? 'HowTo' : 'BlogPosting',
        headline: str(draft.title, 110),
        description: str(draft.metaDescription, 160),
        author: authorNode(author, brandName),
        publisher,
        datePublished: now,
        dateModified: now,
        inLanguage: 'en',
        ...(url ? { mainEntityOfPage: { '@type': 'WebPage', '@id': `${url}/blog` } } : {}),
        ...(Array.isArray(draft.tags) && draft.tags.length ? { keywords: draft.tags.map((t) => str(t, 60)).filter(Boolean).join(', ') } : {}),
    };

    if (howTo) {
        main.step = (draft.sections ?? []).map((s, i) => ({
            '@type': 'HowToStep',
            position: i + 1,
            name: str(s?.h2, 110),
            text: str(s?.body, 500),
        }));
    }

    const graph = [main];

    if (url) {
        graph.push({
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Blog', item: `${url}/blog` },
                { '@type': 'ListItem', position: 2, name: str(draft.title, 110) },
            ],
        });
    }

    if (Array.isArray(draft.faq) && draft.faq.length) {
        graph.push({
            '@type': 'FAQPage',
            mainEntity: draft.faq.map((item) => ({
                '@type': 'Question',
                name: str(item?.q, 300),
                acceptedAnswer: { '@type': 'Answer', text: str(item?.a, 1200) },
            })),
        });
    }

    return { '@context': 'https://schema.org', '@graph': graph };
};
