// Build a self-contained, print-ready HTML report from an ABM research result and
// open it in a new tab (Blob URL) so the user can save/print it as PDF. No deps —
// all styling is inlined. Captures everything the on-screen card shows plus the
// fuller fields (phone, email, confidence, icp relevance, flags) and the full
// research brief that the card doesn't render.

const esc = (s) =>
    String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

const TIER_LABEL = { enterprise: 'Enterprise', 'mid-market': 'Mid-market', smb: 'SMB' };
const fullName = (c) => [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';

const fact = (label, value) =>
    value ? `<div class="fact"><span class="fact__l">${esc(label)}</span><span class="fact__v">${esc(value)}</span></div>` : '';

const contactRow = (c) => `
    <tr>
      <td>
        <div class="c-name">${esc(fullName(c))}</div>
        <div class="c-sub">${esc([c.title, c.company].filter(Boolean).join(' · '))}</div>
        ${c.fitReasoning ? `<div class="c-why">${esc(c.fitReasoning)}</div>` : ''}
      </td>
      <td class="ctr">${esc(c.seniorityTier || '')}</td>
      <td class="ctr"><span class="fit">${Number.isFinite(c.fitScore) ? c.fitScore : ''}</span></td>
      <td>${esc(c.email || '—')}</td>
      <td>${esc(c.phone || '—')}</td>
      <td>${c.linkedinUrl ? `<a href="${esc(c.linkedinUrl)}">LinkedIn</a>` : '—'}</td>
      <td class="ctr">${esc(c.source || '')}${c.confidence ? ` · ${esc(c.confidence)}` : ''}</td>
    </tr>`;

// The inner content for one account (reused by single + batch reports).
const reportBody = (result, workspaceName) => {
    const { account = {}, contacts = [], sources = [], researchBrief = '', note = '' } = result || {};
    const generated = new Date().toLocaleString();
    const briefHtml = researchBrief
        ? researchBrief.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')
        : (account.whyGrounding ? `<p>${esc(account.whyGrounding)}</p>` : '<p class="muted">No research narrative was captured.</p>');

    return `<div class="page">
  <div class="top">
    <div>
      <div class="brand">${esc(workspaceName || 'Kepler')} · ABM Research</div>
      <h1>${esc(account.companyName || 'Unknown company')}</h1>
      ${account.domain ? `<a class="domain" href="https://${esc(account.domain)}">${esc(account.domain)}</a>` : ''}
    </div>
    <div class="meta">Generated ${esc(generated)}<br>${contacts.length} contact${contacts.length === 1 ? '' : 's'}</div>
  </div>

  <div class="badges">
    ${account.icpFit ? `<span class="badge">${esc(account.icpFit)} ICP fit</span>` : ''}
    ${account.tier ? `<span class="badge">${esc(TIER_LABEL[account.tier] ?? account.tier)}</span>` : ''}
  </div>

  <div class="facts">
    ${fact('Size', account.employeeSize)}
    ${fact('Revenue', account.revenue)}
    ${fact('Recommended channel', account.recommendedChannel)}
  </div>

  ${account.techSignals?.length ? `<div class="chips">${account.techSignals.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}

  <h2>Research brief</h2>
  <div class="brief">${briefHtml}</div>

  <h2>Target contacts</h2>
  ${note ? `<div class="note">${esc(note)}</div>` : ''}
  ${contacts.length ? `<table>
    <thead><tr><th>Contact</th><th class="ctr">Seniority</th><th class="ctr">Fit</th><th>Email</th><th>Phone</th><th>LinkedIn</th><th class="ctr">Source</th></tr></thead>
    <tbody>${contacts.map(contactRow).join('')}</tbody>
  </table>` : '<p class="muted">No contacts surfaced for this account.</p>'}

  ${sources.length ? `<h2>Sources</h2><ul class="sources">${sources.map((s) => `<li><a href="${esc(s.url)}">${esc(s.title || s.url)}</a></li>`).join('')}</ul>` : ''}
</div>`;
};

const wrapDoc = (title, inner) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { --ink:#101317; --muted:#5b6472; --line:#e5e8ee; --accent:#4a6cf7; --bg:#fff; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:'Inter',ui-sans-serif,system-ui,-apple-system,sans-serif; color:var(--ink); background:#f4f6fb; }
  .page { max-width:880px; margin:0 auto; padding:40px 44px; background:var(--bg); }
  .top { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid var(--accent); padding-bottom:16px; margin-bottom:24px; }
  .brand { font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:var(--accent); font-weight:700; }
  .top h1 { margin:6px 0 2px; font-size:26px; font-weight:700; }
  .top .domain { color:var(--muted); font-size:13px; text-decoration:none; }
  .meta { text-align:right; font-size:11px; color:var(--muted); line-height:1.6; }
  .badges { display:flex; gap:8px; flex-wrap:wrap; margin:14px 0 18px; }
  .badge { font-size:12px; font-weight:600; padding:4px 10px; border-radius:999px; background:#eef1fb; color:var(--accent); border:1px solid #dbe2fb; }
  .facts { display:flex; gap:28px; flex-wrap:wrap; margin-bottom:18px; }
  .fact__l { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
  .fact__v { font-size:15px; font-weight:600; }
  .chips { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:20px; }
  .chip { font-size:11px; padding:3px 9px; border-radius:6px; background:#f1f3f8; color:#3a4250; border:1px solid var(--line); }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:26px 0 10px; border-bottom:1px solid var(--line); padding-bottom:6px; }
  .brief p { font-size:14px; line-height:1.65; margin:0 0 12px; }
  .muted { color:var(--muted); }
  table { width:100%; border-collapse:collapse; font-size:12.5px; }
  th { text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); padding:8px 10px; border-bottom:1px solid var(--line); }
  td { padding:10px; border-bottom:1px solid var(--line); vertical-align:top; }
  .ctr { text-align:center; white-space:nowrap; }
  .c-name { font-weight:600; }
  .c-sub { color:var(--muted); font-size:11.5px; margin-top:1px; }
  .c-why { color:#6a7686; font-size:11px; margin-top:3px; font-style:italic; }
  .fit { display:inline-block; min-width:30px; font-weight:700; color:var(--accent); }
  a { color:var(--accent); }
  .sources li { font-size:12px; margin-bottom:4px; }
  .note { font-size:12px; color:var(--muted); background:#f7f8fc; border:1px solid var(--line); border-radius:8px; padding:10px 12px; margin-bottom:16px; }
  @media print { body { background:#fff; } .page { padding:0; max-width:none; } }
</style></head>
<body>${inner}</body></html>`;

/** Full print-ready report for one researched account. */
export const buildReportHtml = (result, { workspaceName = '' } = {}) =>
    wrapDoc(`ABM Research — ${result?.account?.companyName || 'Account'}`, reportBody(result, workspaceName));

/** Combined report for a batch of researched accounts (one page-break per account). */
export const buildBatchReportHtml = (results, { workspaceName = '' } = {}) =>
    wrapDoc(
        `ABM Research — ${results?.length ?? 0} accounts`,
        (results ?? []).map((r) => reportBody(r, workspaceName)).join('<div style="page-break-after:always"></div>'),
    );

/** Open an HTML report string in a new tab for the user to print/save as PDF. */
export const openReport = (html) => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
};
