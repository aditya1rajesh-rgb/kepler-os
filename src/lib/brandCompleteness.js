/**
 * Brand-profile completeness - a transparent, deterministic checklist so users can
 * see exactly why the score is what it is and what to add to reach 100%.
 *
 * Measures the Brand Intelligence → Brand Overview + Business Details fields only.
 * ICPs / competitors / files are tracked separately (shown as their own cockpit facts),
 * so this score is specifically "how complete is the brand profile".
 */
export const BRAND_COMPLETENESS_ITEMS = [
    { key: 'overview', label: 'Business overview', check: (b) => Boolean(b.overview && b.overview.trim()) },
    { key: 'tagline', label: 'Tagline', check: (b) => Boolean(b.tagline && b.tagline.trim()) },
    { key: 'values', label: 'Brand values', check: (b) => (b.values?.length ?? 0) > 0 },
    { key: 'tone', label: 'Brand voice / tone', check: (b) => (b.tone?.length ?? 0) > 0 },
    { key: 'aesthetic', label: 'Aesthetic tags', check: (b) => (b.aesthetic?.length ?? 0) > 0 },
    {
        key: 'valueProp',
        label: 'Value proposition',
        check: (b) => Boolean(b.businessDetails?.valueProposition && b.businessDetails.valueProposition.trim()),
    },
    {
        key: 'products',
        label: 'Products / services',
        check: (b) => Boolean(b.businessDetails?.productsServices && b.businessDetails.productsServices.trim()),
    },
    {
        key: 'colors',
        label: 'Color identity',
        check: (b) =>
            Boolean(b.colorIdentity?.primaryColor && b.colorIdentity.primaryColor.trim()) ||
            (b.colors?.length ?? 0) > 0,
    },
];

export const computeBrandCompleteness = (brand) => {
    const b = brand ?? {};
    const items = BRAND_COMPLETENESS_ITEMS.map((item) => ({
        key: item.key,
        label: item.label,
        done: Boolean(item.check(b)),
    }));
    const done = items.filter((i) => i.done).length;
    const total = items.length;
    const percent = total ? Math.round((done / total) * 100) : 0;
    return { percent, done, total, items, missing: items.filter((i) => !i.done) };
};
