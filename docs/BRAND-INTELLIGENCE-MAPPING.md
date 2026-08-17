# Brand Intelligence — component inventory and mapping decisions

Working document. Siphron direction. Five surfaces, the largest module in the
product and the one every gated module depends on.

Read from `pages/workspace-modules/BrandIntelligence.jsx` (1,243 lines) and
`components/brand-intelligence/*` (19 files). Content pulled from the running
demo, tab by tab.

**Status: inventory complete, mappings decided, four copy defects already fixed.**

---

## The headline finding

**Five fields are rendered on two tabs, each with its own edit affordance.**

| Field | Brand Overview | Business Details |
| --- | --- | --- |
| Tagline | ✓ | ✓ |
| Business overview | ✓ | ✓ |
| Brand values | ✓ | ✓ |
| Voice / tone | ✓ | ✓ |
| Aesthetic | ✓ | ✓ |

This is the Audiences finding again, in a different module: a tab strip whose
children were built separately and grew into each other. Editing the tagline in
Business Details and editing it in Brand Overview are the same write, but the
screen gives no sign of that.

**Decided: one field, one home.**

- **Brand Overview owns identity** — name, website, tagline, business overview,
  values, voice, aesthetic, and the colour identity.
- **Business Details owns commercial substance** — offers, offer descriptions,
  differentiators, pain points solved, proof points, key messages, and the
  additional-context block.

Business Details keeps its "Generate from sources" control, which still writes
the identity fields; they are one tab away and do not need a second editor. The
same rule as Outreach: relocate, never remove.

## Second finding: machine values reaching the screen

Three in one module, all now fixed:

| Where | Rendered | Now |
| --- | --- | --- |
| File Intelligence, Type column | `VND.OPENXMLFORMATS-OFFICEDOCUMENT.SPREADSHEETML.SHEET` | `XLSX` |
| Business Details, additional context | `keyMessages` | `Key messages` |
| File Intelligence, Uploaded column | `26/07/2026, 18:55:11` | `26/07/2026` |

The Type column was `mimeType.split('/').pop().toUpperCase()`, which is fine for
`application/pdf` and 53 characters wide for anything from Office. It now maps
known types, falls back to the file's own extension, then to `—`.

Also fixed: `Messaging summary - available after enrichment` (hyphen as dash).

**`BrandHealthStrip.jsx` is dead code.** Its five figures were moved into the
screen's status line; nothing imports the component. Left in place, flagged here.

---

## A · Brand Overview

Two columns. Left (60%): Brand Name and Website URL (read-only, owned by the
workspace), Tagline, Business Overview. Right (40%): Brand Values, Aesthetic,
Voice / Tone as chip groups. Below both: the colour identity panel.

Every generative field carries a **per-section control** that is idle / running
/ done / error, and the error branch changes the retry label by error kind:
`insufficient_context` offers **no retry at all** ("Add more sources"), because
re-spending a credit on the same request cannot fix it.

Editing is a mode: chip adders appear, inputs unlock, the primary action becomes
Save, and the status line gains an `Editing` flag.

**Status line** (not a panel): `86% confidence · Synced 04/08/2026`, plus stale
and unscored counts when non-zero.

**Rail** — `Sources & learning`, Overview only:
- *Refresh from sources* — the population banner: running (six named stages),
  success (`Brand populated from {sources}. {n} fields updated.`), partial,
  error.
- *Learned updates* — brand-model changes mined from consistently high-rated
  output, each accepted or dismissed explicitly. Nothing lands without a click.

## B · Business Details

Its own header row with Generate from sources + Edit, then the commercial
fields, proof points, and the additional-context block.

**Proof points are the strictest thing in the module.** Only `confidence: high`
entries render, and the empty state says why: *"No verified proof points yet.
Stats must be explicitly sourced."* That is a refusal to invent a number, and it
survives the redesign untouched.

## C · Competitor Intelligence

Already master-detail, which is the pattern Research adopted this cycle:
suggestions across the top, confirmed competitors as a list on the left, the
selected competitor's detail on the right, and an add-manually form under the
list.

Real content: 7 confirmed (Meritto, Camu, Academia ERP, Creatrix, LeadSquared,
ExtraaEdge, Ellucian), 1 suggested (PowerSchool) with the rationale that earned
it — *"Named alongside Ken42 in 4 of 12 Perplexity answers…"*.

Detail: Name, URL, Reason / messaging notes, Messaging summary with its own
generate control.

## D · Audience & ICP

Suggested ICPs at the top (each with the evidence that produced it), then
confirmed ICPs as full cards. The card is the second-densest object in the
product after the Research result: job titles, firmographics, primary pains,
triggers, blockers, buying context, messaging hooks, preferred channels,
targeting, and two hand-offs (Draft outreach, Create ads).

**Targeting states its own absence**: *"Not set — ad targeting falls back to
keywords and audiences."* Create ads needs it, and a blank would not say so.

## E · File Intelligence

Upload zone, a refresh action, and an 8-column table: File name, Type, Uploaded,
State, Included, Learned, Size, Actions. `Learned` shows up to three extracted
themes, which is the only place the product shows what a file actually taught it.

---

## Mapping table

| # | Kepler component | Siphron form | Outcome | Note |
| --- | --- | --- | --- | --- |
| — | 5-tab strip | segmented control | maps | |
| A | two-column field form | form grid | maps | 60/40 split holds at 1116 |
| A | chip groups + chip adder | pill row + inline add | maps | |
| A | colour identity panel | swatch row | bends | swatches become labelled tiles; hex stays visible, it is the value being edited |
| A | per-section generate control | *no analogue* | **new** | four states, and the error state changes its own retry label |
| A | status line health | status slot | maps | |
| R | population banner | rail ToolCard | maps | |
| R | learned updates | rail ToolCard | maps | |
| B | commercial scalars | form | maps | |
| B | proof points | pill row | maps | high-confidence only, and says so |
| B | additional context | definition list | maps | |
| C | suggestion card | raised card + badge | maps | |
| C | confirmed list + detail | master-detail | maps | same form as Research |
| D | ICP suggestion card | raised card + badge | maps | |
| D | confirmed ICP card | *no analogue* | bends | ten labelled blocks; needs a two-column card, not a stack |
| E | file table | data table | maps | 8 columns, full-word headers already |
| E | upload zone | dashed inset | maps | already drawn for Research bulk |

## Built in Figma

Page `Brand Intelligence — Siphron`.

| Frame | Contents |
| --- | --- |
| `Brand Intelligence · Brand Overview` | identity form, chip groups, six-swatch colour identity, the `Sources & learning` rail |
| `Brand Intelligence · Business Details` | commercial fields, proof points, additional context including Key messages |
| `Brand Intelligence · Competitor Intelligence` | PowerSchool suggestion, 7 confirmed competitors, Meritto detail |
| `Brand Intelligence · Audience & ICP` | two suggestions with the evidence that produced them, the confirmed ICP card as two columns |
| `Brand Intelligence · File Intelligence` | upload zone and the 8-column table, four real files |

Decided while drawing:

- **Swatch value above caption.** Captions wrap at these widths ("Light /
  background" takes two lines), which pushed the hex values onto different
  baselines. The hex is the value being edited, so it leads.
- **The tab collapse gets no on-screen caption.** A line reading "identity
  fields live in Brand Overview" was drawn and then removed: it explains a
  design decision to someone who never saw the old duplication, which is exactly
  what the no-rationale rule forbids.
- **Row actions are links, not buttons.** Three buttons per file row need
  ~235px; the table has 170. Same treatment as the Audiences table's `Open`.

**States frame: `Brand Intelligence — states` (`159:115`), thirty states** across
seven sections — the largest in the file at 4,801px. The count of fourteen empties
was low: there are eighteen distinct messages in twenty-two renderings, because
five of them are rendered from *two* panels each. `No values yet.`,
`No tone defined yet.` and `No aesthetic tags yet.` all exist in both
`BrandOverviewPanel` and `BusinessDetailsPanel` — the tab-collapse finding
showing up again in the empties. They are drawn **once**, on Brand Overview,
which owns identity; the port deletes the duplicates along with the fields above
them.

Three findings in the generate control, which is six branches and not four:

- **`insufficient_context` offered nothing at all.** No retry is right, but the
  state was a dead end — and two things in the code say that was not the intent.
  `retryLabelForKind` returns `'Add more sources'` for a button `blockRetry`
  suppresses, so the label is unreachable; and the message itself ends
  *"…then try again"* while the only button is gone. The state now keeps its
  error text, drops the trailing clause, and offers a **link** to File
  Intelligence. A link is not a retry and costs no credit.
- **`Generating…` renders twice** in the running state, once as status text
  (`:73`) and once as the disabled button's label (`:89`).
- **The population banner prints raw source keys.** `sourcesUsed.join(' + ')`
  over the seeded values produces *"Brand populated from website:ken42.com +
  file:Ken42-Institutional-Deck-2026.pdf + file:KenRoll-Case-Study.pdf."* The
  frame draws both that and the proposed
  *"Brand populated from your website and 2 project files."* Separately,
  `fieldsUpdated` is absent from `population_meta`, so the `{n} fields updated.`
  clause quoted above never appears in the demo.

This module also renders absence three ways — `—`, `None` and `Not set`. One
wins: `—`, with a sentence only where absence has a consequence, which is
targeting alone. See `docs/STATES-MAPPING.md`.

## Rules this module re-tests

1. **Nulls render `—`.** The file table used `'-'`; fixed.
2. **Empty states are not interchangeable.** This module has fourteen distinct
   ones across five tabs, plus four population-banner states and four
   per-section generation states.
3. **Disclosure copy stays.** The proof-point rule, the targeting absence, the
   `insufficient_context` no-retry branch, and the learned-updates explanation
   are all statements about the user's data or spend.
