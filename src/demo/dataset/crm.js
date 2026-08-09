/**
 * CRM and analytics payloads for the measurement pulls.
 *
 * UTM strings and CRM descriptions are built with the SAME helper the app uses to
 * stamp them (`campaignUtm`), so attribution genuinely matches by campaign id-suffix
 * instead of being hard-coded — including the deliberately unattributable rows.
 */
import { campaignUtm } from '../../lib/tracking';
import { campaigns } from './campaigns';
import { daysAgo } from './time';

const byTitle = (fragment) => campaigns.find((c) => c.title.toLowerCase().includes(fragment));

const intake = byTitle('intake');
const accreditation = byTitle('accreditation');
const consolidation = byTitle('consolidation');

/** GA4 rows, mode: byCampaign. */
// One row per (utm_campaign × source × medium) — the shape the GA4 report returns
// now that E5 needs both halves of the production—source key.
export const GA4_BY_CAMPAIGN = [
    { campaign: campaignUtm(intake), source: 'linkedin', medium: 'paid_social', sessions: 980, users: 784, conversions: 16 },
    { campaign: campaignUtm(intake), source: 'sendgrid', medium: 'email', sessions: 730, users: 584, conversions: 12 },
    { campaign: campaignUtm(intake), source: 'linkedin.com', medium: 'social', sessions: 430, users: 344, conversions: 6 },
    { campaign: campaignUtm(accreditation), source: 'google', medium: 'cpc', sessions: 1845, users: 1536, conversions: 30 },
    { campaign: campaignUtm(accreditation), source: 'sendgrid', medium: 'email', sessions: 1335, users: 1112, conversions: 22 },
    { campaign: campaignUtm(consolidation), source: 'sendgrid', medium: 'email', sessions: 455, users: 389, conversions: 6 },
    { campaign: campaignUtm(consolidation), source: 'linkedin.com', medium: 'referral', sessions: 185, users: 159, conversions: 2 },
    // Real traffic Kepler cannot claim — the honest unattributed bucket.
    { campaign: '(organic)', source: 'google', medium: 'organic', sessions: 4180, users: 3560, conversions: 23 },
    { campaign: '(organic)', source: 'bing', medium: 'organic', sessions: 640, users: 544, conversions: 4 },
    { campaign: '(direct)', source: '(direct)', medium: '(none)', sessions: 1960, users: 1712, conversions: 14 },
    { campaign: 'linkedin-organic-brand', source: 'linkedin.com', medium: 'social', sessions: 880, users: 764, conversions: 6 },
];

const zohoRecord = (id, name, company, campaign, daysBack, stage = 'Qualified') => ({
    id,
    name,
    company,
    email: '',
    stage,
    description: `Created by KEPLER outreach · utm_campaign=${campaign ? campaignUtm(campaign) : 'none'}`,
    createdAt: daysAgo(daysBack),
    contactId: id,
});

export const ZOHO_RECORDS = [
    zohoRecord('zc_10041', 'Meera Krishnan', 'Anantara University', intake, 19, 'Meeting Scheduled'),
    zohoRecord('zc_10042', 'Rahul Deshpande', 'Varshini University', intake, 19, 'Proposal'),
    zohoRecord('zc_10043', 'Anjali Rawat', 'Shivalik Technical University', intake, 18, 'Meeting Scheduled'),
    zohoRecord('zc_10044', 'Neha Bhatt', 'Sanjeevani University', accreditation, 17),
    zohoRecord('zc_10045', 'Farhan Qureshi', 'Vidyapeeth Education Group', consolidation, 16, 'Meeting Scheduled'),
    zohoRecord('zc_10046', 'Kavita Joshi', 'Sanjeevani University', accreditation, 12),
    zohoRecord('zc_10047', 'Divya Nambiar', 'Sarala Education Trust', consolidation, 12, 'Qualified'),
    zohoRecord('zc_10048', 'Lakshmi Venkatesh', 'Kaveri Global University', intake, 11),
    zohoRecord('zc_10049', 'Deepak Chauhan', 'Shivalik Technical University', accreditation, 9),
    zohoRecord('zc_10050', 'Inbound — website demo request', 'Bhuvana University', null, 8),
    zohoRecord('zc_10051', 'Inbound — pricing enquiry', 'Godavari University', null, 6),
    zohoRecord('zc_10052', 'Suresh Patel', 'Vidyapeeth Education Group', consolidation, 5),
];

export const HUBSPOT_RECORDS = [
    { id: 'hs_8801', name: 'Vivek Nair', company: 'Bhuvana University', lifecycleStage: 'lead', description: `utm_campaign=${campaignUtm(accreditation)}`, createdAt: daysAgo(14) },
    { id: 'hs_8802', name: 'Sneha Kapoor', company: 'Arunoday Global University', lifecycleStage: 'marketingqualifiedlead', description: `utm_campaign=${campaignUtm(accreditation)}`, createdAt: daysAgo(10) },
    { id: 'hs_8803', name: 'Karthik Menon', company: 'Malabar Science Consortium', lifecycleStage: 'lead', description: `utm_campaign=${campaignUtm(consolidation)}`, createdAt: daysAgo(7) },
];

/** Salesforce opportunities — closed-won drives the revenue provider. */
export const SALESFORCE_DEALS = [
    {
        id: 'sf_op_9001',
        name: 'Anantara University — KenRoll + KenFin',
        amount: 4_200_000,
        stage: 'Closed Won',
        closeDate: daysAgo(23).slice(0, 10),
        description: `Sourced by KEPLER · utm_campaign=${campaignUtm(intake)}`,
        contactId: 'zc_10041',
    },
    {
        id: 'sf_op_9002',
        name: 'Kaveri Global University — KenRoll',
        amount: 1_650_000,
        stage: 'Closed Won',
        closeDate: daysAgo(11).slice(0, 10),
        description: `Sourced by KEPLER · utm_campaign=${campaignUtm(intake)}`,
        contactId: 'zc_10048',
    },
    {
        id: 'sf_op_9003',
        name: 'Sanjeevani University — KenCompliance',
        amount: 2_100_000,
        stage: 'Closed Won',
        closeDate: daysAgo(6).slice(0, 10),
        description: `Sourced by KEPLER · utm_campaign=${campaignUtm(accreditation)}`,
        contactId: 'zc_10044',
    },
    {
        id: 'sf_op_9004',
        name: 'Bhuvana University — KenRoll (inbound)',
        amount: 1_280_000,
        stage: 'Closed Won',
        closeDate: daysAgo(4).slice(0, 10),
        description: 'Inbound — no campaign attribution',
        contactId: '',
    },
    // Open pipeline — should NOT count toward revenue.
    {
        id: 'sf_op_9005',
        name: 'Varshini University — KenRoll + KenFin (12,000 students)',
        amount: 5_400_000,
        stage: 'Proposal',
        closeDate: daysAgo(-38).slice(0, 10),
        description: `Sourced by KEPLER · utm_campaign=${campaignUtm(intake)}`,
        contactId: 'zc_10042',
    },
    {
        id: 'sf_op_9006',
        name: 'Vidyapeeth Education Group — group standard (7 campuses)',
        amount: 18_600_000,
        stage: 'Discovery',
        closeDate: daysAgo(-84).slice(0, 10),
        description: `Sourced by KEPLER · utm_campaign=${campaignUtm(consolidation)}`,
        contactId: 'zc_10045',
    },
    {
        id: 'sf_op_9007',
        name: 'Shivalik Technical University — KenRoll + KenCompliance',
        amount: 3_900_000,
        stage: 'Negotiation',
        closeDate: daysAgo(-21).slice(0, 10),
        description: `Sourced by KEPLER · utm_campaign=${campaignUtm(intake)}`,
        contactId: 'zc_10043',
    },
    {
        id: 'sf_op_9008',
        name: 'Deccan Institute of Management — KenRoll',
        amount: 980_000,
        stage: 'Closed Lost',
        closeDate: daysAgo(9).slice(0, 10),
        description: `Sourced by KEPLER · utm_campaign=${campaignUtm(intake)} · lost: budget deferred to next cycle`,
        contactId: '',
    },
];
