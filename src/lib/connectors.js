// Connector registry - the single source of truth for external integrations.
//
// DUAL ARCHITECTURE: connectors are PURE UPSIDE. The app's base quality never
// depends on them - every module works AI-only with no connection. When a
// workspace connects one, that module's output gets grounded in real data.
//
// `status`:
//   'available' - backend is built + wired (real connect/status/use).
//   'planned'   - UI placeholder; backend not built yet (shows "Coming soon").
// `authType`:
//   'oauth'  - click Connect → provider consent (platform registers the app once).
//   'apiKey' - user pastes a key/token in a modal (`fields`); fully self-serve.
// Flip 'planned' → 'available' and add its adapter when the backend lands.

export const CONNECTORS = [
    {
        id: 'gsc',
        label: 'Google Search Console',
        category: 'Search',
        enhances: 'SEO & AEO',
        status: 'available',
        authType: 'oauth',
        family: 'google',
        oauth: { scopes: ['https://www.googleapis.com/auth/webmasters.readonly'] },
        description: 'Real search performance - queries, impressions, clicks, and positions - so keyword picks use live demand, not estimates.',
    },
    {
        id: 'hubspot',
        label: 'HubSpot',
        category: 'CRM',
        enhances: 'Outreach',
        status: 'available',
        authType: 'apiKey',
        fields: [
            { key: 'apiKey', label: 'Private app access token', type: 'password', help: 'HubSpot → Settings → Integrations → Private Apps → your app → Access token' },
        ],
        helpUrl: 'https://developers.hubspot.com/docs/api/private-apps',
        description: 'Contacts, lists, and lifecycle stages to target outreach at the right accounts.',
    },
    {
        id: 'meta-ad-library',
        label: 'Meta Ad Library',
        category: 'Ad intelligence',
        enhances: 'Ad Campaigns',
        status: 'available',
        authType: 'oauth',
        family: 'meta',
        oauth: { scopes: ['ads_read'] },
        helpUrl: 'https://developers.facebook.com/docs/graph-api/reference/ads_archive/',
        description: "Competitors' live ads, so generated creative is grounded in what rivals actually run.",
    },
    {
        id: 'ga4',
        label: 'Google Analytics 4',
        category: 'Analytics',
        enhances: 'Overview & measurement',
        status: 'available',
        authType: 'oauth',
        family: 'google',
        oauth: { scopes: ['https://www.googleapis.com/auth/analytics.readonly'] },
        helpUrl: 'https://developers.google.com/analytics/devguides/reporting/data/v1',
        description: 'Site + funnel analytics to measure which content and campaigns actually convert.',
    },
    {
        id: 'google-ads',
        label: 'Google Ads',
        category: 'Paid media',
        enhances: 'Ad Campaigns',
        status: 'available',
        authType: 'oauth',
        family: 'google',
        oauth: { scopes: ['https://www.googleapis.com/auth/adwords'] },
        helpUrl: 'https://developers.google.com/google-ads/api/docs/get-started/dev-token',
        // NOTE: querying the Google Ads API also needs a Google-approved developer
        // token (GOOGLE_ADS_DEVELOPER_TOKEN secret) - connecting works without it,
        // but pulling data requires that approval.
        description: 'Live campaign performance + keyword/cost data to sharpen paid strategy.',
    },
    {
        id: 'meta-ads',
        label: 'Meta Ads',
        category: 'Paid media',
        enhances: 'Ad Campaigns',
        status: 'available',
        authType: 'oauth',
        family: 'meta',
        oauth: { scopes: ['ads_read'] },
        helpUrl: 'https://developers.facebook.com/docs/marketing-api/insights',
        // NOTE: ads_read in production needs Meta App Review - connecting works in
        // dev mode / for your own ad account before review.
        description: 'Facebook & Instagram ad performance to inform creative and spend.',
    },
    {
        id: 'zoho',
        label: 'Zoho CRM',
        category: 'CRM',
        enhances: 'Outreach',
        status: 'available',
        // Zoho is OAuth 2.0 (no static key), but we use the Self Client flow so it
        // stays self-serve: paste client id/secret + a freshly generated grant
        // token; the edge fn exchanges it once for a permanent refresh token.
        authType: 'apiKey',
        fields: [
            {
                key: 'dc',
                label: 'Data center',
                type: 'select',
                options: [
                    { value: 'us', label: 'United States (.com)' },
                    { value: 'eu', label: 'Europe (.eu)' },
                    { value: 'in', label: 'India (.in)' },
                    { value: 'au', label: 'Australia (.com.au)' },
                    { value: 'jp', label: 'Japan (.jp)' },
                    { value: 'ca', label: 'Canada (.ca)' },
                ],
                help: 'The region your Zoho account lives in - check the domain of your Zoho URL.',
            },
            { key: 'clientId', label: 'Client ID', type: 'text', help: 'api-console.zoho.com → your Self Client → Client ID' },
            { key: 'clientSecret', label: 'Client secret', type: 'password', help: 'Same Self Client → Client Secret' },
            {
                key: 'grantToken',
                label: 'Grant token (code)',
                type: 'password',
                help: 'Self Client → Generate Code, scopes: ZohoCRM.modules.contacts.ALL,ZohoCRM.modules.leads.ALL,ZohoCRM.modules.deals.READ,ZohoCRM.modules.tasks.ALL,ZohoCRM.modules.emails.READ,ZohoCRM.send_mail.all.CREATE,ZohoCRM.users.READ - then paste it and connect within a few minutes (it expires fast).',
            },
        ],
        helpUrl: 'https://www.zoho.com/crm/developer/docs/api/v7/register-client.html',
        description: 'Push outreach sequences into your CRM, and send approved warm follow-ups from your Zoho identity - every send logged against the contact.',
    },
    {
        id: 'apollo',
        label: 'Apollo',
        category: 'Prospecting',
        enhances: 'Outreach',
        status: 'available',
        authType: 'apiKey',
        fields: [
            { key: 'apiKey', label: 'API key', type: 'password', help: 'Apollo → Settings → Integrations → API, then create a new key' },
        ],
        helpUrl: 'https://docs.apollo.io/docs/create-api-key',
        description: 'Prospect and enrich B2B contact data to build targeted outreach lists.',
    },
    {
        id: 'meta-pages',
        label: 'Facebook & Instagram',
        category: 'Publishing',
        enhances: 'Social Media',
        status: 'available',
        authType: 'oauth',
        family: 'meta',
        // Standard Access covers your OWN Page/IG with no review; posting to
        // clients' accounts needs Meta App Review (Advanced Access) — see
        // memory [[app-review-requirements]]. IG needs a Business/Creator
        // account linked to the Page.
        oauth: { scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish'] },
        helpUrl: 'https://developers.facebook.com/docs/pages-api/posts/',
        description: 'Publish to your Facebook Page and Instagram, and pull past posts with their engagement.',
    },
    {
        id: 'linkedin',
        label: 'LinkedIn',
        category: 'Publishing',
        enhances: 'Social Media',
        status: 'available',
        authType: 'oauth',
        family: 'linkedin',
        // openid + profile → the member's Person URN (post author); w_member_social
        // → publish on their behalf. Personal-profile posting is self-serve (no
        // LinkedIn app review); company-Page posting is a later, gated tier.
        oauth: { scopes: ['openid', 'profile', 'w_member_social'] },
        helpUrl: 'https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin',
        description: 'Publish posts straight to your LinkedIn profile - no copy-paste, and each post carries campaign attribution.',
    },
    {
        id: 'wordpress',
        label: 'WordPress',
        category: 'Publishing',
        enhances: 'SEO & AEO',
        status: 'available',
        authType: 'apiKey',
        fields: [
            { key: 'siteUrl', label: 'Site URL', type: 'text', help: 'e.g. https://yourblog.com (self-hosted, or WordPress.com with the REST API enabled)' },
            { key: 'username', label: 'Username', type: 'text', help: 'Your WordPress username' },
            { key: 'appPassword', label: 'Application password', type: 'password', help: 'WordPress → Users → Profile → Application Passwords → Add New Application Password' },
        ],
        helpUrl: 'https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/',
        description: 'Publish approved posts straight to your WordPress site as drafts for a final review before they go live.',
    },
    {
        id: 'salesforce',
        label: 'Salesforce',
        category: 'CRM',
        enhances: 'Outreach',
        status: 'available',
        // Self-serve username-password OAuth flow (like Zoho/HubSpot): paste a
        // Connected App's key/secret + login. The org must enable OAuth
        // username-password flows for this to authenticate.
        authType: 'apiKey',
        fields: [
            { key: 'loginUrl', label: 'Login URL', type: 'text', help: 'Blank for production (login.salesforce.com), https://test.salesforce.com for a sandbox, or your My Domain URL.' },
            { key: 'clientId', label: 'Consumer Key', type: 'text', help: 'Setup → App Manager → your Connected App → Manage Consumer Details → Consumer Key' },
            { key: 'clientSecret', label: 'Consumer Secret', type: 'password', help: 'Same Connected App → Consumer Secret' },
            { key: 'username', label: 'Username', type: 'text', help: 'Your Salesforce login username (usually an email)' },
            { key: 'password', label: 'Password', type: 'password', help: 'Your Salesforce password' },
            { key: 'securityToken', label: 'Security token', type: 'password', help: 'Salesforce → Settings → Reset My Security Token (emailed to you). Leave blank if your org whitelists this IP.' },
        ],
        helpUrl: 'https://help.salesforce.com/s/articleView?id=sf.connected_app_create_api_integration.htm',
        description: 'Push contacts and tasks, read contacts and leads for targeting, and pull closed-won revenue into Measurement.',
    },
];

export const AVAILABLE_CONNECTOR_IDS = CONNECTORS.filter((c) => c.status === 'available').map((c) => c.id);

// OAuth provider families - the consent-URL shape shared by every connector in a
// family. Client id/secret + redirect live in env (one app per family, reused
// across its connectors); only the requested `scopes` differ per connector.
export const OAUTH_FAMILIES = {
    google: {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        // access_type=offline + prompt=consent guarantee a refresh token.
        authParams: { response_type: 'code', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    },
    meta: {
        authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
        authParams: { response_type: 'code' },
    },
    linkedin: {
        authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
        authParams: { response_type: 'code' },
    },
};
