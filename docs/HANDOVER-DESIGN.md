# Handover — Kepler visual redesign (Siphron)

Paste the block below into a new chat to continue.

---

## What this is

Redesigning Kepler's UI screen by screen in Figma, mapping each real component
onto a reference design language, then porting back. Direction is **locked to
Siphron** — no more comparing.

**The design is complete.** All thirteen nav destinations, all sixteen real
connector logos, **six states frames (91 states)** and **seven Integrations
modals**. What remains is the **port back to code**, which has started: fifteen
copy and logic defects are fixed and verified, and the restyle is blocked on one
question (see THE OPEN FORK below).

## Figma

- **File: `XlstnvwPQpcOq2tNY7sjxN`** — in the **Turbostart Pro** team
  (`team::1304731759897958501`).
- **Do not use `yq44WIGNXvSLIVXpMVOwyQ`** (starter team, superseded). The MCP
  tool-call quota is scoped to the FILE'S team.
- Pages, one per destination: `Dashboard` · `Goals` · `Campaigns` ·
  `Measurement` · `Outreach` · `Brand Intelligence` · `SEO & AEO` ·
  `Social Media` · `Ad Creative` · `Library` · `Integrations` · `Settings` ·
  `Help Center` — each suffixed `— Siphron`.
- Shared components live on the **Dashboard page**: buttons, Verdict pill, Fact
  cell, Queue row, metric icons. Instantiate across pages by node id.

## Method (do not skip)

**Decide, then draw.** For each screen: read the source (never screenshots) →
write an inventory doc → fill a mapping table where every component is
**maps / bends / rejected / new** → get the open decisions answered → only then
build in Figma with **real data pulled from the running demo**.

Where a reference form and a Kepler product rule disagree, **the rule wins and
the form bends.**

Per-screen docs: `docs/{DASHBOARD,GOALS,CAMPAIGNS,MEASUREMENT,OUTREACH,
AUDIENCES-ABM,BRAND-INTELLIGENCE,SEO-AEO,SOCIAL-MEDIA,AD-CREATIVE,LIBRARY,
INTEGRATIONS,SETTINGS,HELP-CENTER}-MAPPING.md` plus
`DESIGN-REFERENCE-EXTRACT.md`.

---

## Remaining work

### 1 · States frames — DONE

Six frames, **91 states**, one per page. Spec and per-screen tables:
`docs/STATES-MAPPING.md`.

| Page | Frame | Node | States |
| --- | --- | --- | --- |
| Library | `Library — states` | `152:91` | 4 |
| Integrations | `Integrations — states` | `155:91` | 15 |
| Ad Creative | `Ad Creative — states` | `156:93` | 11 |
| Social Media | `Social Media — states` | `157:104` | 15 |
| SEO & AEO | `SEO & AEO — states` | `158:100` | 16 |
| Brand Intelligence | `Brand Intelligence — states` | `159:115` | 30 |

The expected counts were low on five of six screens: the rail tool cards each
carry their own unavailable state, publishing is four states rather than one, and
five Brand Intelligence empties are rendered from two panels each.

The frame recipe was **read off the existing `Dashboard — states`** frame, not
invented — annotations outside the box, product copy inside it, tone carrying the
state (`text/muted` loading, `text/primary` + secondary for an assertive empty,
`text/secondary` for a partial failure, `semantic/negative` for a total one).

### 2 · Integrations modals — DONE

Seven dialogs at 560 wide plus the overlay in situ. See `INTEGRATIONS-MAPPING.md`.

`163:98` Apollo (one field) · `163:116` Zoho CRM (four fields, select, copyable
scope block) · `165:103` Search Console (OAuth, read-only) · `165:125` Facebook &
Instagram (OAuth, two capabilities, a precondition) · `165:152` Disconnect
HubSpot · `166:109` Meta Ads needs attention · `166:143` Google Ads needs
attention · `166:300` the scrim treatment.

**The shaping decision: capabilities, not scope strings.** "Requested vs granted
scopes" taken literally means printing `https://www.googleapis.com/auth/adwords`
and `kepler:google-ads-write` — a URL and an internal marker that is not an OAuth
scope at all. The modal reports what `capabilityScopes` resolves those into, plus
the provider's own permission *name* ("Meta calls this permission Ads
Management"), the consequence, and the cause.

**Three states, not two.** `grantedScopes` returns `null` for a connection that
predates scope recording, which is *unknowable*, not *refused* — the third value
the card had no room for. `166:143` draws it: every capability **Not recorded**,
in `text/dim`.

**New shared component: `Button / destructive` (`162:93`)**, on the Dashboard page
with the others. Prop key `Label#162:0`.

### 3 · The port back to code — IN PROGRESS

**Landed and verified in the running demo:**

1. **Fifteen copy and logic defects** (see "Defects fixed in code" below),
   including six that were real behaviour.
2. **The two-theme system**, with an Appearance picker in Settings, a flat canvas,
   and `Modal.css` rebuilt on tokens. See "The theme fork" below.

**Still to do:**

- **The 264 hardcoded `rgba(255,255,255,…)` sites**, and the component work that
  follows them. Detail under "What is left of the restyle" below.
- **Two structural changes, still design-only.** Audiences → single canvas (lists
  rail + people table + Find prospects as a drawer, saved accounts moving to
  Research). Research → master-detail (queue + saved accounts left, one result
  card right). The repo ships the three-tab Audiences and the chat transcript.

### The theme fork — ANSWERED, and the system is built

**Decision: two real themes, the user picks.** Siphron ships as the light theme
and Kepler's premium-dark is retained; both are selectable, and **Siphron is the
default** because it is what every screen was drawn against.

Consequence for the rest of the restyle: **every fix must be theme-agnostic.**
Relighting a value for light is not enough — it has to resolve correctly in both,
which means replacing hardcoded colours with tokens rather than with other
hardcoded colours.

**Built and verified in the running demo:**

- **`src/lib/theme.js`** — `THEMES`, `readTheme`, `applyTheme`, `setTheme`,
  `bootTheme`. Kepler's dark values stay on `:root` and `kepler` *clears* the
  `data-theme` attribute rather than setting one, so a first paint before the
  bootstrap runs, or an unparseable stored value, degrades to dark rather than to
  unstyled.
- **`bootTheme()` runs in `main.jsx` before React mounts**, so there is no flash
  of the other theme. `theme-siphron.css` is no longer dev-gated. `?theme=fin`
  and `design-forms.css` stay dev-only: the direction is locked, and they exist
  only to re-check that.
- **Both families load in `index.html`** (Inter + Plus Jakarta Sans). The font was
  previously injected at runtime and only in dev, so a shipped Siphron would have
  had no type of its own.
- **An Appearance panel in Settings** (`ProfilePage.jsx`), applying on click
  rather than on Save — a theme is the one setting whose result you can see, so a
  confirm step would only delay the feedback. This closes one of the gaps
  `SETTINGS-MAPPING.md` records as "a product gap, not a design one".
  The two swatches are **deliberately literal, not tokenised**: a token resolves
  to the *active* theme, which would render both previews identically.
- **The canvas is flat.** The three-radial iridescent mesh is gone. No Figma frame
  accounted for it, and the card shadows were tuned on flat `#eef2f5`.
- **The five tile tints exist in both themes.** A token defined in only one theme
  is a trap: the first component to use it works in one and breaks in the other.
- **`Modal.css` is rebuilt on tokens** and verified in both. It was premium-dark
  only, so under Siphron a dialog's own title was near-illegible. Now 560 wide per
  the Figma dialogs, with `--modal-scrim` at 72% in dark and **45% in light**,
  where 72% buried the screen instead of letting it recede.

Verified: theme switches instantly, persists across reload, and every token flips
(`--layer-canvas` `#eef2f5` ↔ `#0a0b0f`, `--accent` violet ↔ indigo, font Plus
Jakarta Sans ↔ Inter). No console errors in either theme.

### The logo was invisible on light — and the count missed it

`kepler-logo.png` is a **pure-white** monochrome mark on transparency (verified by
sampling: every opaque pixel is 255,255,255), drawn for a dark canvas. As an
`<img>` it vanished completely on Siphron. Both usages were affected:
`Sidebar.jsx` and `LoginPage.jsx`.

**Fixed by painting the mark from its own alpha channel** rather than drawing the
bitmap: the PNG becomes a CSS `mask` and the shape is filled with
`background-color: var(--text)`. One asset, correct in both themes forever, and no
second dark-ink file to keep in sync. `aspect-ratio: 2176 / 2901` is the asset's
own ratio, so height alone sizes it (30px sidebar → exactly 22.5px wide).

It also fixed a mismatch nobody had noticed in dark: the mark was pure `#ffffff`
while the wordmark beside it was `#f3f4f7`. Both now resolve to `--text`.

**The lesson for the remaining work: the 264 count is CSS-only.** A grep for
`rgba(255,255,255,…)` cannot see a white *asset*, and this one was in the shell of
every single screen. Before calling the restyle done, audit the images too —
anything monochrome-white gets the mask treatment; anything with real colour needs
a per-theme asset.

Also worth remembering: `<img alt="KEPLER">` beside a wordmark reading KEPLER
announced the name twice. The mark now carries the accessible name **only when the
sidebar is collapsed**, and is `aria-hidden` when the wordmark is present.

### The restyle is ported — 309 declarations, both themes verified

Two sweeps, each mapped explicitly rather than heuristically, and each near
value-preserving in dark because the literals turned out to be **inlined copies
of the dark tokens themselves**.

**Sweep 1 · 193 white literals.** The real count was **221 bare literals**, not
264: 36 of the matches were `var(--x, rgba(255,255,255,…))` *fallbacks*, which
only apply when the variable is undefined and were never the bug. Buckets came
from the measured distribution against dark's own values
(`--border-subtle` 0.06 / `--border` 0.09 / `--border-strong` 0.16), so the
commonest literal (0.08 → `var(--border)`) moves dark by 0.01 alpha.

New tokens, defined in **both** themes:

```
--wash-1…4          a translucent LIFT over whatever is beneath.
                    Dark lifts with white; Siphron lifts with blue-tinted ink.
--edge-highlight    the inset top bevel. transparent in Siphron: it groups by shadow.
--edge-highlight-accent   the same bevel on a SATURATED surface (hero KPI, primary
                    button) - white reads on violet in either theme, so it stays.
--canvas-fade       the canvas hue at zero alpha, for gradients that fade out.
--header-fade-from  the header's under-shadow start.
```

`--canvas-fade` retires the "fade to transparent black" trap at the base rather
than patching it per theme: `transparent` is `rgba(0,0,0,0)`, so a gradient
interpolating to it smears grey on a light canvas.

**Sweep 2 · 116 hardcoded non-white colours**, a family the white-literal grep
could not see and which a contrast audit caught: mints, pastels and ambers tuned
for dark, unreadable on white. `#34d399` is *exactly* `--positive`, `#fcd34d` is
*exactly* `--warning`, `#4a6cf7` is *exactly* `--accent`, `#8e90a3` vs
`--text-muted: #8d93a1` is a rounding difference — they were copies all along.
Skipped deliberately: the theme-picker swatches (a token there resolves to the
*active* theme, so both previews would look identical) and the white logo chip.

**The SHELL PATCH is gone.** It existed only to paper over those literals, and
one of its rules was doing damage: `[class*='card'] { border-color: … }`
outspecifies a deliberate state border, so it had been flattening
`.connector-card--degraded`'s warning edge in this theme only. What survives is
labelled as what it is — two genuine theme differences (soft-pill nav selection,
group-by-elevation), not patches.

**Verified by measurement, not by eye.** A contrast audit walks every text node,
resolves the real painted background behind it, and computes the ratio. Across
19 routes: **dark reports zero failures**, and light is clean apart from
`--text-dim` (see below). Both themes also pass a full production build, and
`435/435` tests.

**One accessibility finding I did not act on unilaterally.** Siphron's dimmest
ink, `--text-dim #a3a9b8`, is **2.09:1 on white** — below WCAG AA for any text
size. It is used for de-emphasised micro-labels (breadcrumb, tool-group labels),
and it is the locked Siphron token, so raising it is a palette decision rather
than a port fix. Users who ask for more contrast are now served: `prefers-contrast:
more` previously had **no effect at all** in Siphron, because it targets `:root`
and `:root[data-theme='siphron']` outspecifies it. That block now exists.

### Also ported

- **Integrations is the designed screen.** Eight category sections became one
  **flat four-up grid with a search field** that matches a connector's name *and
  what it enhances*. `grid-auto-rows: 1fr` was needed on top of
  `align-items: stretch`: stretch only equalises within a row, and grid rows size
  independently, which left four different card heights. Now one height (312px)
  across all sixteen, attention-first (the three degraded connectors lead), with
  a search-no-match empty state. **The capability chips are off the cards.**
- **`Modal.css` rebuilt on tokens**, verified legible in both themes.
- **The white logo**, masked from its own alpha channel.
- **A premature gate on Campaigns.** It asserted *"Set up your brand before
  planning a campaign"* with both prerequisites unchecked **while readiness was
  still loading** — on a workspace that has both. The hook exposes `loading`;
  the screen was not reading it. Same class as the "nothing to size" defect.
- **A machine value on the pipeline card**: `quick_win` reached the screen with
  its underscore. `contentIntentLabel` / `contentTierLabel` now render
  `Informational · Quick win`, with unmapped values de-underscored rather than
  dropped.
- **Two red tests, fixed.** `detectors` and `generation-context` still expected
  the verdict to read `"Behind"`; the earlier unification renamed it to
  `"Off pace"` in the source and left the tests behind. A red suite blocks a
  deploy, so they are updated. **435/435 pass.**

### The two structural screens — DONE

**Audiences is one canvas.** The three-tab strip is gone. It held seven panels
over four objects, two of them rendered twice: prospects appeared under both
Saved research and Find prospects with *per-panel selection state*, so picking six
people in one and switching showed none selected; lists appeared as a tab and as a
segment of Saved research, one object with two action sets and two open
behaviours. Now a Lists rail selects what the People table shows, Find prospects
is a drawer, and saved accounts left for Research.

- `ListDetail` became the People table with two modes. `listId` set means list
  members and remove takes them *out of the list*; `listId` null means all people
  and remove *deletes the prospect* — the wrong one there would be destructive.
  All-people also carries push-to-Zoho, which was the retired Prospects panel's
  action and would otherwise have been lost with it.
- The canvas keys the table on the selection, so switching audiences remounts it:
  a fresh fetch and a cleared selection, without clearing state inside an effect.
- `FindProspectsDrawer` keeps the six-control search and drops that screen's
  duplicate saved-prospects panel.
- **Retired**: `Prospecting.jsx`, `AbmSaved.jsx`, `OutreachLists.jsx`.
- **A latent breakage found on the way out**: `.prospect-*` row styles lived in
  `Prospecting.css` and were used by *seven* surfaces while only two imported it —
  they happened to be loaded because some screen pulled that file in. Deleting
  Prospecting would have silently unstyled five surfaces. The shared half is now
  `components/outreach/ProspectRow.css` and every consumer imports it.

**Research is master-detail.** An Accounts rail carries this run's queue above the
saved accounts, with one full card on the right and the composer at the foot of
the rail. The two rail lists do not overlap: research auto-persists, so a
completed account *graduates* out of the queue into Saved rather than appearing in
both — the near-duplicate trap Audiences had. The one exception is a result whose
persistence failed, which stays in the queue because that is the only place it can
still be reached.

Cross-account contact selection spans everything in memory (every result the run
produced, plus every saved account opened), which is what "select top N by fit"
ranks over. The dead chat layer — 19 rule blocks — is deleted.

**One thing corrected during verification:** the mount auto-selected the most
recent account, which marked a rail row active while the pane still showed the
empty state — the screen contradicting itself. Nothing is auto-selected now. The
empty pane is a *designed* state introduced by master-detail, and picking for the
user is a guess about intent.

### The budget slider and the last two modals — DONE

- **Budget tier is a three-stop segmented control**, not `<input type="range">`.
  It has exactly three values, and the slider also made the labels and the thumb
  two separate controls for one choice. Stored ids stay `low|mid|high` so saved
  campaigns keep loading. `radiogroup` semantics, verified.
- **OAuth pre-consent** and **needs attention** are built
  (`components/integrations/CapabilityList.jsx`,
  `lib/connectorCapabilityCopy.js`). This closes the gap the chip removal opened.

  Both report **capabilities, never raw scopes** — verified with an on-screen
  scan: no `ads_management`, no `googleapis.com`, no `kepler:` anywhere. What does
  appear is the provider's own permission NAME ("Meta calls this permission Ads
  Management"), because that is the word on the consent screen.

  **`kepler:*` scopes are handled separately and this matters.** They are internal
  markers Kepler invented for its own Google Ads developer-token gating, not
  anything Google grants. Presenting them as a provider permission would blame
  Google for a gate that is ours, so they get their own line: *"Kepler needs a
  Google-approved production developer token… That approval is ours to obtain,
  not yours to grant."*

  **Three states, because `null` is not `false`**: Granted · Not granted · **Not
  recorded**. The last is a connection that predates scope recording — unknowable
  rather than refused, and the column the card had no room for. Verified on all
  three paths.

  A degraded card now leads with **Why?** rather than Reconnect: the shortfall is
  the thing to understand, and reconnecting blind is what produced it.

### The backend pipeline is dead, and that is why Goals fails

Goals renders `PGRST205 · Could not find the table 'public.goals'`. The screen is
correct — the table genuinely is not there.

**`staging-backend` has failed on every run since 2026-08-04**, seven in a row. It
dies on the first real step, `supabase link`:

```
Unexpected error retrieving remote project status: {"message":"Unauthorized"}
```

The repo secret `SUPABASE_ACCESS_TOKEN` is expired or revoked. So **no backend
change has reached staging since 2026-08-04** — migrations 027 to 035 are all
unapplied. The notes that kept recording 027/028/029 as "code-complete but
undeployed" were describing a symptom: nothing was being forgotten, the pipeline
was rejecting everything and going red where nobody was looking. The frontend
pipeline is unaffected and has shipped normally throughout, which is exactly why
this stayed invisible — the app kept moving while its database stood still.

**The Supabase project is fine.** Probed unauthenticated:
`https://dtqmgpznbomafrzptfca.supabase.co/rest/v1/` returns 401 `No API key found
in request`, the correct live response. Not paused, not deleted.

**The fix is owner-only, because it is a credential.** Generate a token at
Supabase → Account → Access Tokens, set the repo secret `SUPABASE_ACCESS_TOKEN`,
then:

```
gh workflow run staging-backend.yml --ref staging
```

Applying the backlog is safe: migrations 001–035 contain no `DROP TABLE`,
`DROP COLUMN`, `TRUNCATE` or `DELETE FROM`; everything is
`CREATE ... IF NOT EXISTS` and the cron migrations state they are re-runnable.
`detector-run` was also missing from the function deploy list while migration 034
schedules a daily POST to it — added, so it will not 404 once the token works.

### What is left

- **The remaining `#fff` / `#ffffff` `color:` declarations** (~13). Each needs its
  surface checked: on an accent surface white is correct in both themes.
- **An accessibility decision for you:** `--text-dim` at 2.09:1 on white (above).
  Every remaining contrast failure in the light theme is this one token, used for
  micro-labels; dark reports zero failures on every route audited.

---

## Rules that keep coming up

### Copy and content

1. **No design rationale in the UI.** A caption explaining why a screen is built
   that way goes in the spec. Two were drawn and deleted this pass.
2. **No em dashes in prose.** Colon, comma or full stop, chosen per sentence.
   **Exceptions:** `—` as the null placeholder, `contributionKey =
   production—source`, and **model output stored as data** (`why_grounding`,
   `fit_reasoning`) which keeps its own punctuation.
3. **Nulls render `—`, never `0`.** A measured zero is different: `0%` share of
   voice means the competitor genuinely was not mentioned, and stays `0%`.
4. **Empty states are not interchangeable.** "Could not load" ≠ "nothing here" ≠
   "nothing in this filter" ≠ "still loading". The loading case bit us: a panel
   asserted "nothing to size against this goal" for nine seconds before
   producing a real answer.
5. **Full words in table headers**, no abbreviations.
6. **One thing, one name — including nav labels.** Four separate leaks this
   pass: `ABM` for a child the nav calls **Research**, `Ad Campaigns` for
   **Ad Creative** (in Library *and* three connectors), `Prospecting` for a
   retired screen, `Profile & settings → Connectors` for **Integrations**.
   Check `moduleRegistry.js` before writing any destination name.
7. **Never print a machine value.** Five found and fixed: `decision_maker`,
   `keyMessages`, `queue`/`generating`/`active` (in the shared `StatusPill`),
   `analyzed`, and a 53-character MIME subtype in a table cell.
8. **Disclosure copy stays.** Forecast basis lines, credit estimates, the
   missing-paid-leg caveat, "not mailbox-confirmed", `Other` remainder rows.
   That is about the user's data, not decoration.

### Layout

1. **Cards at the same level are always the same size.** Content length must
   never set a card's height. Row children get
   `layoutSizingVertical = 'FILL'` — `counterAxisAlignItems` has no `STRETCH`.

   **Pin before you fill.** `FILL` children inside a row that still *hugs* have
   no definite height to fill and the row collapses: the SEO pipeline's three
   columns all became 642px when the Queue column needed 1,149, silently
   clipping four cards. Sequence: hug → measure → pin the row → fill.

2. **Card actions sit on one baseline.** A card is **two children: `body` and
   the action**, with `primaryAxisAlignItems = 'SPACE_BETWEEN'` on a
   fixed-height card. Do **not** use a flexible spacer: `FILL` is meaningless
   while the card hugs, and an extra child adds another `itemSpacing` gap that
   pushes the tallest cards past their pinned height.

3. **Two content columns at 1,180, never three.** A rail plus two panes leaves
   the working pane ~420px. When a screen wants a rail *and* two panes, the
   rail's cards become **footers on the side pane** and the main pane runs to
   the right edge. Ad Creative went 2,590px → 1,570px on that change alone.

4. **A column is as wide as its longest real value.** Read heights back off the
   nodes: a wrapped cell was too narrow, a clipped action ("Remov…") was sized
   from a guess.

5. **Prefer search to section headers** once a list passes a handful of items.
   Integrations went 2,471px → 871px by dropping eight category headers (five of
   which held a single card) for a flat four-up grid with a search field.

### Charts — Bklit

Registry: `https://bklit.com/r/{name}.json` (`ui.bklit.com` 301s; curl needs
`-L`). Built on **@visx**, not Recharts.

- **area**: `curveMonotoneX`, `strokeWidth 2`, gradient `fillOpacity 0.4 → 0`
- **grid**: 5 rows × 10 cols, `strokeWidth 1`
- **composed**: stacked bars + line on one scale, `barGap 4`, bar `radius 0`
- **funnel**: segments sized `value / max`, `gap 4`, halo layers, non-hovered
  dim to `0.4`

Decisions: **monotone never overshoots**; **composition charts start at zero**;
**discrete weekly readings get bars, not an interpolated area**; a funnel
spanning 8,136 → 3 needs a **power scale** (`v^0.3`).

**One chart form per chart type, across the whole product.** A ranked share
chart looks the same wherever it appears: gridlines behind bars, axis labels
under the plot, then rank · identity · bar · value. Channel contribution
(Dashboard) and share of voice (AI Visibility) are the same chart and are drawn
identically. Reference geometry: Dashboard drill-down `21:52` — bar zone
left-anchored, 12px bars at radius 3, gridline `#e6e9f2` 1px, axis labels 10px
Regular in `text/dim`.

---

## Design tokens (Siphron)

```
canvas #eef2f5 · chrome #f9fafc · raised #ffffff · inset #eff0fa
text    #12141a / #41464c / #767c8a / #a3a9b8
accent  #8a59f3 (hover #9a6ff5, deep #5f37c0, text #6d40d8)
semantic positive #2f7d5f · negative #c8443c · warning #b07d1f
tiles   cream #f3f6ef · ice #eef9fc · lavender #f3f3fb · peach #fbf7ee · mint #eff9f4
borders rgba(38,50,110, .05 / .09 / .16)   radii 6/9/12/16/22
type    Plus Jakarta Sans  (styles are "SemiBold"/"ExtraBold", NO space)
elevation sm/md/lg — Siphron groups by SHADOW, not hairlines
```

Screen frame: 1180 wide, VERTICAL auto-layout, padding 24/32/32/32, gap 16,
`layer/canvas`. Panels: `layer/raised`, radius 16, padding 18/20, `Elevation/md`.
Global screens (Settings, Help Center) use a **centred 720px column** instead.

## Local dev

```bash
npm run dev:demo          # port 5176, backend-free, seeded as Ken42
```

`?theme=siphron` applies the skin, `?theme=off` clears it. Dev + demo only.
Headless Chrome **hangs** on the demo dev server; screenshot via the Browser
pane or `node.screenshot()` in Figma. Real data is reachable in the browser via
the React fiber (`__reactFiber$` → `memoizedProps`) — that is how the funnel's
weekly series and the cockpit props were pulled.

## Figma API gotchas (each cost a failed call)

- `createAutoLayout()` frames default to a **white fill** — clear it.
- `setBoundVariableForPaint` **resets `opacity` to 1**, and re-applying it in the
  *same* assignment does not survive either. Semi-transparent tokens need **two
  writes**: assign the bound paint, then rewrite opacity on the committed paint.
  Single-write cost two rounds of invisible bugs (5% hairlines rendering as
  solid navy; 12% pills as solid blocks with invisible text).
- **Instance text is a component property.** Setting `.characters` looks right
  but a `clone()` re-derives from the component and the edit vanishes. Use
  `setProperties`. Keys: Verdict pill `Label#2:3`, Fact cell
  `Label#2:4`/`Value#2:5`, buttons `Label#2:0`/`#2:1`/`#2:2`, Queue row
  `Count#6:0`/`Title#6:1`/`Detail#6:2`.
- `query()` attribute selectors **break on spaces in a name**. Use
  `children.find(c => c.name === '…')`.
- `findOne` matches the **first** node of that name — a stat tile named "Share of
  voice" shadowed the panel of the same name and a chart got built inside it.
  Prefer `screen.children.find(...)` when you mean a direct child.
- Building segments with `Promise.all(labels.map(async …))` appends in
  **completion order**, so the one doing extra async work lands last. Build
  sequentially.
- Changing a frame's `layoutMode` can silently revert it to **hugging**, so it
  measures itself rather than its parent (a wrap grid measured 1,372px inside a
  680px pane and never wrapped).
- `layoutGrow` takes **integers only**.
- A hidden node **leaves auto-layout flow**. Reserve space with a fixed slot.
- `toLocaleString()` does **not group digits** in the plugin sandbox.
- **Read geometry back off the node.** A value you computed and echoed proves
  nothing. This caught every layout bug in this project.
- `figma.createImageAsync` and `loadAllPagesAsync` are **not available**; use
  `upload_assets` for images.

## Repo state

**Committed and deployed** (2026-08-17), three commits on `staging`:

```
2d656dd  docs: the Siphron design record
1edde19  assets(connectors): sixteen real brand marks
23313e1  feat(theme): ship Siphron as a selectable light theme, and port the redesign
```

Live at **https://kepler-os-two.vercel.app** — Vercel reports
`environment=Production`, because the project's Production Branch is `staging`.
CI green (36s), Vercel green, and the deployed `/assets/index-*.css` and
`/assets/App-*.css` are **byte-identical** to the locally verified build.

Note when checking a future deploy: Deployment Protection is on, so the
per-deployment and per-branch URLs return **HTTP 200 with a Vercel login page**.
That looks like a successful fetch and is not. Use the stable alias above.

Lint is clean on everything this work introduced. Pre-existing
`react-hooks/set-state-in-effect` errors sit in files it edited
(`OutreachLists.jsx:30`, `ListDetail.jsx:65`, `BrandIntelligence.jsx` ×3) and
were deliberately left alone.

### Defects fixed in code this pass (from the states inventory)

Full detail and line references in `docs/STATES-MAPPING.md`. Verified in the
running demo, not just edited.

**Behaviour:**

1. **Disconnect was destructive and unconfirmed.** `ConnectorsPanel.jsx` wired the
   button straight to the service: one misclick revoked a credential, and for an
   API-key connector reconnecting means going back to the provider. Now confirmed,
   naming what stops working (from `enhances`) and what does not. Verified: the
   click opens the dialog and the connection survives.
2. **Opportunities rendered a blank canvas.** `SeoAeo.jsx` made the whole section
   `null` when GSC was neither configured nor connected, so that route showed
   nothing at all. The two unavailable states are now one, which is what they are
   to a user.
3. **A third Opportunities state was missing entirely** — ready-but-not-run had no
   copy, borrowing nothing and saying nothing. Now: *"Not analyzed yet. Find
   opportunities reads your Search Console history for queries you nearly rank
   for."*
4. **The connected ratio could never reach its denominator.** `available` counted
   all sixteen connectors, but the four platform-managed ones have no
   per-workspace row, so a fully connected workspace read `12 of 16` and `16 of
   16` was unreachable. Now `12 of 12`, verified on screen.
5. **The Instagram reason was a `title` tooltip** — invisible on touch and to
   keyboard users, on a *disabled* control. Now visible caption text.
6. **`insufficient_context` was a dead end.** No retry is right; no way forward
   was not. Two things in the code said so: an unreachable `'Add more sources'`
   label, and a message ending *"then try again"* beside no button. Now a link to
   File Intelligence, and the clause is gone.

**Machine values reaching the screen** (rule 7 — three more):

7. `SeoAeo.jsx` printed `gscStatus.status` verbatim, so an expired connection
   rendered `expired` in a rail card. It bypassed `StatusPill`'s label map.
8. Ad Creative's character count printed raw payload keys:
   `primaryText 284/600`. Now `Primary text 284/600`.
9. The population banner joined raw source keys: *"Brand populated from
   website:ken42.com + file:Ken42-Institutional-Deck-2026.pdf +
   file:KenRoll-Case-Study.pdf."* Now counted by kind: *"from your website and 2
   project files"*.

**Naming, numbers and punctuation:**

10. **The Ad Creative gate called itself "Ad Campaigns"** — fifth stale-name leak,
    and the first screen a new workspace sees.
11. **Defect 8 from last pass was only half fixed.** `seoOperator` grouped its
    numbers but `SeoAeo.jsx` did not, so the pipeline card printed `11240
    impressions` while grouping `Vol 1,900` on the same card. Verified now:
    `11,240 impressions · 1,043 clicks · pos 3.1`.
12. **Three null renderings in one module** (`—`, `None`, `Not set`) collapsed to
    `—`, keeping a sentence only where absence has a consequence (targeting).
13. **`'-'` as a null placeholder** in the SEO draft modal.
14. **Library used one empty for two causes.** A no-match *search* said "No items
    match your filter." Now split, with a working Clear search.
15. **Em dashes and hyphen-as-dash in prose**: five em dashes
    (`BrandIntelligence` ×2, `SeoAeo` ×2, `CompetitorAdsPanel`) plus three in
    `connectorState.js`, and four hyphen-as-dash strings.

**One duplication retired.** The per-section generate control existed in **three**
near-identical copies, each with its own `retryLabelForKind` — which is how both
of its defects came to exist in triplicate. The decision now lives in
`src/lib/sectionGenerate.js`.

### Behavioural fixes made (not just copy)

1. **A goal's recommendation leaked onto the next goal** — sizing resolves after
   the goal loads, so switching goals showed the previous goal's shortfall under
   the new goal's name. Recommendations are now stamped with their goal id.
2. **"Nothing to size" was asserted while sizing was still running**, on a goal
   that then produced a real answer. There is now a sizing state.
3. **The same empty said "Set a goal" on a goal's own detail page.**
4. **One verdict, three names** — `off-pace` rendered as "Behind", "Off pace" and
   "behind". Unified on **"Off pace"** (it is about the run rate).
5. **Social history labelled every LinkedIn post "Facebook"** — the channel was
   defaulted, not read — and the same bug hid LinkedIn's share counts.
6. **The demo `enrich` handler returned the wrong key** (`enriched` vs
   `matches`), so every demo enrichment reported "Enriched 0 of 8".
7. **Opening a saved ad campaign showed a brief contradicting its own variants**
   — the stored payload used different key names than the screen reads.
8. **`seoOperator` printed ungrouped five-figure numbers** (`22400`) while every
   other surface uses `Intl.NumberFormat`.
9. **`AbmSaved` silently dropped the tier** for any value outside its label map.

### Checked and deliberately left alone

- Help Center's `external` flag looks inverted but the behaviour is right:
  policy pages open in a new tab, the `mailto:` in place. The **name** is wrong,
  not the logic.
- `BrandHealthStrip.jsx` is dead code (its figures moved to a status line);
  that is also why `freshness` lints as unused in `BrandIntelligence.jsx`.
- Library's go arrow navigates to the item's **module**, not the item. Real
  deep links per asset type are a code change, so the design draws the row as it
  behaves.
- Settings holds one editable field: no password, theme, notifications,
  workspace management or account deletion. A product gap, not a design one —
  drawing a Danger Zone that no code backs would be designing fiction.
- Settings' connectors pointer is a **migration notice** and should eventually
  expire.
- `/data-deletion` is a routed page not listed in Help Center's Resources,
  which is where platform reviewers look for it.
