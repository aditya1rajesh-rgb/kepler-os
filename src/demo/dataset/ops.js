/**
 * Operational surfaces: connected integrations, the activity feed, quality
 * feedback, and published social posts with their engagement metrics.
 *
 * Every connector in the registry is shown connected — this demo answers the
 * question "what does Kepler look like when everything is wired up?".
 */
import { id } from '../ids';
import { DEMO_USER_ID, DEMO_WORKSPACE_ID } from './identity';
import { daysAgo, hoursAgo, minutesAgo } from './time';

const WS = DEMO_WORKSPACE_ID;

const integration = (provider, { propertyUrl = '', meta = {}, syncHoursAgo = 3, createdDaysAgo = 60 }) => ({
    id: id(`integration-${provider}`),
    workspace_id: WS,
    provider,
    refresh_token: '',
    property_url: propertyUrl,
    status: 'connected',
    meta,
    last_sync_at: hoursAgo(syncHoursAgo),
    last_error: '',
    credentials: {},
    created_at: daysAgo(createdDaysAgo),
    updated_at: hoursAgo(syncHoursAgo),
});

export const workspace_integrations = [
    integration('gsc', {
        propertyUrl: 'sc-domain:ken42.com',
        meta: { account: 'priya@ken42.com', properties: ['sc-domain:ken42.com', 'https://ken42.com/'], rowsLastSync: 1284 },
        syncHoursAgo: 2, createdDaysAgo: 74,
    }),
    integration('ga4', {
        propertyUrl: 'properties/412889301',
        meta: { account: 'priya@ken42.com', propertyName: 'Ken42 — Website', measurementId: 'G-K42WEB2026' },
        syncHoursAgo: 2, createdDaysAgo: 74,
    }),
    integration('google-ads', {
        propertyUrl: 'customers/8842019377',
        meta: { account: 'Ken42 India', currency: 'INR', activeCampaigns: 2 },
        syncHoursAgo: 4, createdDaysAgo: 41,
    }),
    integration('linkedin', {
        propertyUrl: 'urn:li:organization:74829104',
        meta: { pageName: 'Ken42', followers: 6842, adAccount: 'Ken42 — India (INR)' },
        syncHoursAgo: 5, createdDaysAgo: 52,
    }),
    integration('meta-ads', {
        propertyUrl: 'act_882910447',
        meta: { account: 'Ken42 — Brand', currency: 'INR', activeCampaigns: 1 },
        syncHoursAgo: 6, createdDaysAgo: 38,
    }),
    integration('meta-pages', {
        propertyUrl: '104882910447',
        meta: { pageName: 'Ken42', followers: 3120 },
        syncHoursAgo: 6, createdDaysAgo: 38,
    }),
    integration('meta-ad-library', {
        meta: { trackedPages: ['Meritto', 'Camu Digital Campus', 'LeadSquared', 'ExtraaEdge'], adsLastSync: 47 },
        syncHoursAgo: 12, createdDaysAgo: 33,
    }),
    integration('zoho', {
        propertyUrl: 'https://crm.zoho.in',
        meta: { orgId: '60028841902', module: 'Leads', dc: 'in', recordsLastSync: 214 },
        syncHoursAgo: 1, createdDaysAgo: 66,
    }),
    integration('salesforce', {
        propertyUrl: 'https://ken42.my.salesforce.com',
        meta: { instance: 'ken42', sandbox: false, closedWonLastSync: 4, opportunitiesTracked: 31 },
        syncHoursAgo: 1, createdDaysAgo: 22,
    }),
    integration('hubspot', {
        meta: { portalId: '48829104', lists: ['KenRoll customers', 'Accreditation nurture'], contactsLastSync: 1180 },
        syncHoursAgo: 8, createdDaysAgo: 29,
    }),
    integration('apollo', {
        meta: { plan: 'Professional', creditsUsed: 412, creditsRemaining: 1588, enrichedThisMonth: 96 },
        syncHoursAgo: 20, createdDaysAgo: 31,
    }),
    integration('wordpress', {
        propertyUrl: 'https://ken42.com/wp-json',
        meta: { site: 'ken42.com', user: 'kepler-publisher', postsPublished: 3 },
        syncHoursAgo: 27, createdDaysAgo: 26,
    }),
];

export const generation_feedback = [
    { id: id('fb-1'), workspace_id: WS, module: 'seo-aeo', label: 'Blog article — NAAC evidence collection', rating: 5, improvement: 'The week-by-week breakdown was exactly right. Keep that structure.', created_at: daysAgo(27) },
    { id: id('fb-2'), workspace_id: WS, module: 'seo-aeo', label: 'Blog article — mid-cycle migration', rating: 5, improvement: 'Saying plainly when NOT to migrate is what made this credible.', created_at: daysAgo(44) },
    { id: id('fb-3'), workspace_id: WS, module: 'seo-aeo', label: 'Keyword research', rating: 4, improvement: 'Good buy-intent coverage. Wanted more Tier-2-city and regional-language variants.', created_at: daysAgo(12) },
    { id: id('fb-4'), workspace_id: WS, module: 'ad-campaigns', label: 'LinkedIn variants — registrar', rating: 5, improvement: 'The objection-angle variant is outperforming the outcome angle 2:1.', created_at: daysAgo(23) },
    { id: id('fb-5'), workspace_id: WS, module: 'ad-campaigns', label: 'Google Search — accreditation', rating: 3, improvement: 'Headlines were generic. Mirror the article language more closely.', created_at: daysAgo(18) },
    { id: id('fb-6'), workspace_id: WS, module: 'outreach', label: 'Cold sequence — registrars', rating: 5, improvement: 'Giving away the migration guide at touch 3 with no ask is doing the work.', created_at: daysAgo(20) },
    { id: id('fb-7'), workspace_id: WS, module: 'outreach', label: 'Cold sequence — CIOs', rating: 4, improvement: 'Offering docs and a sandbox instead of a call was right. Trim touch 1.', created_at: daysAgo(19) },
    { id: id('fb-8'), workspace_id: WS, module: 'social-media', label: 'Content calendar — 4 weeks', rating: 4, improvement: 'Founder-voice posts land better than company voice. Weight them higher.', created_at: daysAgo(9) },
    { id: id('fb-9'), workspace_id: WS, module: 'social-media', label: 'LinkedIn posts — handover reframe', rating: 5, improvement: 'The three-people diagnostic got shared by two registrars.', created_at: daysAgo(11) },
    { id: id('fb-10'), workspace_id: WS, module: 'brand-intelligence', label: 'Brand population from website', rating: 4, improvement: 'Product list was accurate. Differentiators needed a human pass.', created_at: daysAgo(12) },
    { id: id('fb-11'), workspace_id: WS, module: 'abm-research', label: 'Account research — Vidyapeeth Education Group', rating: 5, improvement: 'The phased-migration recommendation (hardest campus last) was the useful part.', created_at: daysAgo(26) },
    { id: id('fb-12'), workspace_id: WS, module: 'abm-research', label: 'Account research — Himgiri University Group', rating: 4, improvement: 'Appreciated it telling me to deprioritise rather than forcing a fit.', created_at: daysAgo(16) },
];

export const channel_posts = [
    {
        id: id('post-linkedin-1'),
        workspace_id: WS,
        provider: 'linkedin',
        channel: 'linkedin',
        external_id: 'urn:li:share:7284910447281',
        posted_at: daysAgo(12, { hour: 9 }),
        text: 'Your admissions CRM is not the problem. The handover is.',
        url: 'https://www.linkedin.com/feed/update/urn:li:share:7284910447281',
        media_type: 'text',
        metrics: { impressions: 14820, reactions: 312, comments: 64, shares: 41, clicks: 486, engagementRate: 0.0282 },
        captured_at: hoursAgo(5),
    },
    {
        id: id('post-linkedin-2'),
        workspace_id: WS,
        provider: 'linkedin',
        channel: 'linkedin',
        external_id: 'urn:li:share:7284910448102',
        posted_at: daysAgo(9, { hour: 10 }),
        text: 'Six weeks. That is what one IQAC coordinator told me her last NAAC cycle cost her.',
        url: 'https://www.linkedin.com/feed/update/urn:li:share:7284910448102',
        media_type: 'text',
        metrics: { impressions: 21440, reactions: 587, comments: 143, shares: 96, clicks: 1204, engagementRate: 0.0385 },
        captured_at: hoursAgo(5),
    },
    {
        id: id('post-linkedin-3'),
        workspace_id: WS,
        provider: 'linkedin',
        channel: 'linkedin',
        external_id: 'urn:li:share:7284910449311',
        posted_at: daysAgo(5, { hour: 9 }),
        text: 'Three conditions for switching admissions software without wrecking your cycle:',
        url: 'https://www.linkedin.com/feed/update/urn:li:share:7284910449311',
        media_type: 'text',
        metrics: { impressions: 18960, reactions: 402, comments: 88, shares: 74, clicks: 942, engagementRate: 0.0298 },
        captured_at: hoursAgo(5),
    },
    {
        id: id('post-linkedin-4'),
        workspace_id: WS,
        provider: 'linkedin',
        channel: 'linkedin',
        external_id: 'urn:li:share:7284910450877',
        posted_at: daysAgo(2, { hour: 10 }),
        text: 'We asked three people at the same university how many systems an applicant touches. We got three different answers.',
        url: 'https://www.linkedin.com/feed/update/urn:li:share:7284910450877',
        media_type: 'text',
        metrics: { impressions: 9640, reactions: 188, comments: 52, shares: 29, clicks: 341, engagementRate: 0.0279 },
        captured_at: hoursAgo(5),
    },
    {
        id: id('post-meta-1'),
        workspace_id: WS,
        provider: 'meta-pages',
        channel: 'facebook',
        external_id: '104882910447_9928104',
        posted_at: daysAgo(7, { hour: 11 }),
        text: 'NAAC evidence collection takes most institutions four to six weeks. Almost none of it is spent writing the report.',
        url: 'https://www.facebook.com/104882910447/posts/9928104',
        media_type: 'link',
        metrics: { impressions: 4210, reactions: 74, comments: 11, shares: 18, clicks: 162, engagementRate: 0.0245 },
        captured_at: hoursAgo(6),
    },
];

const event = (key, kind, title, { entityType = '', entityId = null, meta = {}, at }) => ({
    id: id(`event-${key}`),
    workspace_id: WS,
    actor_id: DEMO_USER_ID,
    kind,
    title,
    entity_type: entityType,
    entity_id: entityId,
    meta,
    created_at: at,
});

export const workspace_events = [
    event('reply-varshini', 'outreach.reply', 'Rahul Deshpande replied — asked for pricing (Varshini University)', {
        entityType: 'reply', entityId: id('reply-varshini'), meta: { classified: 'interested_pricing', sequence: 'Registrars — cycle time (Q3)' }, at: minutesAgo(148),
    }),
    event('reply-sarala', 'outreach.reply', 'Divya Nambiar replied — sandbox and security docs requested (Sarala Education Trust)', {
        entityType: 'reply', entityId: id('reply-sarala'), meta: { classified: 'interested_technical', sequence: 'CIOs — consolidation (Q3)' }, at: hoursAgo(54),
    }),
    event('scan-4', 'visibility.scan', 'AI visibility scan complete — 6 prompts across 4 surfaces', {
        entityType: 'scan_run', entityId: id('scanrun-3'), meta: { mentionRate: 0.79, citationRate: 0.54, surfaces: 4, prompts: 6 }, at: daysAgo(2, { hour: 7 }),
    }),
    event('seq-approved-iqac', 'sequence.approved', 'Sequence approved — IQAC — accreditation cycle', {
        entityType: 'sequence', entityId: id('seq-iqac'), meta: { steps: 2, mode: 'warm' }, at: daysAgo(2, { hour: 12 }),
    }),
    event('meeting-shivalik', 'outreach.meeting', 'Meeting booked — Anjali Rawat (Shivalik Technical University)', {
        entityType: 'enrollment', entityId: id('enr-registrars-shivalik-registrar'), meta: { when: 'First week of October', attendees: 'Registrar + IQAC coordinator' }, at: daysAgo(4, { hour: 11 }),
    }),
    event('salesforce-sync', 'connector.sync', 'Salesforce sync — 4 closed-won opportunities attributed', {
        entityType: 'integration', entityId: id('integration-salesforce'), meta: { provider: 'salesforce', closedWon: 4, revenue: 1740000, currency: 'INR' }, at: minutesAgo(9),
    }),
    event('metrics-snapshot', 'metrics.snapshot', 'Weekly metrics snapshot captured across 4 providers', {
        entityType: 'metrics', meta: { providers: ['ga4', 'zoho', 'outreach', 'revenue'], campaigns: 3 }, at: minutesAgo(72),
    }),
    event('unsub-deccan', 'outreach.unsubscribe', 'Imran Sheikh unsubscribed — added to suppression list', {
        entityType: 'reply', entityId: id('reply-deccan-unsub'), meta: { reason: 'unsub' }, at: daysAgo(3, { hour: 14 }),
    }),
    event('bounce-nalanda', 'outreach.bounce', 'Hard bounce — Vikram Sinha (catch-all domain), enrollment paused', {
        entityType: 'message', entityId: id('msg-r1-nalanda-0'), meta: { reason: 'hard_bounce', code: '550' }, at: daysAgo(4, { hour: 10 }),
    }),
    event('content-social', 'content.created', '4 social drafts queued for the next two weeks', {
        entityType: 'content', meta: { count: 4, type: 'social' }, at: daysAgo(5, { hour: 15 }),
    }),
    event('campaign-kenfin', 'campaign.created', 'Campaign drafted — KenFin expansion — existing institutions', {
        entityType: 'campaign', entityId: id('campaign-kenfin'), meta: { campaignType: 'retention', steps: 2 }, at: daysAgo(6, { hour: 16 }),
    }),
    event('suggestions', 'brand.suggestions', '3 brand suggestions ready for review (2 ICPs, 1 competitor)', {
        entityType: 'brand', meta: { icp: 2, competitor: 1 }, at: daysAgo(6, { hour: 8 }),
    }),
    event('gsc-sync', 'connector.sync', 'Search Console sync — 1,284 query rows', {
        entityType: 'integration', entityId: id('integration-gsc'), meta: { provider: 'gsc', rows: 1284 }, at: minutesAgo(34),
    }),
    event('blog-published', 'content.published', 'Published to WordPress — NAAC evidence collection guide', {
        entityType: 'content', entityId: id('content-seo-naac'), meta: { url: 'https://ken42.com/blog/naac-evidence-collection', provider: 'wordpress' }, at: daysAgo(27, { hour: 13 }),
    }),
    event('abm-research', 'abm.research', 'Account research complete — Varshini University (high fit)', {
        entityType: 'abm_account', entityId: id('abm-varshini'), meta: { icpFit: 'high', tier: 'Tier 1', contacts: 2 }, at: daysAgo(21, { hour: 10 }),
    }),
];
