import { supabase } from '../lib/supabase';
import { isUuid } from '../lib/validation';

// Persistence for ABM research: workspace-scoped abm_accounts + abm_contacts
// (RLS-enforced; the client reads/writes directly). The research pipeline lives
// in [[abmResearchService]]; grounded generation goes through the ai-proxy edge
// function and Apollo through connector-proxy - see [[connector-architecture]].
// This module only stores/reads what the pipeline produced. mapRow (snake->camel)
// on the way out, toInsert (camel->snake, length-capped) on the way in - matching
// prospectsService so the two contact stores stay symmetrical.

const assertWorkspaceId = (workspaceId) => {
    if (!isUuid(workspaceId)) throw new Error('Invalid workspace id');
};

const str = (v, max) => String(v ?? '').slice(0, max);
const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const intIn = (v, lo, hi) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return lo;
    return Math.min(hi, Math.max(lo, n));
};
// JSONB string arrays (tech_signals, flags): clamp count + per-item length.
const strArray = (v, maxItems, maxLen) =>
    (Array.isArray(v) ? v : [])
        .map((x) => String(x ?? '').slice(0, maxLen))
        .filter(Boolean)
        .slice(0, maxItems);
// JSONB citation objects (sources): [{ title, url }].
const sourceArray = (v, maxItems) =>
    (Array.isArray(v) ? v : [])
        .map((s) => ({ title: str(s?.title, 300), url: str(s?.url, 500) }))
        .filter((s) => s.title || s.url)
        .slice(0, maxItems);

const mapAccount = (r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    companyName: r.company_name ?? '',
    domain: r.domain ?? '',
    tier: r.tier ?? '',
    icpFit: r.icp_fit ?? '',
    employeeSize: r.employee_size ?? '',
    revenue: r.revenue ?? '',
    techSignals: Array.isArray(r.tech_signals) ? r.tech_signals : [],
    whyGrounding: r.why_grounding ?? '',
    recommendedChannel: r.recommended_channel ?? '',
    sources: Array.isArray(r.sources) ? r.sources : [],
    status: r.status ?? 'researched',
    createdAt: r.created_at ?? null,
});

const mapContact = (r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    accountId: r.account_id,
    firstName: r.first_name ?? '',
    lastName: r.last_name ?? '',
    title: r.title ?? '',
    seniorityTier: r.seniority_tier ?? '',
    company: r.company ?? '',
    email: r.email ?? '',
    phone: r.phone ?? '',
    linkedinUrl: r.linkedin_url ?? '',
    fitScore: r.fit_score ?? 0,
    fitReasoning: r.fit_reasoning ?? '',
    recommendedChannel: r.recommended_channel ?? '',
    icpRelevance: r.icp_relevance ?? '',
    source: r.source ?? 'research',
    externalId: r.external_id ?? '',
    confidence: r.confidence ?? '',
    flags: Array.isArray(r.flags) ? r.flags : [],
    prospectId: r.prospect_id ?? null,
    createdAt: r.created_at ?? null,
});

const toAccountInsert = (workspaceId, a) => ({
    workspace_id: workspaceId,
    company_name: str(a.companyName, 300),
    domain: str(a.domain, 255),
    tier: str(a.tier, 60),
    icp_fit: oneOf(a.icpFit, ['', 'high', 'medium', 'low'], ''),
    employee_size: str(a.employeeSize, 60),
    revenue: str(a.revenue, 100),
    tech_signals: strArray(a.techSignals, 20, 120),
    why_grounding: str(a.whyGrounding, 2000),
    recommended_channel: str(a.recommendedChannel, 120),
    sources: sourceArray(a.sources, 12),
    status: oneOf(a.status, ['researched', 'saved', 'archived'], 'researched'),
});

const toContactInsert = (workspaceId, accountId, c) => ({
    workspace_id: workspaceId,
    account_id: accountId,
    first_name: str(c.firstName, 200),
    last_name: str(c.lastName, 200),
    title: str(c.title, 300),
    seniority_tier: str(c.seniorityTier, 80),
    company: str(c.company, 300),
    email: str(c.email, 320),
    phone: str(c.phone, 60),
    linkedin_url: str(c.linkedinUrl, 500),
    fit_score: intIn(c.fitScore, 0, 100),
    fit_reasoning: str(c.fitReasoning, 1000),
    recommended_channel: str(c.recommendedChannel, 120),
    icp_relevance: str(c.icpRelevance, 300),
    source: oneOf(c.source, ['apollo', 'research'], 'research'),
    external_id: str(c.externalId, 200),
    confidence: oneOf(c.confidence, ['', 'high', 'medium', 'low'], ''),
    flags: strArray(c.flags, 12, 60),
});

export const abmService = {
    /** Researched accounts for the workspace, most recent first. */
    listAccounts: async (workspaceId) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('abm_accounts')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapAccount);
    },

    /** Contacts for one account, best fit first. */
    listContacts: async (workspaceId, accountId) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('abm_contacts')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('account_id', accountId)
            .order('fit_score', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapContact);
    },

    getAccountWithContacts: async (workspaceId, accountId) => {
        assertWorkspaceId(workspaceId);
        const { data, error } = await supabase
            .from('abm_accounts')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('id', accountId)
            .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        const contacts = await abmService.listContacts(workspaceId, accountId);
        return { account: mapAccount(data), contacts };
    },

    /**
     * Persist a completed research run: one account + its contacts. Returns the
     * saved { account, contacts } (with ids) so the UI can act on them.
     */
    saveResearch: async (workspaceId, { account, contacts = [] } = {}) => {
        assertWorkspaceId(workspaceId);
        if (!account) throw new Error('An account is required to save research.');
        const { data: acct, error: acctErr } = await supabase
            .from('abm_accounts')
            .insert(toAccountInsert(workspaceId, { ...account, status: 'saved' }))
            .select('*')
            .single();
        if (acctErr) throw acctErr;

        let savedContacts = [];
        if (contacts.length) {
            const { data: rows, error: cErr } = await supabase
                .from('abm_contacts')
                .insert(contacts.map((c) => toContactInsert(workspaceId, acct.id, c)))
                .select('*');
            if (cErr) throw cErr;
            savedContacts = (rows ?? []).map(mapContact);
        }
        return { account: mapAccount(acct), contacts: savedContacts };
    },

    removeAccount: async (workspaceId, accountId) => {
        assertWorkspaceId(workspaceId);
        const { error } = await supabase
            .from('abm_accounts')
            .delete()
            .eq('workspace_id', workspaceId)
            .eq('id', accountId);
        if (error) throw error;
    },

    /**
     * Record which prospect each ABM contact was projected into (after a
     * save-to-prospect-list). links: [{ contactId, prospectId }].
     */
    markSavedToProspects: async (workspaceId, links = []) => {
        assertWorkspaceId(workspaceId);
        if (!links.length) return;
        await Promise.all(links.map(async ({ contactId, prospectId }) => {
            const { error } = await supabase
                .from('abm_contacts')
                .update({ prospect_id: prospectId })
                .eq('workspace_id', workspaceId)
                .eq('id', contactId);
            if (error) throw error;
        }));
    },
};

export default abmService;
