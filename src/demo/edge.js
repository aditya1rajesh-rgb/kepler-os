/**
 * Local stand-ins for the Supabase edge functions.
 *
 * In the demo build `callEdgeFunction()` routes here instead of over the network,
 * so every connector-backed surface behaves as if the account were connected and
 * healthy: Search Console returns query rows, DataForSEO returns volumes, the
 * answer-engine scanner returns answers, Apollo returns people, and the CRMs
 * return attributable records.
 *
 * Responses match the real functions' contracts — see supabase/functions/* — so
 * the services parsing them need no demo-specific branches.
 */
import { DEMO_AI_LATENCY_MS, sleep } from './flag';
import { getStore } from './store';
import { GSC_QUERY_ROWS, GSC_PAGE_ROWS, GSC_PROPERTY } from './dataset/searchConsole';
import { KEYWORD_METRICS, metricsForKeyword } from './dataset/keywordMetrics';
import { APOLLO_PEOPLE } from './dataset/apollo';
import { MENTION_THREADS } from './dataset/mentions';
import { answerForPrompt } from './dataset/answerEngines';
import { GA4_BY_CAMPAIGN, ZOHO_RECORDS, SALESFORCE_DEALS, HUBSPOT_RECORDS } from './dataset/crm';

/** Every platform capability is provisioned in the demo. */
const PLATFORM_CAPABILITIES = {
    serp_metrics: true,
    visibility_perplexity: true,
    visibility_openai: true,
    visibility_anthropic: true,
    apify: true,
};

const offsetDays = (days) => {
    const d = new Date(Date.now() - days * 86_400_000);
    return d.toISOString().slice(0, 10);
};

/** Slightly vary a GSC row set for the prior period so trends are non-flat. */
const priorPeriod = (rows) =>
    rows.map((r, i) => {
        const decay = 0.82 + 0.1 * Math.sin(i * 1.3);
        const impressions = Math.round(r.impressions * decay);
        const clicks = Math.round(r.clicks * (decay - 0.04));
        return {
            ...r,
            impressions,
            clicks,
            ctr: impressions > 0 ? clicks / impressions : 0,
            position: Number((r.position + 1.4 + Math.sin(i) * 0.6).toFixed(1)),
        };
    });

const connectorProxy = async (body) => {
    const { action, provider, params, payload, keywords, topic, sites, max } = body;

    switch (action) {
        case 'capabilities':
            return { ok: true, platform: PLATFORM_CAPABILITIES };

        case 'keywordMetrics': {
            const metrics = {};
            for (const term of keywords ?? []) {
                metrics[String(term).toLowerCase()] = KEYWORD_METRICS[String(term).toLowerCase()] ?? metricsForKeyword(term);
            }
            return { ok: true, metrics };
        }

        case 'test':
            return { ok: true, provider, detail: 'Connection healthy (demo).' };

        case 'connect':
            return { ok: true, provider, status: 'connected' };

        case 'disconnect':
            return { ok: true, provider, status: 'disconnected' };

        case 'fetch': {
            if (provider === 'apollo') {
                const titles = (params?.titles ?? []).map((t) => String(t).toLowerCase());
                const locations = (params?.locations ?? []).map((l) => String(l).toLowerCase());
                const keywordText = String(params?.keywords ?? '').toLowerCase();
                const seniorities = new Set((params?.seniorities ?? []).map((s) => String(s).toLowerCase()));

                // Account-scoped pulls (ABM) pass organizationDomains; when present it
                // is the strongest filter, and the free-text keyword is then only a hint.
                const domains = (params?.organizationDomains ?? []).map((d) => String(d).toLowerCase().replace(/^www\./, ''));

                const matches = APOLLO_PEOPLE.filter((person) => {
                    const haystack = `${person.title} ${person.company} ${person.keywords.join(' ')}`.toLowerCase();
                    const titleOk = titles.length === 0 || titles.some((t) => haystack.includes(t));
                    const locationOk = locations.length === 0 || locations.some((l) => person.location.toLowerCase().includes(l));
                    const seniorityOk = seniorities.size === 0 || seniorities.has(String(person.seniority).toLowerCase());
                    if (domains.length) {
                        return titleOk && seniorityOk && domains.some((d) => person.domain.toLowerCase() === d);
                    }
                    const keywordOk = !keywordText || haystack.includes(keywordText);
                    return titleOk && locationOk && keywordOk && seniorityOk;
                });
                const perPage = params?.perPage ?? 25;
                return {
                    ok: true,
                    result: {
                        people: matches.slice(0, perPage),
                        total: matches.length,
                    },
                };
            }
            if (provider === 'zoho') {
                return { ok: true, result: { records: ZOHO_RECORDS, total: ZOHO_RECORDS.length } };
            }
            if (provider === 'hubspot') {
                return { ok: true, result: { records: HUBSPOT_RECORDS, total: HUBSPOT_RECORDS.length } };
            }
            if (provider === 'salesforce') {
                return { ok: true, result: { deals: SALESFORCE_DEALS, total: SALESFORCE_DEALS.length } };
            }
            if (provider === 'meta-ad-library') {
                return {
                    ok: true,
                    result: {
                        ads: [
                            {
                                pageName: 'Meritto',
                                bodies: ['Purpose-built for education. Convert more enquiries into enrolments with India\'s most-used admissions CRM.'],
                                titles: ['Admissions software built for education'],
                                descriptions: ['Trusted by 1,000+ institutions'],
                            },
                            {
                                pageName: 'Camu Digital Campus',
                                bodies: ['One platform for admissions and academics. No more two systems, no more re-keying.'],
                                titles: ['SIS + CRM in one'],
                                descriptions: ['Book a free demo'],
                            },
                            {
                                pageName: 'LeadSquared',
                                bodies: ['Counsellor productivity, telephony and automation for education sales teams.'],
                                titles: ['Convert more admissions leads'],
                                descriptions: ['Used by leading edtech brands'],
                            },
                            {
                                pageName: 'ExtraaEdge',
                                bodies: ['Affordable admissions CRM for growing institutions. Go live in 2 weeks.'],
                                titles: ['Admissions CRM from ₹X/student'],
                                descriptions: ['Start free trial'],
                            },
                        ],
                    },
                };
            }
            return { ok: true, result: { records: [] } };
        }

        case 'push': {
            const count = Array.isArray(payload?.records) ? payload.records.length : (payload?.contacts?.length ?? 1);
            return {
                ok: true,
                provider,
                result: {
                    pushed: count,
                    ids: Array.from({ length: count }, (_, i) => `${provider}_demo_${Date.now()}_${i}`),
                },
            };
        }

        case 'enrich': {
            const contacts = payload?.contacts ?? payload?.people ?? [];
            return {
                ok: true,
                provider,
                result: {
                    enriched: contacts.map((c) => ({
                        ...c,
                        email: c.email || `${String(c.firstName ?? 'first').toLowerCase()}.${String(c.lastName ?? 'last').toLowerCase()}@${(c.domain ?? 'example.edu.in')}`,
                        phone: c.phone || '+91 80 4000 0000',
                        confidence: 'high',
                        verification: { status: 'valid', provider: 'free-verifier' },
                    })),
                    creditsUsed: contacts.length,
                },
            };
        }

        case 'mentionSearch': {
            const needle = String(topic ?? '').toLowerCase();
            const threads = MENTION_THREADS.filter((t) =>
                !needle || `${t.title} ${t.snippet}`.toLowerCase().includes(needle.split(' ')[0])
            );
            return { ok: true, threads: threads.length ? threads : MENTION_THREADS.slice(0, 4), sites, max };
        }

        default:
            return { ok: true, action, note: 'No demo handler — returned an empty success.' };
    }
};

const oauthProxy = async (body) => {
    const { action, provider, propertyUrl, payload } = body;

    switch (action) {
        case 'query': {
            if (provider === 'gsc') {
                const dimensions = body.dimensions ?? ['query'];
                const isPageQuery = dimensions.includes('page') && dimensions.includes('query');
                const base = isPageQuery ? GSC_PAGE_ROWS : GSC_QUERY_ROWS;
                const rows = body.offsetDays ? priorPeriod(base) : base;
                return {
                    ok: true,
                    propertyUrl: GSC_PROPERTY,
                    rows: rows.slice(0, body.rowLimit ?? rows.length),
                    range: { start: offsetDays((body.offsetDays ?? 0) + (body.days ?? 28)), end: offsetDays(body.offsetDays ?? 0) },
                };
            }
            if (provider === 'ga4') {
                return { ok: true, rows: GA4_BY_CAMPAIGN, mode: body.mode ?? 'byCampaign' };
            }
            return { ok: true, rows: [] };
        }

        case 'listProperties': {
            if (provider === 'gsc') {
                return { ok: true, properties: [{ siteUrl: 'sc-domain:ken42.com', permissionLevel: 'siteOwner' }, { siteUrl: 'https://ken42.com/', permissionLevel: 'siteFullUser' }] };
            }
            if (provider === 'ga4') {
                return { ok: true, properties: [{ name: 'properties/412889301', displayName: 'Ken42 — Website' }] };
            }
            return { ok: true, properties: [] };
        }

        case 'setProperty': {
            const rows = getStore().rowsOf('workspace_integrations');
            const row = rows.find((r) => r.provider === provider);
            if (row) row.property_url = propertyUrl;
            return { ok: true, provider, propertyUrl };
        }

        case 'publish':
            return {
                ok: true,
                provider,
                result: {
                    url: `https://ken42.com/blog/${String(payload?.title ?? 'demo-post').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}`,
                    id: `wp_${Date.now()}`,
                    status: 'publish',
                },
            };

        case 'fetchHistory': {
            const posts = getStore()
                .rowsOf('channel_posts')
                .filter((p) => p.provider === provider)
                .map((p) => ({
                    channel: p.channel,
                    externalId: p.external_id,
                    postedAt: p.posted_at,
                    text: p.text,
                    url: p.url,
                    mediaType: p.media_type,
                    metrics: p.metrics,
                }));
            return { ok: true, posts };
        }

        case 'exchangeCode':
            return { ok: true, provider: body.provider ?? 'gsc', status: 'connected' };

        case 'disconnect':
            return { ok: true, provider, status: 'disconnected' };

        default:
            return { ok: true, action };
    }
};

const visibilityScanner = async (body) => {
    // The scanner is the slowest real call — keep that texture so the demo shows
    // the scanning state rather than snapping to a finished scan.
    await sleep(Math.min(DEMO_AI_LATENCY_MS, 1800));
    const { surface, prompts = [] } = body;
    return {
        ok: true,
        surface,
        results: prompts.map((prompt) => {
            const answer = answerForPrompt(prompt, surface);
            return {
                prompt,
                ok: true,
                answer: answer.text,
                citations: answer.citations,
                surface,
            };
        }),
    };
};

const HANDLERS = {
    'connector-proxy': connectorProxy,
    'oauth-proxy': oauthProxy,
    'visibility-scanner': visibilityScanner,
    'search-console': (body) => oauthProxy({ ...body, provider: 'gsc', action: body.action ?? 'query' }),
    'send-scheduler': async () => ({ ok: true, processed: 0, note: 'The demo scheduler does not send mail.' }),
    'inbox-monitor': async () => ({ ok: true, classified: 0, note: 'Replies in the demo are pre-seeded.' }),
    'metrics-snapshot': async () => ({ ok: true, snapshots: 0, note: 'Snapshots in the demo are pre-seeded.' }),
    'meta-callbacks': async () => ({ ok: true }),
};

/** Demo replacement for `callEdgeFunction(fnName, body)`. */
export const callDemoEdgeFunction = async (fnName, body = {}) => {
    const handler = HANDLERS[fnName];
    if (!handler) {
        console.warn(`[demo] no handler for edge function "${fnName}" — returning an empty success.`);
        return { ok: true };
    }
    await sleep(220);
    return handler(body);
};
