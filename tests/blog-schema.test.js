import { describe, expect, it } from 'vitest';
import { buildBlogSchema } from '../src/lib/blogSchema.js';

const nodes = (schema) => schema['@graph'];
const nodeOfType = (schema, type) => nodes(schema).find((n) => n['@type'] === type);

describe('buildBlogSchema', () => {
    const draft = {
        title: 'The Complete Guide to X',
        metaDescription: 'A guide to X.',
        tags: ['x', 'y'],
        sections: [{ h2: 'Step one', body: 'do this' }, { h2: 'Step two', body: 'then this' }],
        faq: [{ q: 'What is X?', a: 'X is a thing.' }],
    };

    it('emits a valid @context + @graph', () => {
        const s = buildBlogSchema(draft, { brandName: 'Acme' });
        expect(s['@context']).toBe('https://schema.org');
        expect(Array.isArray(s['@graph'])).toBe(true);
    });

    it('defaults author to Organization (never a fabricated person)', () => {
        const s = buildBlogSchema(draft, { brandName: 'Acme' });
        expect(nodeOfType(s, 'BlogPosting').author).toMatchObject({ '@type': 'Organization', name: 'Acme' });
    });

    it('uses a Person author when a REAL one is supplied', () => {
        const s = buildBlogSchema(draft, { brandName: 'Acme', author: { name: 'Jo Rivera', jobTitle: 'Head of SEO' } });
        expect(nodeOfType(s, 'BlogPosting').author).toMatchObject({ '@type': 'Person', name: 'Jo Rivera', jobTitle: 'Head of SEO' });
    });

    it('picks HowTo for how-to intent and emits steps', () => {
        const s = buildBlogSchema(draft, { brandName: 'Acme', intent: 'how-to' });
        const howto = nodeOfType(s, 'HowTo');
        expect(howto).toBeTruthy();
        expect(howto.step).toHaveLength(2);
        expect(howto.step[0]).toMatchObject({ '@type': 'HowToStep', position: 1, name: 'Step one' });
    });

    it('adds BreadcrumbList + mainEntityOfPage only when a brand URL exists', () => {
        const withUrl = buildBlogSchema(draft, { brandName: 'Acme', brandUrl: 'https://acme.com/' });
        expect(nodeOfType(withUrl, 'BreadcrumbList')).toBeTruthy();
        expect(nodeOfType(withUrl, 'BlogPosting').mainEntityOfPage['@id']).toBe('https://acme.com/blog');

        const noUrl = buildBlogSchema(draft, { brandName: 'Acme' });
        expect(nodeOfType(noUrl, 'BreadcrumbList')).toBeUndefined();
    });

    it('includes an FAQPage when faq is present', () => {
        const s = buildBlogSchema(draft, { brandName: 'Acme' });
        const faq = nodeOfType(s, 'FAQPage');
        expect(faq.mainEntity[0]).toMatchObject({ '@type': 'Question', name: 'What is X?' });
    });

    it('omits FAQPage when there is no faq', () => {
        const s = buildBlogSchema({ ...draft, faq: [] }, { brandName: 'Acme' });
        expect(nodeOfType(s, 'FAQPage')).toBeUndefined();
    });
});
