/**
 * The Ken42 website as the page reader sees it.
 *
 * Used for two things: the live "has the source site changed?" check (which
 * compares this against the snapshot in population_meta.websiteSource — identical,
 * so the demo reads "In sync"), and any website-grounded generation, so those calls
 * work with the site offline.
 *
 * Condensed from ken42.com's public pages.
 */
export const KEN42_SITE = {
    url: 'https://ken42.com',
    title: 'Ken42 — The AI-Native Operating System for Modern Universities',
    description:
        'Ken42 unifies admissions, academics, administration and student engagement on one AI-native platform built for higher education.',
    bodyText: `Ken42 — The AI-Native Operating System for Modern Universities

Not Another Tool. The Intelligent Backbone of Your Institution.

Higher education runs on fragmented software. A separate admissions CRM. A student information system that cannot see it. A fee tool, a placement tracker, spreadsheets in every department. Ken42 replaces the stack with one AI-native platform covering the full student lifecycle on a single data model.

The platform
KenRoll — Admissions and enrolment. Application-to-enrolment workflow, counsellor pipelines, document verification, offer letters.
KenLearn — Academic operations. Timetabling, attendance, examinations, results, faculty workload.
KenMeet — Student engagement. Communication and support across WhatsApp, email and app.
KenFin — Fees and finance. Fee schedules, collections, refunds, scholarships, reconciliation.
KenCareers — Placements and alumni. Placement drives, recruiter pipelines, alumni engagement.
KenOps — Administration. Hostel, transport, inventory and HR adjacency.
KenCompliance — Governance and compliance. Accreditation evidence, statutory reporting, audit trails.
KenNovate — The AI layer. Agentic workflows, predictive intervention, natural-language reporting.

Outcomes institutions report
30-50% reduction in manual administrative effort.
Faster admissions cycles through end-to-end online admission software.
Higher student satisfaction through AI-powered engagement.
One platform replacing six to nine point tools per campus.

Who we build for
Standalone universities, large education groups and multi-campus institutions. Leading institutions across India and globally.

Built in India. Designed for the World.
Accreditation, fee structures, scholarship exceptions and merit-list logic were first-class problems from day one — not a configuration layer added later. NAAC, NIRF, AICTE and UGC reporting are native.

Request a demo.`,
};
