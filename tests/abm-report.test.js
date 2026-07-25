import { describe, it, expect } from 'vitest';
import { buildReportHtml, buildBatchReportHtml } from '../src/lib/abmReport.js';

describe('buildReportHtml', () => {
    it('does not throw on sparse / empty / null results', () => {
        expect(() => buildReportHtml(null)).not.toThrow();
        expect(() => buildReportHtml({})).not.toThrow();
        expect(() => buildReportHtml({ account: {}, contacts: [] })).not.toThrow();
    });

    it('includes the account, brief, and contact fields', () => {
        const html = buildReportHtml(
            {
                account: { companyName: 'Acme Corp', icpFit: 'high', tier: 'enterprise', employeeSize: '5k' },
                contacts: [{ firstName: 'Jane', lastName: 'Doe', title: 'CTO', email: 'jane@acme.com', phone: '+1 555', fitScore: 88 }],
                researchBrief: 'Para one.\n\nPara two.',
                sources: [{ title: 'Site', url: 'https://acme.com' }],
            },
            { workspaceName: 'CloudVerse' },
        );
        expect(html).toContain('Acme Corp');
        expect(html).toContain('Jane Doe');
        expect(html).toContain('jane@acme.com');
        expect(html).toContain('+1 555');
        expect(html).toContain('Para one.');
        expect(html).toContain('CloudVerse');
    });

    it('escapes HTML to avoid injection in report fields', () => {
        const html = buildReportHtml({ account: { companyName: '<script>x</script>' }, contacts: [] });
        expect(html).not.toContain('<script>x</script>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('batch report handles empty and multiple accounts with page breaks', () => {
        expect(() => buildBatchReportHtml([])).not.toThrow();
        const html = buildBatchReportHtml([{ account: { companyName: 'Alpha' } }, { account: { companyName: 'Beta' } }]);
        expect(html).toContain('Alpha');
        expect(html).toContain('Beta');
        expect(html).toContain('page-break-after');
    });
});
