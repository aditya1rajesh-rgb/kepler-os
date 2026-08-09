/**
 * Assembles the demo dataset — one object of table name → rows, rebuilt fresh on
 * every page load.
 *
 * The two database VIEWS the app reads (`v_outreach_sequence_metrics` and
 * `v_prospect_campaigns`) are derived here from the base tables, mirroring the SQL
 * in supabase/migrations/022 and 026 so Measurement and attribution agree with
 * Outreach without a second source of truth.
 */
import * as brand from './brand';
import * as content from './content';
import * as campaignData from './campaigns';
import * as outreach from './outreach';
import * as abm from './abm';
import * as visibility from './visibility';
import * as ops from './ops';

/** Every table (and view) the demo serves. Anything else reads as empty + warns. */
export const DEMO_TABLES = [
    'workspaces', 'workspace_members', 'user_profiles',
    'brand_profiles', 'personas', 'competitors', 'brand_suggestions', 'workspace_files',
    'content_items', 'campaigns', 'campaign_metrics',
    'prospects', 'prospect_lists', 'prospect_list_members',
    'sequences', 'enrollments', 'messages', 'replies', 'suppression_list', 'sending_domains',
    'abm_accounts', 'abm_contacts',
    'visibility_scans', 'workspace_integrations', 'generation_feedback', 'channel_posts',
    'workspace_events',
    // E2 · the goals spine.
    'goals', 'goal_checkpoints', 'goal_target_history', 'goal_links',
    // E4: write-only in the demo — nothing reads it back, but the inserts must
    // land somewhere rather than warn on every screen the demo opens.
    'usage_events',
    'v_outreach_sequence_metrics', 'v_prospect_campaigns',
];

/** v_outreach_sequence_metrics — enrolled / meetings / sent / replied per sequence. */
const buildSequenceMetrics = (tables) => {
    const countBy = (rows, predicate) => rows.filter(predicate).length;
    return tables.sequences.map((s) => {
        const seqEnrollments = tables.enrollments.filter((e) => e.sequence_id === s.id);
        const enrollmentIds = new Set(seqEnrollments.map((e) => e.id));
        return {
            id: s.id, // views have no PK; the app never filters on it, but the store expects one
            workspace_id: s.workspace_id,
            sequence_id: s.id,
            campaign_id: s.campaign_id,
            name: s.name,
            enrolled: seqEnrollments.length,
            meetings: countBy(seqEnrollments, (e) => e.status === 'meeting'),
            sent: countBy(tables.messages, (m) => m.sequence_id === s.id && m.status === 'sent'),
            replied: countBy(tables.replies, (r) => r.kind === 'reply' && enrollmentIds.has(r.enrollment_id)),
        };
    });
};

/** v_prospect_campaigns — distinct (zoho contact, campaign) pairs for attribution. */
const buildProspectCampaigns = (tables) => {
    const seen = new Set();
    const rows = [];
    for (const enrollment of tables.enrollments) {
        const prospect = tables.prospects.find((p) => p.id === enrollment.prospect_id);
        const sequence = tables.sequences.find((s) => s.id === enrollment.sequence_id);
        const zohoContactId = prospect?.meta?.zohoContactId ?? '';
        if (!zohoContactId || !sequence?.campaign_id) continue;
        const key = `${zohoContactId}|${sequence.campaign_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
            id: `${zohoContactId}-${sequence.campaign_id}`,
            workspace_id: prospect.workspace_id,
            zoho_contact_id: zohoContactId,
            campaign_id: sequence.campaign_id,
        });
    }
    return rows;
};

export const buildDataset = () => {
    const tables = {
        workspaces: [...brand.workspaces],
        workspace_members: [...brand.workspace_members],
        user_profiles: [...brand.user_profiles],
        brand_profiles: [...brand.brand_profiles],
        personas: [...brand.personas],
        competitors: [...brand.competitors],
        brand_suggestions: [...brand.brand_suggestions],
        workspace_files: [...brand.workspace_files],

        content_items: [...content.content_items],
        campaigns: [...campaignData.campaigns],
        campaign_metrics: [...campaignData.campaign_metrics],

        prospects: [...outreach.prospects],
        prospect_lists: [...outreach.prospect_lists],
        prospect_list_members: [...outreach.prospect_list_members],
        sequences: [...outreach.sequences],
        enrollments: [...outreach.enrollments],
        messages: [...outreach.messages],
        replies: [...outreach.replies],
        suppression_list: [...outreach.suppression_list],
        sending_domains: [...outreach.sending_domains],

        abm_accounts: [...abm.abm_accounts],
        abm_contacts: [...abm.abm_contacts],

        visibility_scans: [...visibility.visibility_scans],
        workspace_integrations: [...ops.workspace_integrations],
        generation_feedback: [...ops.generation_feedback],
        channel_posts: [...ops.channel_posts],
        workspace_events: [...ops.workspace_events],
    };

    // Views are computed once at build time. They are read-only in the app, and the
    // numbers they roll up (enrolled / sent / replied) do not change mid-demo unless
    // a sequence is enrolled or sent from the UI — in which case the demo store's
    // base tables are the truth and a reload re-derives them.
    tables.v_outreach_sequence_metrics = buildSequenceMetrics(tables);
    tables.v_prospect_campaigns = buildProspectCampaigns(tables);

    return tables;
};
