import { matchByText } from './tracking';

// Pure won-deal -> campaign attribution for closed-loop revenue. Given Zoho deals,
// a zohoContactId->campaignId map (the reliable reverse-join via our sends), the
// campaign list (for a Description-substring fallback), and the won-stage set,
// aggregate won Amount per campaign. No I/O so it is unit-tested directly.

export const DEFAULT_WON_STAGES = ['Closed Won'];

/** A deal counts as won if its stage matches a configured stage or contains "won". */
export const isWonStage = (stage, wonStages = DEFAULT_WON_STAGES) => {
    const s = String(stage ?? '').trim().toLowerCase();
    if (!s) return false;
    if (s.includes('won')) return true;
    return wonStages.some((w) => String(w).trim().toLowerCase() === s);
};

/**
 * @param {Array} deals - [{ amount, stage, description, contactId }]
 * @param {object} opts
 * @param {Map} opts.contactCampaign - zohoContactId(string) -> campaignId
 * @param {Array} opts.campaigns - KEPLER campaigns (for the description fallback)
 * @param {string[]} opts.wonStages
 * @returns {{ byCampaign: Record<string,{campaignId,revenue,wonDeals}>, wonTotal:number, attributedCount:number }}
 */
export const attributeDeals = (deals = [], { contactCampaign = new Map(), campaigns = [], wonStages = DEFAULT_WON_STAGES } = {}) => {
    const byCampaign = {};
    let wonTotal = 0;
    let attributedCount = 0;
    for (const d of Array.isArray(deals) ? deals : []) {
        if (!isWonStage(d?.stage, wonStages)) continue;
        wonTotal += 1;
        const amount = Number(d?.amount) || 0;
        // Reliable reverse-join first, then a Description id8 substring fallback.
        let campaignId = (d?.contactId && contactCampaign.get(String(d.contactId))) || null;
        if (!campaignId) campaignId = matchByText(d?.description, campaigns)?.id ?? null;
        const key = campaignId ?? '__unattributed__';
        const a = byCampaign[key] || (byCampaign[key] = { campaignId, revenue: 0, wonDeals: 0 });
        a.revenue += amount;
        a.wonDeals += 1;
        if (campaignId) attributedCount += 1;
    }
    return { byCampaign, wonTotal, attributedCount };
};
