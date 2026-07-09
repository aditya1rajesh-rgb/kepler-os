// UTM tracking identity — the keystone of attribution. Every shippable asset
// carries a campaign-scoped UTM identity so outcomes (GA4 sessions/conversions,
// CRM leads) attribute back to the KEPLER campaign that produced it — even
// though we don't auto-publish: the moment the user ships the (copied) tagged
// link, the identity travels with it. See [[connector-architecture]].

const slugify = (s) =>
    String(s || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'campaign';

// Stable + readable utm_campaign value: a title slug plus the campaign's
// immutable id-prefix. The suffix is what attribution matches on, so renaming
// the campaign never breaks the linkage.
export const campaignUtm = (campaign) =>
    `${slugify(campaign?.title || campaign?.goal || 'campaign')}-${String(campaign?.id || '').slice(0, 8)}`;

// Match a GA4 sessionCampaignName (or any utm_campaign string) back to a KEPLER
// campaign by its immutable id-prefix suffix. Returns null when unattributable.
export const matchCampaign = (utmCampaignName, campaigns = []) => {
    const name = String(utmCampaignName || '').toLowerCase();
    if (!name) return null;
    return campaigns.find((c) => {
        const id8 = String(c?.id || '').slice(0, 8).toLowerCase();
        return id8 && name.endsWith(id8);
    }) || null;
};

// Match by scanning free text (e.g. a CRM record's Description, which we stamp
// with the campaign's utm on push) for a campaign's immutable id-suffix.
export const matchByText = (text, campaigns = []) => {
    const t = String(text || '').toLowerCase();
    if (!t) return null;
    return campaigns.find((c) => {
        const id8 = String(c?.id || '').slice(0, 8).toLowerCase();
        return id8 && t.includes(id8);
    }) || null;
};

// Channel → utm_medium mapping (GA4's default channel grouping keys off medium).
const MEDIUM = {
    google: 'cpc',
    meta: 'paid_social',
    linkedin: 'paid_social',
    x: 'social',
    email: 'email',
};

export const TRACKING_SOURCES = [
    { value: 'google', label: 'Google Ads' },
    { value: 'meta', label: 'Meta' },
    { value: 'linkedin', label: 'LinkedIn' },
    { value: 'x', label: 'X / Twitter' },
    { value: 'email', label: 'Email' },
];

// Build a UTM-tagged destination URL. Returns '' if baseUrl isn't a valid URL.
export const buildTrackedUrl = ({ baseUrl, source, campaign, content = '' }) => {
    let url;
    try {
        url = new URL(/^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`);
    } catch {
        return '';
    }
    url.searchParams.set('utm_source', source);
    url.searchParams.set('utm_medium', MEDIUM[source] || 'referral');
    url.searchParams.set('utm_campaign', campaignUtm(campaign));
    if (content) url.searchParams.set('utm_content', content);
    return url.toString();
};
