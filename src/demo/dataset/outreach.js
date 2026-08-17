/**
 * Outreach: prospects, lists, executable sequences, enrollments, sent messages,
 * replies, suppressions and the sending domain.
 *
 * Institutions here are FICTIONAL (realistic Indian private-university naming, no
 * real college attributed) so the demo never puts invented pipeline, contacts or
 * objections against a real organisation's name.
 */
import { id } from '../ids';
import { DEMO_USER_ID, DEMO_WORKSPACE_ID } from './identity';
import { daysAgo, daysAhead, hoursAgo } from './time';

const WS = DEMO_WORKSPACE_ID;

const prospect = (key, first, last, title, company, domain, location, extra = {}) => ({
    id: id(`prospect-${key}`),
    workspace_id: WS,
    first_name: first,
    last_name: last,
    title,
    company,
    email: `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`,
    linkedin_url: `https://www.linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}-${key.slice(-3)}`,
    location,
    source: 'apollo',
    external_id: `apollo_${id(`prospect-${key}`).slice(0, 12)}`,
    status: 'saved',
    pushed_to: '',
    phone: extra.phone ?? '',
    enriched_at: extra.enrichedAt ?? daysAgo(26),
    meta: {
        seniority: extra.seniority ?? 'director',
        employeeCount: extra.employeeCount ?? '1,001-5,000',
        studentCount: extra.studentCount ?? '',
        emailVerification: extra.verification ?? { status: 'valid', provider: 'free-verifier', checkedAt: daysAgo(26) },
        enrichment: extra.enrichment ?? { provider: 'apollo', confidence: 'high', fields: ['email', 'title', 'linkedin_url'] },
        ...(extra.zohoContactId ? { zohoContactId: extra.zohoContactId } : {}),
        ...(extra.notes ? { notes: extra.notes } : {}),
    },
    created_at: extra.createdAt ?? daysAgo(27),
    updated_at: extra.updatedAt ?? daysAgo(26),
});

export const prospects = [
    // Tier 1 registrars
    prospect('anantara-registrar', 'Meera', 'Krishnan', 'Registrar', 'Anantara University', 'anantara.edu.in', 'Bengaluru, Karnataka, India', {
        studentCount: '18,000', zohoContactId: 'zc_10041', notes: 'Spoke at the AIU admissions panel about counsellor workload.',
    }),
    prospect('varshini-admissions', 'Rahul', 'Deshpande', 'Director of Admissions', 'Varshini University', 'varshini.edu.in', 'Pune, Maharashtra, India', {
        studentCount: '12,400', zohoContactId: 'zc_10042',
    }),
    prospect('kaveri-registrar', 'Lakshmi', 'Venkatesh', 'Registrar', 'Kaveri Global University', 'kaveriglobal.edu.in', 'Coimbatore, Tamil Nadu, India', {
        studentCount: '9,800',
    }),
    prospect('deccan-admissions', 'Imran', 'Sheikh', 'Head of Admissions', 'Deccan Institute of Management', 'deccanim.edu.in', 'Hyderabad, Telangana, India', {
        studentCount: '4,200', seniority: 'manager',
    }),
    prospect('shivalik-registrar', 'Anjali', 'Rawat', 'Deputy Registrar (Academics)', 'Shivalik Technical University', 'shivaliktech.edu.in', 'Dehradun, Uttarakhand, India', {
        studentCount: '15,600', zohoContactId: 'zc_10043',
    }),
    prospect('trinity-admissions', 'Joseph', 'Mathew', 'Director of Admissions', 'Trinity Institute of Science', 'trinityscience.edu.in', 'Kochi, Kerala, India', {
        studentCount: '6,700',
    }),
    prospect('sanjeevani-registrar', 'Neha', 'Bhatt', 'Registrar', 'Sanjeevani University', 'sanjeevaniuniv.edu.in', 'Ahmedabad, Gujarat, India', {
        studentCount: '21,300', zohoContactId: 'zc_10044',
    }),
    prospect('nalanda-admissions', 'Vikram', 'Sinha', 'Head of Admissions', 'Nalanda Global Institute', 'nalandaglobal.edu.in', 'Patna, Bihar, India', {
        studentCount: '7,900', verification: { status: 'risky', provider: 'free-verifier', checkedAt: daysAgo(26), reason: 'catch-all domain' },
    }),

    // CIO track
    prospect('anantara-cio', 'Sundar', 'Iyer', 'Chief Information Officer', 'Anantara University', 'anantara.edu.in', 'Bengaluru, Karnataka, India', {
        seniority: 'cxo', studentCount: '18,000',
    }),
    prospect('vidyapeeth-cio', 'Farhan', 'Qureshi', 'Head of IT — Campus Systems', 'Vidyapeeth Education Group', 'vidyapeethgroup.edu.in', 'Mumbai, Maharashtra, India', {
        seniority: 'director', employeeCount: '5,001-10,000', studentCount: '46,000 (7 campuses)', zohoContactId: 'zc_10045',
    }),
    prospect('sarala-cio', 'Divya', 'Nambiar', 'Director — Digital Transformation', 'Sarala Education Trust', 'saralatrust.edu.in', 'Bengaluru, Karnataka, India', {
        seniority: 'director', employeeCount: '1,001-5,000', studentCount: '28,000 (4 campuses)',
    }),
    prospect('himgiri-cio', 'Arjun', 'Malhotra', 'Chief Information Officer', 'Himgiri University Group', 'himgirigroup.edu.in', 'Delhi NCR, India', {
        seniority: 'cxo', employeeCount: '5,001-10,000', studentCount: '52,000 (9 campuses)',
    }),
    prospect('coastal-it', 'Pooja', 'Reddy', 'Head of Academic Systems', 'Coastal Institutes Consortium', 'coastalconsortium.edu.in', 'Visakhapatnam, Andhra Pradesh, India', {
        seniority: 'manager', studentCount: '19,000 (3 campuses)',
    }),

    // Leadership / economic buyers
    prospect('anantara-vc', 'Ramesh', 'Gowda', 'Vice-Chancellor', 'Anantara University', 'anantara.edu.in', 'Bengaluru, Karnataka, India', {
        seniority: 'cxo', studentCount: '18,000',
    }),
    prospect('varshini-provc', 'Sunita', 'Kulkarni', 'Pro Vice-Chancellor', 'Varshini University', 'varshini.edu.in', 'Pune, Maharashtra, India', {
        seniority: 'cxo', studentCount: '12,400',
    }),
    prospect('kaveri-vc', 'Balaji', 'Subramanian', 'Vice-Chancellor', 'Kaveri Global University', 'kaveriglobal.edu.in', 'Coimbatore, Tamil Nadu, India', {
        seniority: 'cxo', studentCount: '9,800',
    }),

    // IQAC / accreditation persona
    prospect('sanjeevani-iqac', 'Kavita', 'Joshi', 'IQAC Coordinator', 'Sanjeevani University', 'sanjeevaniuniv.edu.in', 'Ahmedabad, Gujarat, India', {
        seniority: 'manager', studentCount: '21,300',
    }),
    prospect('shivalik-iqac', 'Deepak', 'Chauhan', 'IQAC Coordinator', 'Shivalik Technical University', 'shivaliktech.edu.in', 'Dehradun, Uttarakhand, India', {
        seniority: 'manager', studentCount: '15,600',
    }),

    // Finance persona (KenFin expansion)
    prospect('vidyapeeth-cfo', 'Suresh', 'Patel', 'Group Chief Financial Officer', 'Vidyapeeth Education Group', 'vidyapeethgroup.edu.in', 'Mumbai, Maharashtra, India', {
        seniority: 'cxo', employeeCount: '5,001-10,000',
    }),
    prospect('trinity-finance', 'Grace', 'Fernandes', 'Finance Controller', 'Trinity Institute of Science', 'trinityscience.edu.in', 'Kochi, Kerala, India', {
        seniority: 'director',
    }),
];

export const prospect_lists = [
    {
        id: id('list-tier1-registrars'),
        workspace_id: WS,
        name: 'Tier 1 registrars (Nov renewal)',
        description: 'Registrars and admissions heads at private universities above 8,000 students with a November admissions-CRM renewal. Built from ABM research, enriched via Apollo, verified.',
        created_at: daysAgo(27),
        updated_at: daysAgo(4),
    },
    {
        id: id('list-cio-groups'),
        workspace_id: WS,
        name: 'Multi-campus CIOs',
        description: 'CIOs and heads of academic systems at education groups running three or more campuses — the consolidation track.',
        created_at: daysAgo(25),
        updated_at: daysAgo(8),
    },
    {
        id: id('list-iqac'),
        workspace_id: WS,
        name: 'IQAC coordinators (accreditation cycle)',
        description: 'Accreditation owners at institutions with a NAAC or NBA cycle inside 12 months.',
        created_at: daysAgo(18),
        updated_at: daysAgo(11),
    },
    {
        id: id('list-kenfin'),
        workspace_id: WS,
        name: 'KenFin expansion (finance buyers)',
        description: 'Finance controllers and group CFOs at institutions already running KenRoll.',
        created_at: daysAgo(6),
        updated_at: daysAgo(6),
    },
];

const member = (listKey, prospectKey, days) => ({
    id: id(`listmember-${listKey}-${prospectKey}`),
    workspace_id: WS,
    list_id: id(`list-${listKey}`),
    prospect_id: id(`prospect-${prospectKey}`),
    created_at: daysAgo(days),
});

export const prospect_list_members = [
    member('tier1-registrars', 'anantara-registrar', 27),
    member('tier1-registrars', 'varshini-admissions', 27),
    member('tier1-registrars', 'kaveri-registrar', 27),
    member('tier1-registrars', 'shivalik-registrar', 26),
    member('tier1-registrars', 'sanjeevani-registrar', 26),
    member('tier1-registrars', 'trinity-admissions', 22),
    member('tier1-registrars', 'deccan-admissions', 22),
    member('tier1-registrars', 'nalanda-admissions', 4),

    member('cio-groups', 'vidyapeeth-cio', 25),
    member('cio-groups', 'himgiri-cio', 25),
    member('cio-groups', 'sarala-cio', 24),
    member('cio-groups', 'coastal-it', 20),
    member('cio-groups', 'anantara-cio', 8),

    member('iqac', 'sanjeevani-iqac', 18),
    member('iqac', 'shivalik-iqac', 18),

    member('kenfin', 'vidyapeeth-cfo', 6),
    member('kenfin', 'trinity-finance', 6),
];

export const sending_domains = [
    {
        id: id('domain-outreach'),
        workspace_id: WS,
        domain: 'go.ken42.com',
        status: 'verified',
        auth: {
            spf: { ok: true, checkedAt: daysAgo(1) },
            dkim: { ok: true, selector: 'kepler1', checkedAt: daysAgo(1) },
            dmarc: { ok: true, policy: 'p=quarantine', checkedAt: daysAgo(1) },
            mx: { ok: true, provider: 'Zoho Mail' },
        },
        last_checked_at: daysAgo(1),
        warmup_started_at: daysAgo(58),
        daily_cap: 45,
        sent_today: 18,
        sent_today_date: new Date().toISOString().slice(0, 10),
        complaint_rate: 0.0004,
        bounce_rate: 0.011,
        created_at: daysAgo(60),
        updated_at: daysAgo(0.1),
    },
];

// ── Executable sequences ─────────────────────────────────────────────────────

const registrarSteps = [
    {
        idx: 0,
        dayOffset: 0,
        subject: 'the 21-day gap at {{company}}',
        body: 'Hi {{firstname}},\n\nMost registrar offices I speak to lose candidates in the same place: the gap between a completed application and an issued offer. Three weeks is normal. Nine days is what one Karnataka university got to after they stopped re-keying applicant data between the admissions tool and the academic office.\n\nIs cycle time something you are actively trying to pull down for the next intake, or is the bigger problem further downstream?\n\nWorth a 20-minute look at where your cycle actually stalls?',
    },
    {
        idx: 1,
        dayOffset: 5,
        subject: 'the honest answer on mid-cycle migration',
        body: 'Hi {{firstname}},\n\nThe objection I hear most is "we cannot migrate mid-cycle" — and most of the time that is correct. There is a narrow safe window, and there are three conditions that have to hold.\n\nWe wrote it up without the vendor gloss, including when to wait: the stage boundary, one owner per stage, and a parallel run of one full stage.\n\nSending it because it is useful whether or not you ever talk to us.',
    },
    {
        idx: 2,
        dayOffset: 10,
        subject: 'one number',
        body: 'Hi {{firstname}},\n\nOne number, then I will leave it: 38 counsellors, zero re-keying, same-day document verification. That was the operational change, not a new dashboard.\n\nIs the academic-office handover a problem worth 20 minutes at {{company}}?\n\nReply with a day and I will work around your calendar.',
    },
    {
        idx: 3,
        dayOffset: 14,
        subject: 'closing the loop',
        body: 'Hi {{firstname}},\n\nI will stop here — clearly not the priority this cycle, which is fair in the middle of an intake.\n\nIf the handover between admissions and academics becomes the thing you want to fix before the next one, the door is open. And if the honest migration guide is the only useful thing that came out of this, that is a fine outcome too.\n\nAll the best with the intake.',
    },
];

const cioSteps = [
    {
        idx: 0,
        dayOffset: 0,
        subject: 'how many systems does one applicant touch at {{company}}?',
        body: 'Hi {{firstname}},\n\nWhen I ask a registrar, a CIO and a finance controller at the same institution how many systems an applicant\'s data passes through before the first fee receipt, I usually get three different numbers. That gap is the integration work your team ends up owning.\n\nAre you consolidating at the group level, or holding the line with integration glue for now?\n\nIf a single-data-model architecture is on the table, worth a technical call.',
    },
    {
        idx: 1,
        dayOffset: 6,
        subject: 'API docs, SSO and the data-residency answer',
        body: 'Hi {{firstname}},\n\nSkipping the pitch — the three things every CIO asks before a first call: the integration surface, SSO and audit logging, and where the data physically sits.\n\nI can send all three as documentation you can hand to your security reviewer, plus a sandbox tenant so your team can test against real API responses instead of a slide.\n\nWant the sandbox and the docs?',
    },
    {
        idx: 2,
        dayOffset: 12,
        subject: 'last one',
        body: 'Hi {{firstname}},\n\nLast note from me. If the current ERP is supported and integration is holding, this is genuinely not urgent for you.\n\nIf an end-of-life or a group consolidation mandate lands, the sandbox offer stands — no commercial conversation needed to use it.',
    },
];

const iqacSteps = [
    {
        idx: 0,
        dayOffset: 0,
        subject: 'six weeks of evidence collection',
        body: 'Hi {{firstname}},\n\nEvery IQAC coordinator I have asked put their last cycle at four to six weeks — almost none of it spent writing the report. It goes to locating evidence across four systems and arbitrating why the enrolment count and the fee-paid count disagree.\n\nIs that roughly your experience at {{company}}, or have you found a way around the reconciliation week?',
    },
    {
        idx: 1,
        dayOffset: 5,
        subject: 'the week-by-week breakdown',
        body: 'Hi {{firstname}},\n\nWe published where the six weeks actually go, week by week, and what disappears when attendance, fees, placements and faculty data sit on one record.\n\nIt also says plainly what still needs a human — the narrative and distinctiveness sections are genuinely authorial and no system writes them.',
    },
];

export const sequences = [
    {
        id: id('seq-registrars'),
        workspace_id: WS,
        campaign_id: id('campaign-intake'),
        content_item_id: id('content-outreach-registrar'),
        name: 'Registrars, cycle time (Q3)',
        channel: 'email',
        mode: 'cold',
        status: 'active',
        steps: registrarSteps,
        send_window: { tz: 'Asia/Kolkata', days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 },
        approved_by: DEMO_USER_ID,
        approved_at: daysAgo(20),
        sending_domain_id: id('domain-outreach'),
        target_list_id: id('list-tier1-registrars'),
        created_at: daysAgo(21),
        updated_at: daysAgo(0.4),
    },
    {
        id: id('seq-cios'),
        workspace_id: WS,
        campaign_id: id('campaign-consolidation'),
        content_item_id: id('content-outreach-cio'),
        name: 'CIOs, consolidation (Q3)',
        channel: 'email',
        mode: 'cold',
        // E1 demo state: this one was ACTIVE and someone edited step 2's copy,
        // which withdrew approval (migration 022 trigger) and stopped its sends.
        // Seeded so the held state is demonstrable — it is the failure the
        // product used to hide, and now the one the screen leads with.
        status: 'draft',
        held_from_status: 'active',
        held_at: daysAgo(1.2),
        held_by: DEMO_USER_ID,
        steps: cioSteps,
        send_window: { tz: 'Asia/Kolkata', days: [1, 2, 3, 4, 5], startHour: 10, endHour: 18 },
        approved_by: null,
        approved_at: null,
        sending_domain_id: id('domain-outreach'),
        target_list_id: id('list-cio-groups'),
        created_at: daysAgo(19),
        updated_at: daysAgo(1.2),
    },
    {
        id: id('seq-iqac'),
        workspace_id: WS,
        campaign_id: id('campaign-accreditation'),
        content_item_id: null,
        name: 'IQAC, accreditation cycle',
        channel: 'email',
        mode: 'warm',
        status: 'approved',
        steps: iqacSteps,
        send_window: { tz: 'Asia/Kolkata', days: [2, 3, 4], startHour: 10, endHour: 16 },
        approved_by: DEMO_USER_ID,
        approved_at: daysAgo(2),
        sending_domain_id: id('domain-outreach'),
        target_list_id: id('list-iqac'),
        created_at: daysAgo(11),
        updated_at: daysAgo(2),
    },
    {
        id: id('seq-kenfin'),
        workspace_id: WS,
        campaign_id: id('campaign-kenfin'),
        content_item_id: null,
        name: 'KenFin expansion (finance buyers)',
        channel: 'email',
        mode: 'warm',
        status: 'draft',
        steps: [
            {
                idx: 0,
                dayOffset: 0,
                subject: 'the reconciliation week you just finished',
                body: 'Hi {{firstname}},\n\nYou have just come out of fee reconciliation at {{company}}. The three-week version of that exists because the fee schedule and the merit list live in different systems.\n\nKenFin closes that handover — same record, same student, no mapping exercise at cycle close.\n\nWorth 20 minutes before the next schedule is published?',
            },
        ],
        send_window: { tz: 'Asia/Kolkata', days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 },
        approved_by: null,
        approved_at: null,
        sending_domain_id: id('domain-outreach'),
        target_list_id: id('list-kenfin'),
        created_at: daysAgo(5),
        updated_at: daysAgo(5),
    },
];

// ── Enrollments, messages, replies ───────────────────────────────────────────

const enrollment = (seqKey, prospectKey, { status, currentStep, nextSendDays, stopReason = '', meetingDays = null, created, heldSinceDays = null }) => ({
    id: id(`enr-${seqKey}-${prospectKey}`),
    workspace_id: WS,
    sequence_id: id(`seq-${seqKey}`),
    prospect_id: id(`prospect-${prospectKey}`),
    status,
    current_step: currentStep,
    next_send_at: nextSendDays == null ? null : daysAhead(nextSendDays),
    stop_reason: stopReason,
    // E1: a held send is still 'active' — the scheduler keeps pushing it 30
    // minutes at a time rather than dropping it. next_send_at alone therefore
    // reads as a normal upcoming send, which is exactly how it stayed invisible.
    hold_reason: heldSinceDays == null ? '' : 'sequence_draft',
    held_since: heldSinceDays == null ? null : daysAgo(heldSinceDays),
    meeting_at: meetingDays == null ? null : daysAhead(meetingDays),
    created_at: daysAgo(created),
    updated_at: daysAgo(Math.max(0.2, created - 8)),
});

export const enrollments = [
    // Registrar sequence — the flagship, 8 enrolled
    enrollment('registrars', 'anantara-registrar', { status: 'meeting', currentStep: 2, nextSendDays: null, meetingDays: 2, created: 19 }),
    enrollment('registrars', 'varshini-admissions', { status: 'stopped_reply', currentStep: 2, nextSendDays: null, stopReason: 'Replied — asked for pricing', created: 19 }),
    enrollment('registrars', 'kaveri-registrar', { status: 'active', currentStep: 3, nextSendDays: 2, created: 18 }),
    enrollment('registrars', 'shivalik-registrar', { status: 'meeting', currentStep: 3, nextSendDays: null, meetingDays: 5, created: 18 }),
    enrollment('registrars', 'sanjeevani-registrar', { status: 'completed', currentStep: 4, nextSendDays: null, created: 17 }),
    enrollment('registrars', 'trinity-admissions', { status: 'active', currentStep: 1, nextSendDays: 1, created: 9 }),
    enrollment('registrars', 'deccan-admissions', { status: 'stopped_unsub', currentStep: 1, nextSendDays: null, stopReason: 'Unsubscribed at touch 2', created: 9 }),
    enrollment('registrars', 'nalanda-admissions', { status: 'paused', currentStep: 0, nextSendDays: null, stopReason: 'Risky email — held for manual review', created: 4 }),

    // CIO sequence — edited 1.2 days ago, so its three live enrollments have
    // been held ever since (E1). They are the "3 sends waiting" on that row.
    enrollment('cios', 'vidyapeeth-cio', { status: 'meeting', currentStep: 2, nextSendDays: null, meetingDays: 4, created: 16 }),
    enrollment('cios', 'himgiri-cio', { status: 'active', currentStep: 2, nextSendDays: 0.02, created: 16, heldSinceDays: 1.2 }),
    enrollment('cios', 'sarala-cio', { status: 'stopped_reply', currentStep: 1, nextSendDays: null, stopReason: 'Replied — sandbox requested', created: 15 }),
    enrollment('cios', 'coastal-it', { status: 'active', currentStep: 1, nextSendDays: 0.02, created: 11, heldSinceDays: 1.2 }),
    enrollment('cios', 'anantara-cio', { status: 'active', currentStep: 0, nextSendDays: 0.02, created: 3, heldSinceDays: 1.2 }),

    // IQAC sequence — approved, first sends scheduled
    enrollment('iqac', 'sanjeevani-iqac', { status: 'active', currentStep: 0, nextSendDays: 1, created: 2 }),
    enrollment('iqac', 'shivalik-iqac', { status: 'active', currentStep: 0, nextSendDays: 1, created: 2 }),
];

const message = (key, { seqKey, prospectKey, stepIdx, subject, status, sentDays, error = '' }) => ({
    id: id(`msg-${key}`),
    workspace_id: WS,
    enrollment_id: id(`enr-${seqKey}-${prospectKey}`),
    prospect_id: id(`prospect-${prospectKey}`),
    sequence_id: id(`seq-${seqKey}`),
    step_idx: stepIdx,
    send_path: 'cold_domain',
    sending_domain_id: id('domain-outreach'),
    provider_message_id: `<${id(`msg-${key}`).slice(0, 18)}@go.ken42.com>`,
    subject,
    status,
    error,
    attempt: 1,
    sent_at: status === 'sent' || status === 'bounced' ? daysAgo(sentDays, { hour: 10 }) : null,
    created_at: daysAgo(sentDays + 0.1),
    updated_at: daysAgo(sentDays),
});

export const messages = [
    // Registrars
    message('r1-anantara-0', { seqKey: 'registrars', prospectKey: 'anantara-registrar', stepIdx: 0, subject: 'the 21-day gap at Anantara University', status: 'sent', sentDays: 19 }),
    message('r1-anantara-1', { seqKey: 'registrars', prospectKey: 'anantara-registrar', stepIdx: 1, subject: 'the honest answer on mid-cycle migration', status: 'sent', sentDays: 14 }),
    message('r1-anantara-2', { seqKey: 'registrars', prospectKey: 'anantara-registrar', stepIdx: 2, subject: 'one number', status: 'sent', sentDays: 9 }),
    message('r1-varshini-0', { seqKey: 'registrars', prospectKey: 'varshini-admissions', stepIdx: 0, subject: 'the 21-day gap at Varshini University', status: 'sent', sentDays: 19 }),
    message('r1-varshini-1', { seqKey: 'registrars', prospectKey: 'varshini-admissions', stepIdx: 1, subject: 'the honest answer on mid-cycle migration', status: 'sent', sentDays: 14 }),
    message('r1-kaveri-0', { seqKey: 'registrars', prospectKey: 'kaveri-registrar', stepIdx: 0, subject: 'the 21-day gap at Kaveri Global University', status: 'sent', sentDays: 18 }),
    message('r1-kaveri-1', { seqKey: 'registrars', prospectKey: 'kaveri-registrar', stepIdx: 1, subject: 'the honest answer on mid-cycle migration', status: 'sent', sentDays: 13 }),
    message('r1-kaveri-2', { seqKey: 'registrars', prospectKey: 'kaveri-registrar', stepIdx: 2, subject: 'one number', status: 'sent', sentDays: 8 }),
    message('r1-shivalik-0', { seqKey: 'registrars', prospectKey: 'shivalik-registrar', stepIdx: 0, subject: 'the 21-day gap at Shivalik Technical University', status: 'sent', sentDays: 18 }),
    message('r1-shivalik-1', { seqKey: 'registrars', prospectKey: 'shivalik-registrar', stepIdx: 1, subject: 'the honest answer on mid-cycle migration', status: 'sent', sentDays: 13 }),
    message('r1-shivalik-2', { seqKey: 'registrars', prospectKey: 'shivalik-registrar', stepIdx: 2, subject: 'one number', status: 'sent', sentDays: 8 }),
    message('r1-sanjeevani-0', { seqKey: 'registrars', prospectKey: 'sanjeevani-registrar', stepIdx: 0, subject: 'the 21-day gap at Sanjeevani University', status: 'sent', sentDays: 17 }),
    message('r1-sanjeevani-1', { seqKey: 'registrars', prospectKey: 'sanjeevani-registrar', stepIdx: 1, subject: 'the honest answer on mid-cycle migration', status: 'sent', sentDays: 12 }),
    message('r1-sanjeevani-2', { seqKey: 'registrars', prospectKey: 'sanjeevani-registrar', stepIdx: 2, subject: 'one number', status: 'sent', sentDays: 7 }),
    message('r1-sanjeevani-3', { seqKey: 'registrars', prospectKey: 'sanjeevani-registrar', stepIdx: 3, subject: 'closing the loop', status: 'sent', sentDays: 3 }),
    message('r1-trinity-0', { seqKey: 'registrars', prospectKey: 'trinity-admissions', stepIdx: 0, subject: 'the 21-day gap at Trinity Institute of Science', status: 'sent', sentDays: 9 }),
    message('r1-trinity-1', { seqKey: 'registrars', prospectKey: 'trinity-admissions', stepIdx: 1, subject: 'the honest answer on mid-cycle migration', status: 'sent', sentDays: 4 }),
    message('r1-deccan-0', { seqKey: 'registrars', prospectKey: 'deccan-admissions', stepIdx: 0, subject: 'the 21-day gap at Deccan Institute of Management', status: 'sent', sentDays: 9 }),
    message('r1-deccan-1', { seqKey: 'registrars', prospectKey: 'deccan-admissions', stepIdx: 1, subject: 'the honest answer on mid-cycle migration', status: 'sent', sentDays: 4 }),

    // CIOs
    message('c1-vidyapeeth-0', { seqKey: 'cios', prospectKey: 'vidyapeeth-cio', stepIdx: 0, subject: 'how many systems does one applicant touch at Vidyapeeth Education Group?', status: 'sent', sentDays: 16 }),
    message('c1-vidyapeeth-1', { seqKey: 'cios', prospectKey: 'vidyapeeth-cio', stepIdx: 1, subject: 'API docs, SSO and the data-residency answer', status: 'sent', sentDays: 10 }),
    message('c1-himgiri-0', { seqKey: 'cios', prospectKey: 'himgiri-cio', stepIdx: 0, subject: 'how many systems does one applicant touch at Himgiri University Group?', status: 'sent', sentDays: 16 }),
    message('c1-himgiri-1', { seqKey: 'cios', prospectKey: 'himgiri-cio', stepIdx: 1, subject: 'API docs, SSO and the data-residency answer', status: 'sent', sentDays: 10 }),
    message('c1-sarala-0', { seqKey: 'cios', prospectKey: 'sarala-cio', stepIdx: 0, subject: 'how many systems does one applicant touch at Sarala Education Trust?', status: 'sent', sentDays: 15 }),
    message('c1-coastal-0', { seqKey: 'cios', prospectKey: 'coastal-it', stepIdx: 0, subject: 'how many systems does one applicant touch at Coastal Institutes Consortium?', status: 'sent', sentDays: 11 }),
    message('c1-coastal-1', { seqKey: 'cios', prospectKey: 'coastal-it', stepIdx: 1, subject: 'API docs, SSO and the data-residency answer', status: 'sent', sentDays: 5 }),
    message('c1-anantara-0', { seqKey: 'cios', prospectKey: 'anantara-cio', stepIdx: 0, subject: 'how many systems does one applicant touch at Anantara University?', status: 'sent', sentDays: 3 }),

    // A queued send and a bounce — the honest operational states
    message('r1-nalanda-0', { seqKey: 'registrars', prospectKey: 'nalanda-admissions', stepIdx: 0, subject: 'the 21-day gap at Nalanda Global Institute', status: 'bounced', sentDays: 4, error: 'SMTP 550 — mailbox unavailable (catch-all domain)' }),
    message('i1-sanjeevani-0', { seqKey: 'iqac', prospectKey: 'sanjeevani-iqac', stepIdx: 0, subject: 'six weeks of evidence collection', status: 'queued', sentDays: 0.1 }),
    message('i1-shivalik-0', { seqKey: 'iqac', prospectKey: 'shivalik-iqac', stepIdx: 0, subject: 'six weeks of evidence collection', status: 'queued', sentDays: 0.1 }),
];

export const replies = [
    {
        id: id('reply-varshini'),
        workspace_id: WS,
        prospect_id: id('prospect-varshini-admissions'),
        enrollment_id: id('enr-registrars-varshini-admissions'),
        message_id: id('msg-r1-varshini-1'),
        kind: 'reply',
        source: 'zoho_poll',
        raw_snippet:
            'Thanks Priya — the migration piece was genuinely useful, I forwarded it to our CIO. We renew with our current admissions vendor in November. Can you send indicative pricing for 12,000 students, KenRoll plus the fee module? Also need to know whether you can co-exist with our academic system for one cycle.',
        classified: 'interested_pricing',
        provider_email_id: 'zoho_18829301',
        received_at: hoursAgo(31),
        created_at: hoursAgo(31),
    },
    {
        id: id('reply-sarala'),
        workspace_id: WS,
        prospect_id: id('prospect-sarala-cio'),
        enrollment_id: id('enr-cios-sarala-cio'),
        message_id: id('msg-c1-sarala-0'),
        kind: 'reply',
        source: 'zoho_poll',
        raw_snippet:
            'Four campuses, four answers — you are not wrong. Send the sandbox and the SSO/audit documentation. I will have my security reviewer look before we talk commercials. No timeline pressure from our side, our ERP is supported until next year.',
        classified: 'interested_technical',
        provider_email_id: 'zoho_18829344',
        received_at: hoursAgo(54),
        created_at: hoursAgo(54),
    },
    {
        id: id('reply-anantara'),
        workspace_id: WS,
        prospect_id: id('prospect-anantara-registrar'),
        enrollment_id: id('enr-registrars-anantara-registrar'),
        message_id: id('msg-r1-anantara-2'),
        kind: 'reply',
        source: 'zoho_poll',
        raw_snippet:
            'Happy to do 20 minutes. The academic handover is exactly the problem — we re-key everything twice and our IQAC coordinator does it a third time for NAAC. Tuesday or Wednesday afternoon works. Please include whoever can speak to the fee mapping.',
        classified: 'meeting_booked',
        provider_email_id: 'zoho_18829102',
        received_at: daysAgo(6, { hour: 15 }),
        created_at: daysAgo(6, { hour: 15 }),
    },
    {
        id: id('reply-shivalik'),
        workspace_id: WS,
        prospect_id: id('prospect-shivalik-registrar'),
        enrollment_id: id('enr-registrars-shivalik-registrar'),
        message_id: id('msg-r1-shivalik-2'),
        kind: 'reply',
        source: 'zoho_poll',
        raw_snippet:
            'We are mid-intake so nothing happens before October, but our NAAC cycle is in February and the evidence problem you described is real. Book something for the first week of October and copy Deepak, our IQAC coordinator.',
        classified: 'meeting_booked',
        provider_email_id: 'zoho_18829188',
        received_at: daysAgo(4, { hour: 11 }),
        created_at: daysAgo(4, { hour: 11 }),
    },
    {
        id: id('reply-vidyapeeth'),
        workspace_id: WS,
        prospect_id: id('prospect-vidyapeeth-cio'),
        enrollment_id: id('enr-cios-vidyapeeth-cio'),
        message_id: id('msg-c1-vidyapeeth-1'),
        kind: 'reply',
        source: 'zoho_poll',
        raw_snippet:
            'Group mandate to consolidate vendors landed last month, so the timing is good. Send docs. Warning: seven campuses, three different fee structures, and one campus still on a 2018 ERP version. If your migration story survives that, we should talk properly.',
        classified: 'meeting_booked',
        provider_email_id: 'zoho_18829377',
        received_at: daysAgo(8, { hour: 16 }),
        created_at: daysAgo(8, { hour: 16 }),
    },
    {
        id: id('reply-trinity-ooo'),
        workspace_id: WS,
        prospect_id: id('prospect-trinity-admissions'),
        enrollment_id: id('enr-registrars-trinity-admissions'),
        message_id: id('msg-r1-trinity-1'),
        kind: 'ooo',
        source: 'zoho_poll',
        raw_snippet: 'I am away until the 12th with limited access to email. For admissions queries please write to admissions-office@trinityscience.edu.in.',
        classified: 'out_of_office',
        provider_email_id: 'zoho_18829401',
        received_at: daysAgo(3, { hour: 9 }),
        created_at: daysAgo(3, { hour: 9 }),
    },
    {
        id: id('reply-deccan-unsub'),
        workspace_id: WS,
        prospect_id: id('prospect-deccan-admissions'),
        enrollment_id: id('enr-registrars-deccan-admissions'),
        message_id: id('msg-r1-deccan-1'),
        kind: 'unsub',
        source: 'zoho_poll',
        raw_snippet: 'Please remove me from this list.',
        classified: 'unsubscribe',
        provider_email_id: 'zoho_18829410',
        received_at: daysAgo(3, { hour: 14 }),
        created_at: daysAgo(3, { hour: 14 }),
    },
    {
        id: id('reply-nalanda-bounce'),
        workspace_id: WS,
        prospect_id: id('prospect-nalanda-admissions'),
        enrollment_id: id('enr-registrars-nalanda-admissions'),
        message_id: id('msg-r1-nalanda-0'),
        kind: 'bounce',
        source: 'zoho_poll',
        raw_snippet: 'Delivery to the following recipient failed permanently: 550 5.1.1 mailbox unavailable.',
        classified: 'hard_bounce',
        provider_email_id: 'zoho_18829412',
        received_at: daysAgo(4, { hour: 10 }),
        created_at: daysAgo(4, { hour: 10 }),
    },
];

export const suppression_list = [
    {
        id: id('supp-deccan'),
        workspace_id: WS,
        email: 'imran.sheikh@deccanim.edu.in',
        reason: 'unsub',
        source_message_id: id('msg-r1-deccan-1'),
        created_at: daysAgo(3, { hour: 14 }),
    },
    {
        id: id('supp-nalanda'),
        workspace_id: WS,
        email: 'vikram.sinha@nalandaglobal.edu.in',
        reason: 'hard_bounce',
        source_message_id: id('msg-r1-nalanda-0'),
        created_at: daysAgo(4, { hour: 10 }),
    },
    {
        id: id('supp-manual'),
        workspace_id: WS,
        email: 'info@himgirigroup.edu.in',
        reason: 'manual',
        source_message_id: null,
        created_at: daysAgo(22),
    },
];
