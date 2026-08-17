// What a connector capability DOES, and what the provider calls the permission
// behind it.
//
// The needs-attention modal exists because a card cannot show requested versus
// granted. It reports capabilities, never raw scopes: those are machine values
// (`https://www.googleapis.com/auth/adwords`, `ads_management`) and a marketer
// cannot act on them.

/**
 * Provider-facing permission names. This is the word the user will actually see
 * on the consent screen, which is the one piece of scope detail worth surfacing.
 *
 * `kepler:*` entries are deliberately ABSENT. They are internal markers Kepler
 * invented to represent its own gating (the Google Ads developer-token tier), not
 * anything a provider grants - presenting them as a provider permission would
 * blame Google for a gate that is ours. `internalGate` below carries those.
 */
const PROVIDER_PERMISSION = {
    ads_read: 'Ads Read',
    ads_management: 'Ads Management',
    pages_show_list: 'Pages Show List',
    pages_read_engagement: 'Pages Read Engagement',
    pages_manage_posts: 'Pages Manage Posts',
    instagram_basic: 'Instagram Basic',
    instagram_content_publish: 'Instagram Content Publish',
    w_member_social: 'Share on LinkedIn',
    openid: 'Sign in with LinkedIn',
    profile: 'Sign in with LinkedIn',
    'https://www.googleapis.com/auth/adwords': 'Google Ads API access',
    'https://www.googleapis.com/auth/webmasters.readonly': 'Search Console (read-only)',
    'https://www.googleapis.com/auth/analytics.readonly': 'Analytics (read-only)',
};

const PROVIDER_NAME = {
    google: 'Google', meta: 'Meta', linkedin: 'LinkedIn',
};

/** A scope Kepler invented for its own gating, and why it is not granted yet. */
const INTERNAL_GATE = {
    'kepler:google-ads-write': 'Kepler needs a Google-approved production developer token to write campaigns. That approval is ours to obtain, not yours to grant.',
    'kepler:google-ads-targeting': 'Kepler needs a Google-approved production developer token to manage targeting. That approval is ours to obtain, not yours to grant.',
};

export const isInternalScope = (scope) => String(scope).startsWith('kepler:');

/**
 * The provider's own name for the permissions behind one capability, as a
 * sentence. Returns '' when every missing scope is an internal gate.
 */
export const providerPermissionLine = (connector, missing = []) => {
    const names = [...new Set(
        missing.filter((s) => !isInternalScope(s)).map((s) => PROVIDER_PERMISSION[s]).filter(Boolean),
    )];
    if (!names.length) return '';
    const provider = PROVIDER_NAME[connector?.family] ?? 'The provider';
    const list = names.length > 1
        ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
        : names[0];
    return `${provider} calls ${names.length > 1 ? 'these permissions' : 'this permission'} ${list}.`;
};

/** The internal-gate explanation, when the shortfall is Kepler's own. */
export const internalGateLine = (missing = []) => {
    for (const s of missing) {
        if (INTERNAL_GATE[s]) return INTERNAL_GATE[s];
    }
    return '';
};

/**
 * What a capability lets Kepler do, per connector. Specific where it matters;
 * otherwise built from the module the connector feeds, which the registry already
 * states, rather than invented.
 */
const PURPOSE = {
    gsc: { read: 'Reads your search performance: queries, impressions, clicks and positions.' },
    ga4: { read: 'Reads site and funnel analytics, so Measurement can attribute conversions.' },
    hubspot: { read: 'Reads contacts, lists and lifecycle stages to target outreach.' },
    apollo: { read: 'Searches for prospects and reveals verified emails and phone numbers.' },
    'meta-ad-library': { read: "Reads competitors' live ads, so generated creative is grounded in them." },
    'google-ads': {
        read: 'Reads campaign performance, keywords and cost data.',
        write: 'Creates and updates campaigns in Google Ads.',
        targeting: 'Builds and updates audience targeting on Google Ads.',
    },
    'meta-ads': {
        read: 'Reads your Facebook and Instagram ad performance.',
        write: 'Pushes campaigns and creative to Meta Ads.',
        targeting: 'Builds and updates audience targeting on Meta.',
    },
    'meta-pages': {
        read: 'Reads your Pages and their past posts, with engagement.',
        write: 'Publishes posts to your Facebook Page and Instagram.',
    },
    linkedin: {
        read: 'Identifies you as the post author.',
        write: 'Publishes posts to your LinkedIn profile.',
    },
    wordpress: { write: 'Publishes approved posts to your site as drafts.' },
    zoho: {
        read: 'Reads contacts, leads and deals for targeting.',
        write: 'Pushes outreach into your CRM and logs every send against the contact.',
    },
    salesforce: {
        read: 'Reads contacts and leads for targeting, and closed-won revenue for Measurement.',
        write: 'Pushes contacts and tasks into Salesforce.',
    },
};

const GENERIC = {
    read: (c) => `Reads data from ${c.label} to ground ${c.enhances}.`,
    write: (c) => `Sends work from Kepler into ${c.label}.`,
    targeting: (c) => `Builds and updates audience targeting in ${c.label}.`,
};

export const capabilityPurpose = (connector, capabilityId) =>
    PURPOSE[connector?.id]?.[capabilityId]
    ?? GENERIC[capabilityId]?.(connector ?? { label: 'this provider', enhances: 'Kepler' })
    ?? '';

/**
 * The consequence of a shortfall, named in terms of the module the user works in.
 * This is the sentence the modal exists for: not "a scope is missing" but "this
 * is what you cannot do".
 */
export const shortfallConsequence = (connector, missingCaps = []) => {
    if (!missingCaps.length) return '';
    const ids = missingCaps.map((c) => c.id);
    const mod = connector?.enhances ?? 'Kepler';
    const canRead = !ids.includes('read');
    const cannot = [];
    // Single verb per item: "publish or push from Kepler" plus a second item
    // produced "publish or push from Kepler or build targeting".
    if (ids.includes('write')) cannot.push('publish from Kepler');
    if (ids.includes('targeting')) cannot.push('build targeting');
    if (ids.includes('read')) cannot.push('read your data');
    const list = cannot.length > 1
        ? `${cannot.slice(0, -1).join(', ')} or ${cannot[cannot.length - 1]}`
        : cannot[0];
    return canRead
        ? `${mod} can still read from this connection. It cannot ${list}, and an attempt would fail at that point rather than now.`
        : `${mod} cannot ${list} through this connection.`;
};

/** Requested / Granted / Not recorded - three states, because null is not false. */
export const GRANT_STATE = {
    granted: { label: 'Granted', tone: 'ok' },
    refused: { label: 'Not granted', tone: 'bad' },
    unknown: { label: 'Not recorded', tone: 'dim' },
    requested: { label: 'Requested', tone: 'info' },
};

export const grantStateOf = (cap) => {
    if (cap.granted === true) return 'granted';
    if (cap.granted === false && cap.missing?.length) return 'refused';
    if (cap.granted === null) return 'unknown';
    return cap.granted === false ? 'refused' : 'unknown';
};
