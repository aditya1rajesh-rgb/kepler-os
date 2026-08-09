/**
 * Page-reader stand-in for the demo build.
 *
 * Ken42's own site returns the stored snapshot (so the source-freshness check reads
 * "In sync"); competitor and third-party URLs return a short, plausible page so
 * teardown and grounding features have something real-shaped to work with.
 */
import { KEN42_SITE } from './dataset/website';
import { sleep } from './flag';

const COMPETITOR_PAGES = {
    'meritto.com': {
        title: 'Meritto — Purpose-built for Education',
        description: 'Education CRM for admissions teams: enquiry capture, counsellor workflows, application tracking.',
        bodyText:
            'Meritto (formerly NoPaperForms) — Purpose-built for Education. Admission management software that helps institutions manage applications, track process, automate workflows and improve communication with applicants. Trusted by education organisations across India. Enquiry management, counsellor productivity, application forms, fee payment, communication automation. Book a demo.',
    },
    'camudigitalcampus.com': {
        title: 'Camu Digital Campus — University Management ERP',
        description: 'Combined student information system and CRM for higher education institutions.',
        bodyText:
            'Camu Digital Campus — College and university management ERP software. A combined SIS and CRM, so you do not require two different admission and academic systems. Admissions, academics, attendance, examinations, fees, outcome-based education, accreditation support. Serving institutions across India, the Middle East and Africa.',
    },
    'academiaerp.com': {
        title: 'Academia ERP — Higher Education Management Software',
        description: 'Complete higher-ed management software for academic and administrative operations.',
        bodyText:
            'Academia ERP/SIS by Serosoft — complete higher education management software designed for institutions to streamline academic and administrative tasks. Modules for admissions, academics, examinations, finance, HR, hostel and transport. Deployed across universities and colleges internationally.',
    },
    'creatrixcampus.com': {
        title: 'Creatrix Campus — Accreditation and Campus Management',
        description: 'Outcome-based education, accreditation management and campus automation.',
        bodyText:
            'Creatrix Campus — higher education software for accreditation management, outcome-based education, faculty performance and campus automation. Support for NAAC, NBA, ABET and other accreditation frameworks with evidence collection and reporting.',
    },
};

/** Hostname without `www.`, or '' when the URL is unparseable. */
const hostOf = (raw) => {
    try {
        return new URL(raw.startsWith('http') ? raw : `https://${raw}`).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
};

const empty = (url = '') => ({
    ok: false,
    url,
    source: null,
    title: '',
    description: '',
    bodyText: '',
    errors: ['demo: no snapshot for this URL'],
});

/** Same contract as the real `fetchWebsiteContent`. */
export const fetchDemoWebsiteContent = async (url) => {
    await sleep(500);
    const raw = String(url ?? '').trim();
    if (!raw) return empty();

    const host = hostOf(raw);
    if (!host) return empty(raw);

    if (host.endsWith('ken42.com')) {
        return {
            ok: true,
            url: KEN42_SITE.url,
            source: 'jina',
            title: KEN42_SITE.title,
            description: KEN42_SITE.description,
            bodyText: KEN42_SITE.bodyText,
            errors: [],
        };
    }

    const page = COMPETITOR_PAGES[host];
    if (page) {
        return { ok: true, url: raw, source: 'jina', ...page, errors: [] };
    }

    // Unknown host — a generic but honest-looking page rather than a failure, so a
    // URL typed live during a demo still produces output.
    return {
        ok: true,
        url: raw,
        source: 'jina',
        title: host,
        description: `Page content for ${host}.`,
        bodyText: `${host} — page content captured by the reader. This is a demo snapshot: the demo build never reaches the network, so any URL outside the bundled set returns this placeholder rather than live content.`,
        errors: [],
    };
};
