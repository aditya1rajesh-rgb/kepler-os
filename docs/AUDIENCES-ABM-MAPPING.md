# Audiences and ABM — component inventory and mapping decisions

Working document. Siphron direction. The last two unbuilt Outreach children.

Read from `pages/workspace-modules/{OutreachAudiences,OutreachLists,AbmSaved,
Prospecting,AbmResearch}.jsx`, `components/outreach/{ListDetail,AddToListModal}.jsx`,
`components/abm-research/AbmResultCard.jsx`.

**Status: inventory complete, both decisions taken, both pages built in Figma,
copy defects fixed in code.**

---

## The headline finding

**Audiences has three tabs, seven panels, four objects — and two of those
objects are rendered twice.**

E30 merged three sibling screens into one tab strip. It kept each screen whole,
which was the right call for shipping. But two of the three already contained
each other's content, so the overlap that used to be spread across three nav
stops is now visible inside one screen.

| Tab | Panel | Object it shows | Also shown in |
| --- | --- | --- | --- |
| Lists | list of prospect lists | List | Saved research → Lists |
| Lists (`?listId=`) | member table | List members | — |
| Saved research | Accounts segment | Account | — |
| Saved research | Prospects segment | Prospect | Find prospects (lower panel) |
| Saved research | Lists segment | List | Lists tab |
| Find prospects | Apollo search + results | Search | — |
| Find prospects | saved prospects panel | Prospect | Saved research → Prospects |

The pairs are **near-duplicates, not identical**, which is worse than either
extreme:

- **Prospects.** Both panels read `prospectsService.list`, render the same
  `prospect-row`, the same `SelectionBar`, the same Add-to-list and
  Push-to-Zoho. Saved's copy adds a `PanelHeader` carrying the Zoho status;
  Find's does not. Selection state is per-panel, so selecting six people under
  Find and switching to Saved shows nothing selected.
- **Lists.** The Lists tab row offers Open and Delete and opens the detail
  in place (`?listId=`). The Saved → Lists row offers Open, **Build sequence**
  and Delete, and navigates away to the Lists tab to open the same detail. Same
  object, two action sets, two behaviours.

Two consequences follow for the redesign, and they are the decisions below: the
Figma page either draws this faithfully or draws the object model underneath it,
and **that choice has to be made before anything is drawn**, because it changes
the tab strip, the frame count and every empty state.

## The second finding: Audiences is where the E30 rename did not reach

Four strings still send the user to screens that no longer exist under those
names, and one seniority value reaches the screen unformatted.

| Where | Renders | Should be |
| --- | --- | --- |
| `OutreachLists` empty | "Save prospects in ABM Research or Prospecting…" | ABM, or Find prospects |
| `ListDetail` empty | "Add prospects from ABM Research or Prospecting." | same |
| `AbmSaved` prospects empty | "Save contacts from ABM Research or Prospecting." | same |
| `AbmResultCard` notice | "…find them under Prospecting." | Audiences → Saved research |
| `AbmSaved` lists empty | "Select prospects **above** and “Add to list”." | Prospects is a sibling segment, not above |
| `AbmResultCard` table cell | `decision_maker`, `economic_buyer` | Decision maker, Economic buyer |

The last one is a raw database value printed into a table cell:
`AbmResultCard.jsx:235` renders `{c.seniorityTier}` with no label map, so the
Seniority column reads `decision_maker` for every primary contact in the demo.

These are copy defects, not design questions. They are fixed in code alongside
the build, in the same class as the copy fixes already made on the four
finished screens.

---

## A · Audiences → Lists

**List row.** Name (600) over `{n} prospects`. Actions: Open (secondary,
arrow), Delete (ghost). Whole row is a button; Enter opens.

**States:** loading (`Loading lists…`) · error banner (`Could not load your
lists.`) · empty (`No lists yet…`). Three, and per the rule they stay three.

**List detail** (`?listId=`, so it is shareable and Back closes it). The
densest table in the product:

- Head: Back to Lists · list name + `{n} contacts` · Enrich · Export CSV ·
  Build sequence.
- Table: checkbox · Name · Title · Company · Email · Phone · LinkedIn · remove.
  Full-word headers already. Nulls already render `—`.
- Email verification badge, only after an enrich run: valid · role · no MX ·
  disposable · invalid, each with a tooltip that says what it does **not**
  prove ("Passed format + domain (MX) checks. Not mailbox-confirmed").
- `SelectionBar` appears on selection: select all / top N / clear, plus
  Enrich N and Export N.
- Enrich modal: emails / phones / both, with a live credit estimate
  (1 per email, 8 per phone) and the honest caveat about phone delays.
- Enrichment runs batched ≤10 with `Enriching… 4/23` and a Stop link.

**States:** loading · empty list · error · Apollo-not-connected hint · enriching
· post-run notice. Six, all distinct.

## B · Audiences → Saved research

Segmented into Accounts · Prospects · Lists, each carrying its own count in the
segment label.

**Account row.** Company name over `{tier} · {fit} fit · {employees}`, remove
action. Opens a read-only `AbmResultCard` behind a Back link.

**Prospect row.** Checkbox + name, then `{title} · {company}`. Pushed rows show
`In Zoho` and lose their checkbox.

## C · Audiences → Find prospects

The Apollo search form lives on the canvas, not in a rail — the source records
why: it was tried in the 320px rail and the placeholders truncated to
`e.g. Hea…`. **A form that feeds the screen's own primary action must not be
behind a toggle.** That rule carries into Siphron unchanged.

Six controls: ICP pills (from saved personas) · Job titles · Keywords ·
Locations · Seniority pills (6) · Company size pills (8). Then Search prospects
and, once there are results, Save all to list.

`searchInfo` is a single line doing two jobs: `25 shown of 312 matches · emails
need Apollo enrichment (not returned by search)` or `No matches (0 found)`. The
second is a **result**, not an empty state, and must not be dressed as one.

## D · ABM, which the nav calls **Research**

`moduleRegistry` labels this child `Research`, and the app header renders
`Outreach / Research`. "ABM" is the internal name (route `/outreach/abm`, files
`Abm*.jsx`) and it is what this document calls it, but **no user-facing string
may say ABM** — that was the same defect as the stale "Prospecting" references.
The Figma frames and every empty state name it Research.

A chat layer over a research pipeline. Composer at the bottom, transcript above,
a collapsible **Bulk research** strip on the canvas (upload zone + paste box,
up to `MAX_COMPANIES` per run, paced ≥12s per company, cancellable, retry
failed).

Per turn: user bubble → typing dots → **result card**, or `Cancelled — not
researched.`, or the error.

**The result card is the densest object in the product.** Denser than the reply
row, denser than the campaign step row:

1. Account brief: company name, domain link, ICP-fit badge, tier badge.
2. Fact row: Size · Revenue · Channel.
3. Tech-signal chips (up to 5 in the demo).
4. `whyGrounding` prose, 3 to 5 lines.
5. Sources disclosure, `{n} sources` with captured URLs.
6. Panel header: `Target contacts · {n}` + Report + Save research + Save N to
   prospect list.
7. Contacts table: checkbox · Contact (name, title · company, fit reasoning) ·
   Seniority · **Fit score 0-100** · Status · LinkedIn.
8. CRM-dedupe note with a show/hide for contacts already in Zoho.
9. Rating control.

Selection is cross-card: the parent `SelectionBar` counts contacts across every
completed card, and "select top N" ranks by fit across all of them.

**States:** intro bubble · no research yet · queued · loading · cancelled ·
error per turn · no qualifying contacts · all contacts already in CRM.

---

## Mapping table

**maps** = the Siphron form takes it as-is · **bends** = the form changes to fit
a Kepler rule · **new** = no analogue, invented · **rejected** = not drawn.

| # | Kepler component | Siphron form | Outcome | Note |
| --- | --- | --- | --- | --- |
| A1 | Audiences tab strip | segmented control | maps | counts stay in the labels |
| A2 | list row / prospect row / result row | two-line raised row + right actions | maps | one row form serves all three |
| A3 | list member table | data table (Measurement form) | bends | gains a checkbox column and a per-row action column |
| A4 | `SelectionBar` | *no analogue* | bends | inset strip (`#eff0fa`) inside the card, not a floating bar |
| A5 | enrich modal | modal | maps | credit estimate stays, it is about the user's spend |
| A6 | verification badges ×5 | status pill | maps | positive / warning / negative |
| A7 | Apollo search form (6 controls) | form + pill groups | bends | 3-column grid; Siphron's 2-up would push the pills below the fold |
| A8 | Apollo-not-connected hint | banner | maps | setup copy stays |
| A9 | `searchInfo` result line | caption | maps | must not read as an empty state |
| B1 | ABM chat transcript | Campaigns intake chat | maps | internal precedent, already drawn |
| B2 | ABM result card | *no analogue* | **see Decision 2** | too tall to repeat inline at Siphron's density |
| B3 | fit score 0-100 | *no analogue* | **new** | score chip with a value-driven ramp |
| B4 | seniority tier | text cell | bends | needs a label map before it can be drawn at all |
| B5 | bulk research strip | disclosure | maps | stays on canvas, subordinate to the chat |
| B6 | sources disclosure | disclosure | maps | |
| B7 | CRM-dedupe note + show/hide | inline note | maps | |
| C1 | duplicated Prospects panel | — | **see Decision 1** | |
| C2 | duplicated Lists panel | — | **see Decision 1** | |

## Rules this screen re-tests

1. **Nulls render `—`.** `ListDetail` already complies. `AbmResultCard` prints
   `(name pending)` for a contact with no name, which is a different claim from
   "we do not have it". Bends to `—`.
2. **Empty states are not interchangeable.** Audiences has eleven distinct ones
   across four surfaces. None collapse.
3. **Full words in table headers.** `Fit` is the one short header; it is a
   complete word for a score, and the column is 60px. It stays.
4. **Disclosure copy stays.** The verification tooltip ("not
   mailbox-confirmed"), the credit estimate, the `emails need Apollo enrichment`
   caption and the CRM-dedupe note are all statements about the user's data.
   They survive the redesign.

## Decisions taken

**1 · Audiences becomes a single canvas.** No tab strip. A Lists rail on the
left selects what the People table on the right shows, and **Find prospects is a
drawer over it**. Saved accounts leave for ABM, where research is produced. Each
object then exists exactly once, with one action set.

The rail reuses the segmented control's own idiom at a different scale: the
track is `layer/inset`, the selected row lifts to `layer/raised` with
`Elevation/sm`. Selection is a recessed track with a raised chip, whether it is
three tabs or five lists, so nothing new had to be invented for "which list am I
looking at".

**2 · ABM becomes master-detail.** The chat log is replaced by an Accounts rail
carrying this run's queue above the saved accounts, with one full result card on
the right. The composer stays, at the foot of the rail, because that is where a
new company enters the list. This is what makes the cross-card selection bar and
a twelve-company bulk run usable; twelve of these cards in a scrolling log is
not a screen anyone can work in.

Master-detail introduces **one state the product does not have yet**: an empty
right pane before an account is picked. Drawn, and marked as new.

## Built in Figma

Page `Outreach — Siphron`, file `XlstnvwPQpcOq2tNY7sjxN`.

| Frame | Contents |
| --- | --- |
| `Outreach · Audiences` | Lists rail (4 real lists + All people) and the 8-row people table for "Tier 1 registrars (Nov renewal)" |
| `Outreach · Audiences · Find prospects` | the same canvas with a scrim and the search drawer, 6 real Apollo results |
| `Outreach · Audiences · Enrich` | scrim + modal, whole-list target, real credit arithmetic (8 × 9 = 72) |
| `Outreach · Audiences — states` | selection strip, enrich progress, notice, 4 empties, 2 setup hints |
| `Outreach · ABM` | Accounts rail (8 saved, app order) + the Anantara result card with the fit-scored contacts table |
| `Outreach · ABM · Bulk research` | expanded bulk strip, queue states in the rail, run panel with progress and log |
| `Outreach · ABM — states` | cross-account selection, 3 notices, 6 distinct nothing-to-show states |
| `Outreach · Audiences · Enriched` | the table after a real enrich run: revealed mobiles, verification dots, the run's own report |

**The table has one column geometry, not two.** Phones arrive only after
enrichment, so a Phone column sized for `—` would widen mid-run and shove every
other column sideways. All four Audiences states now share the same widths, and
the empty Phone column is already phone-width.

The verification badge is a **dot**, not a labelled pill. At this density the
label costs the email column the ~30px it needs to stay on one line, and the
tooltip already carries what the dot cannot say (passed format and domain checks,
not mailbox-confirmed).

Two mapping calls were changed by the drawing itself, both for reasons the
canvas made visible:

- **A3 table folds Title into the Contact cell.** At 840px, seven separate
  columns wrap the email address on almost every row. Emails are the most-copied
  value on the screen, so the title moves under the name (the form the ABM
  contacts table already uses) and every value fits on one line. Verified by
  reading each cell's height back off the node, not by eye.
- **B2 drops "Save research".** Both entry points auto-persist, so a result that
  is on screen is already saved. The button can only ever appear when
  persistence failed, and drawing it implied a step the user does not take.

Content was checked against the running demo rather than assumed: the account
sub-line, the ordering of both rails, the contacts meta ("Analyst-surfaced
targets" for a saved account, not "Pulled from Apollo") and the grounding
paragraph were all corrected after reading them off the app.

**Grounding prose keeps its em dashes.** `why_grounding` and `fit_reasoning` are
model output stored as data. The no-em-dash rule governs copy Kepler writes;
enforcing it on research text would misrepresent what the pipeline produces.

## Fixed in code alongside the build

| File | Was | Now |
| --- | --- | --- |
| `AbmResultCard` | `decision_maker` in the Seniority column | label map, unknown values de-underscored |
| `AbmResultCard` | `(name pending)` | `—` |
| `AbmResultCard` | "…to your prospect list - find them under Prospecting." | "…to your prospect list. Find them under Audiences." |
| `AbmSaved` | tier silently dropped whenever it was not enterprise/mid-market/smb | falls back to the raw tier, and says "ICP fit" like the badge does |
| `AbmSaved` | "Select prospects **above**" | "in the Prospects tab" |
| `AbmSaved`, `OutreachLists`, `ListDetail` | "ABM Research or Prospecting" | "Research or Find prospects" |
| `Prospecting`, `CompetitorAdsPanel` | "Profile & settings → Connectors" | "Integrations" (that section moved into the module) |
| `Prospecting` | "No matches (N found) - try a broader…" | "No matches (N found). Try a broader…" |
| `Prospecting` | `title · company - location` | `title · company · location` |
| `AbmResearch` | "Cancelled — not researched." and 3 more em-dashed strings | colons and full stops |
| `RatingControl` | "Thanks - feedback saved" | "Thanks, feedback saved" |

Two pre-existing lint errors sit in files this touched
(`react-hooks/set-state-in-effect` at `OutreachLists.jsx:30` and
`ListDetail.jsx:65`). They are untouched: fixing them means restructuring
effects, which is not a copy change.
