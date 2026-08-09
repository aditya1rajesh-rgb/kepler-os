/**
 * Search Console rows — the fuel for the GSC operator loop (striking distance,
 * decay, low CTR, cannibalisation, dead pages).
 *
 * Rows are shaped deliberately so each opportunity type actually fires:
 * positions 11-20 with real impressions (striking distance), page-1 terms with
 * CTR well below the curve, two pages competing for one query (cannibalisation),
 * and published pages with impressions but no clicks (dead).
 */
export const GSC_PROPERTY = 'sc-domain:ken42.com';

const row = (query, impressions, clicks, position) => ({
    keys: [query],
    query,
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position,
});

export const GSC_QUERY_ROWS = [
    // Winning terms
    row('naac evidence collection', 11240, 1043, 3.1),
    row('naac documentation process', 4210, 302, 4.4),
    row('switch admissions software mid cycle', 3184, 261, 4.2),
    row('campus management platform vs admissions crm', 6120, 402, 6.8),

    // Striking distance — positions 11-20 with volume (the money list)
    row('campus management software india', 18420, 214, 12.4),
    row('best admissions software for universities', 9840, 96, 13.8),
    row('student information system india', 7620, 61, 14.9),
    row('university erp software', 12180, 108, 11.6),
    row('admission management software', 15340, 142, 12.9),
    row('college management system software', 8960, 74, 15.2),
    row('nirf 2026 parameters', 22400, 188, 16.4),
    row('fee management software for colleges', 5240, 41, 13.1),
    row('naac accreditation software', 4820, 52, 11.9),
    row('placement management software', 3640, 24, 17.8),

    // Page 1 but under-clicked (low-CTR opportunities)
    row('ken42', 6420, 214, 2.4),
    row('ken42 pricing', 1840, 38, 3.8),
    row('ken42 vs meritto', 1240, 22, 4.6),
    row('kenroll admissions', 940, 18, 3.2),
    row('ai native campus management', 2180, 42, 5.1),
    row('higher education crm india', 8420, 168, 7.4),

    // Decay candidates (were stronger last period — priorPeriod() inflates these)
    row('admissions crm comparison', 4120, 96, 9.8),
    row('education erp comparison', 3210, 62, 10.4),
    row('digital campus transformation', 2840, 44, 12.1),

    // Long tail
    row('how to reduce admissions cycle time', 1420, 118, 3.4),
    row('naac criteria 1 evidence', 1180, 84, 4.1),
    row('aicte reporting software', 960, 46, 6.2),
    row('student lifecycle management platform', 1640, 58, 8.4),
    row('whatsapp student communication compliance', 820, 34, 7.8),
    row('multi campus erp', 1240, 28, 11.2),
    row('dpdp compliance education', 640, 22, 9.4),
    row('scholarship management software india', 1080, 26, 12.8),
    row('hostel management system', 2420, 18, 18.4),
    row('exam management software india', 1840, 32, 13.6),
    row('faculty workload management', 720, 14, 14.2),
    row('alumni engagement platform india', 540, 12, 15.8),
    row('online admission form software', 6820, 84, 16.2),
    row('counsellor productivity admissions', 380, 24, 6.4),
    row('campus management software pricing india', 2140, 46, 11.4),
    row('student information system vs erp', 3420, 38, 14.6),
];

const pageRow = (query, page, impressions, clicks, position) => ({
    keys: [query, page],
    query,
    page,
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position,
});

const BLOG = 'https://ken42.com/blog';

export const GSC_PAGE_ROWS = [
    // Healthy pages
    pageRow('naac evidence collection', `${BLOG}/naac-evidence-collection`, 11240, 1043, 3.1),
    pageRow('naac documentation process', `${BLOG}/naac-evidence-collection`, 4210, 302, 4.4),
    pageRow('naac criteria 1 evidence', `${BLOG}/naac-evidence-collection`, 1180, 84, 4.1),
    pageRow('switch admissions software mid cycle', `${BLOG}/switch-admissions-software-mid-cycle`, 3184, 261, 4.2),
    pageRow('how to reduce admissions cycle time', `${BLOG}/switch-admissions-software-mid-cycle`, 1420, 118, 3.4),
    pageRow('campus management platform vs admissions crm', `${BLOG}/campus-management-platform-vs-admissions-crm`, 6120, 402, 6.8),

    // Cannibalisation — two pages competing for the same head term
    pageRow('campus management software india', 'https://ken42.com/platform', 9840, 122, 11.8),
    pageRow('campus management software india', `${BLOG}/campus-management-platform-vs-admissions-crm`, 8580, 92, 13.2),
    pageRow('university erp software', 'https://ken42.com/platform', 6420, 68, 11.2),
    pageRow('university erp software', 'https://ken42.com/solutions/university', 5760, 40, 12.4),

    // Dead pages — impressions, effectively no clicks
    pageRow('hostel management system', 'https://ken42.com/platform/kenops', 2420, 18, 18.4),
    pageRow('alumni engagement platform india', 'https://ken42.com/platform/kencareers', 540, 12, 15.8),
    pageRow('faculty workload management', 'https://ken42.com/platform/kenlearn', 720, 14, 14.2),
    pageRow('online admission form software', 'https://ken42.com/platform/kenroll', 6820, 84, 16.2),

    // Brand + product pages
    pageRow('ken42', 'https://ken42.com/', 6420, 214, 2.4),
    pageRow('ken42 pricing', 'https://ken42.com/pricing', 1840, 38, 3.8),
    pageRow('ken42 vs meritto', 'https://ken42.com/', 1240, 22, 4.6),
    pageRow('kenroll admissions', 'https://ken42.com/platform/kenroll', 940, 18, 3.2),
    pageRow('ai native campus management', 'https://ken42.com/platform', 2180, 42, 5.1),
    pageRow('higher education crm india', `${BLOG}/campus-management-platform-vs-admissions-crm`, 8420, 168, 7.4),
    pageRow('best admissions software for universities', 'https://ken42.com/platform/kenroll', 9840, 96, 13.8),
    pageRow('student information system india', 'https://ken42.com/platform', 7620, 61, 14.9),
    pageRow('nirf 2026 parameters', `${BLOG}/naac-evidence-collection`, 22400, 188, 16.4),
    pageRow('fee management software for colleges', 'https://ken42.com/platform/kenfin', 5240, 41, 13.1),
    pageRow('naac accreditation software', 'https://ken42.com/platform/kencompliance', 4820, 52, 11.9),
    pageRow('placement management software', 'https://ken42.com/platform/kencareers', 3640, 24, 17.8),
    pageRow('admissions crm comparison', `${BLOG}/campus-management-platform-vs-admissions-crm`, 4120, 96, 9.8),
    pageRow('campus management software pricing india', 'https://ken42.com/pricing', 2140, 46, 11.4),
    pageRow('student information system vs erp', 'https://ken42.com/platform', 3420, 38, 14.6),
];
