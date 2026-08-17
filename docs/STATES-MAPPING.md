# States — inventory and mapping decisions

Working document. Siphron direction. One doc for six screens, because states are
cross-cutting: the same `EmptyState` primitive, the same `SetupRequired` gate and
the same three-way null rendering show up on all of them, and deciding each one
six times separately is how they drifted apart in the first place.

Read from source, screen by screen: `Library.jsx`, `Integrations.jsx` +
`ConnectorsPanel.jsx` + `connectorState.js`, `AdCampaigns.jsx` +
`CompetitorAdsPanel.jsx`, `SocialMedia.jsx`, `SeoAeo.jsx` +
`AiVisibilityPanel.jsx`, `BrandIntelligence.jsx` + `components/brand-intelligence/*`.

**Status: inventory complete. Ten new defects found, ten decisions taken. Not
yet drawn.**

---

## The count was low

Every per-screen mapping doc ends with a "still to draw" line naming the states
it expected. Reading the source found more, on every screen:

| Screen | Expected | Found | Why the gap |
| --- | --- | --- | --- |
| Brand Intelligence | 14 empties + 4 banner + 4 generation | 18 distinct empties (22 renderings) + 4 + 4 | five messages are rendered from two panels each |
| SEO & AEO | 5 | 14 | the rail's five tool cards each have their own unavailable state |
| Social Media | 7 | 15 | publish is four states, not one, and history is four |
| Ad Creative | 5 | 11 | the Meta Ad Library panel carries four of its own |
| Library | 3 | 3 | correct |
| Integrations | 4 | 4 screen + 7 card | the card state machine in `connectorState.js` is seven states |

The Brand Intelligence duplication is the tab-collapse finding again, showing up
in the empties: `No values yet.`, `No tone defined yet.` and
`No aesthetic tags yet.` each exist in **both** `BrandOverviewPanel` and
`BusinessDetailsPanel`, because both panels rendered the same five identity
fields. See decision **D8** — the port deletes one copy of each.

## The two primitives

Everything routes through one of two forms, and the frames should draw both once
rather than per screen.

**`EmptyState`** (`ui/EmptyState.jsx`) is three slots: an optional spinner, a
message, an optional action. That is the whole component. A state that wants a
heading, an icon or two actions does not exist today.

**`SetupRequired`** (`workspace/SetupRequired.jsx`) is the module gate: eyebrow
`Setup required`, the module title, a summary, a checklist of requirements each
`✓` or `○`, then one deep-link button per unmet requirement. Three screens use
it (SEO & AEO, Social Media, Ad Creative) and it is the only state in the
product that routes you to the fix.

A third form exists by accident: `<p className="module-empty-state">` and
`<p className="brand-intel-module__empty">` written inline, bypassing
`EmptyState` entirely. That is 22 of the renderings in Brand Intelligence and 3
in SEO & AEO. Drawing them identically to `EmptyState` is correct; the
divergence is a code cleanup, noted as **D11**.

---

## A · Library

Three states, and the source has them cleanly separated.

| State | Trigger | Exact copy | Action |
| --- | --- | --- | --- |
| Loading | `loading` | `Loading library…` | none, correctly |
| Nothing at all | `items.length === 0` | `No content yet. Generate assets in any module and they’ll collect here.` | none |
| Nothing in this filter | `visible.length === 0` | `No items match your filter.` | none |

The third fires for **search** as well as for a filter pill (`Library.jsx:112`),
and search is not a filter. See **D6**.

## B · Integrations

**"Nothing connected" is not an empty state.** The grid always renders sixteen
cards; what changes is the status line, which gains a clause at zero
(`Integrations.jsx:35`):

> `0 of 16 connected · Kepler works without them; each one sharpens what it produces`

So the frame draws the status-line variant plus sixteen cards in `available`,
not an `EmptyState`. Recorded as **D9** so it is not drawn as an empty by
reflex.

Screen states:

| State | Trigger | Exact copy | Action |
| --- | --- | --- | --- |
| Card loading | `loading && !st` | *spinner in the action slot* | none |
| Nothing connected | `connected === 0` | the status-line clause above | per card |
| Everything connected | `connected === 12` | `12 of 16 connected` — the ceiling, see defect 11 | per card |
| Search, no matches | *design only* | **needs new copy** | clear search |
| Connecting | `connecting` | button `Connecting…`, modal not dismissible | Cancel disabled |
| Connection failed | `modalError` | server message, or `Could not connect - check the credential and try again.` | retry in place |

The card state machine is seven states, and `connectorState.js` owns every
label and detail string. This is the authority for the needs-attention modal:

| State | Label | Detail | Action |
| --- | --- | --- | --- |
| `degraded` | Needs attention | `Access expired — reconnect to resume.` / `The connection was rejected. Reconnect with fresh credentials.` / `lastError` / `Connected, but {caps} {was/were} not granted — reconnect to authorise {it/them}.` | Reconnect + Disconnect |
| `connected` | Connected | — | Disconnect |
| `available` | Available | — | Connect |
| `approval_pending` | Approval pending | `Waiting on {gate}.` / `Waiting on platform review.` | **none** |
| `platform_managed` | Managed by Kepler | `Configured — included in your scans.` / `Not configured yet, so it is excluded from your scans.` | **none** |
| `setup_required` | Setup required | `This deployment has no OAuth credentials for the provider.` | **none** |
| `planned` | Coming soon | — | **none** |

Four of seven offer no action, deliberately. `grantedScopes` returning `null`
means *unknowable*, not *ungranted* — an older row predates scope recording, so
the modal must distinguish "not granted" from "we cannot tell", which is a third
column the card never had room for.

## C · Ad Creative

| State | Trigger | Exact copy | Action |
| --- | --- | --- | --- |
| Module loading | `loading` | `Loading…` | none |
| Gate | `!readiness.adsReady` | `SetupRequired`, summary + 2 requirements | up to 2 deep links |
| Generating variants | `generating` | `Generating ad variants…` | none |
| No variants | `variants.length === 0` | `No generated assets yet. Use “Generate campaign assets” above.` | none |
| Over limit | `variant.overLimit` | status `Over limit`, plus `headline 38/70 · primaryText 284/600 ⚠` | Copy |
| Brief unset | no config | `Unnamed campaign` · `Not selected` · `Not set` · `Not selected` | none, it is a pre-flight |
| No saved campaigns | `saved.length === 0` | *the Saved group does not render* | none |
| Ad Library loading | `connected === null` | *renders nothing* | none |
| Ad Library not connected | `connected === false` | `Connect Meta Ad Library in Integrations to search competitors' live ads and ground your creative in them.` | none |
| No ads found | `!ads.length` | `No ads found for "{terms}" in {country}. Try a broader term, or an EU country for the full (non-political) ad set.` | retry in place |
| No angles | `read.ads.length === 0` | `No structured angles extracted from this set.` | none |

The gate's title is **wrong** — see defect 1. The Ad Library loading case
renders nothing inside a rail card that is already there, so the card reads as
broken: **D10**.

## D · Social Media

Publish is four states and history is four; the doc counted each as one.

| State | Trigger | Exact copy | Action |
| --- | --- | --- | --- |
| Module loading | `loading` | `Loading…` | none |
| Gate | `!readiness.socialReady` | `SetupRequired`, 1 requirement | 1 deep link |
| Planner list, no posts | `items.length === 0` | `No posts planned yet. Run a calendar above.` | none |
| Planner calendar, no posts | same | *empty grid, no message* | none |
| Nothing selected | `!selected` | `Select a post from the planner to open it here.` | none |
| No carousel | `!carousel` | `Generate an on-brand carousel for this post (optional).` | Generate carousel |
| Carousel generating | `busyCarousel` | button `Designing…` | none |
| Carousel generated | `carousel` | `CarouselPreview` slides | Regenerate |
| Publishing | `publishing` | button `Publishing…` | none |
| Published | `published.url` | `View live post ↗`, notice `Published to {label}.` | open the post |
| Instagram blocked | `platform === 'instagram'` | button `Instagram: needs media`; reason **only** in `title` | none |
| History not configured | `!metaPages.configured` | `Facebook & Instagram isn't configured on this build yet (Meta app + env pending). LinkedIn history isn't available: LinkedIn restricts reading personal-profile posts, so it arrives with the company-Pages tier.` | none |
| History, no Page chosen | `connected && !pageSelected` | `Choose the Facebook Page to publish from and read history for:` | List my Pages → select |
| History, none pulled | `connected && !history.length` | `No history pulled yet. Hit "Pull history" to import your posts and their engagement.` | Pull history |
| History, not connected | `!connected && !history.length` | `Connect Facebook & Instagram to import your past posts and see what actually performed.` | Connect |

The calendar's missing empty is **D3**; the tooltip-only Instagram reason is
defect 3.

## E · SEO & AEO

| State | Trigger | Exact copy | Action |
| --- | --- | --- | --- |
| Module loading | `configLoading` | `Loading…` | none |
| Gate | `!readiness.seoReady` | `SetupRequired`, 2 requirements | up to 2 deep links |
| Pipeline loading | `loadingItems` | `Loading pipeline…` | none |
| Column empty | `columnItems.length === 0` | `No items in this stage yet.` | Add Content Idea, on Queue only |
| Opportunities, no GSC at all | `!gscConfigured && !gscStatus` | ***nothing renders*** | none |
| Opportunities not ready | `!gscOperatorReady` | `caps.gsc_operator.degraded` or `Connect Search Console to surface real ranking opportunities.` | none |
| Opportunities, not yet run | `ready && !opRan` | *no message* | Find opportunities |
| Opportunities, found none | `opRan && !length` | `No opportunities surfaced yet. Your site needs more Search Console history.` | Re-analyze |
| Draft modal, no draft | `!payload.blog` | `No draft available.` | none |
| AI Visibility loading | `loading` | `Loading AI visibility…` | none |
| No scan yet | no scan | `No visibility scans yet. Run a scan to see whether AI assistants mention your brand when buyers ask category questions. Connect providers for live data, or run a sample to preview the loop.` | Run scan / sample |
| Sample data | sample | `Sample data: providers not connected yet. Connect Perplexity, ChatGPT or Claude for live measurement.` | Run live scan |
| Scanning | `scanning` | button `Scanning…` | none |
| Rail · GSC not connected | `!gscStatus` | `Pull real queries, impressions, clicks and positions into your pipeline.` | Connect Search Console |
| Rail · no property | `!propertyUrl` | `No property selected` | Pull latest |
| Rail · Mention finder off | `!configured` | `Add the APIFY_TOKEN platform secret to find real community threads.` | none |
| Rail · no threads | `mentionRan && !length` | `No threads found — try a more specific topic or question.` | retry in place |
| Rail · no site URL | `!baseUrl` | state `No site URL`, tone warn | none |

Two of these are the same thing to a user and must collapse (**D4**), one has no
copy at all (**D5**), and the blank-canvas case is defect 4.

## F · Brand Intelligence

### The four per-section generation states

`SectionGenerateControl` (`BrandIntelligence.jsx:67`) is the whole machine, and
it is reused on every generative section.

| State | Status text | Button |
| --- | --- | --- |
| Idle | — | `{idleLabel}` — `Generate`, `Generate from sources`, `Generate ICPs`, `Generate competitors` |
| Running | `Generating…` | `Generating…`, disabled |
| Done | `Updated` | `{idleLabel}` |
| Error | `status.error` or `Generation failed` | `Retry`, or `Retry with stricter prompt` for `malformed_json` / `missing_keys` / `empty_content` |
| Error · `insufficient_context` | `status.error` | **no button at all** |

`Generating…` renders **twice** in the running state, once as status text and
once as the button label (defect 2). The `insufficient_context` branch has a
label defined for a button that can never render (defect 5, decision **D1**).

### The four population-banner states

Rail card *Refresh from sources*: running with six named stages, success
(`Brand populated from {sources}. {n} fields updated.`), partial, error.

### The empties

Eighteen distinct messages across five tabs and six panels. Grouped by what
they actually say:

| Tab / panel | Copy | Note |
| --- | --- | --- |
| Overview | `No brand profile yet — add your website or a file to auto-build it, or edit manually.` | em dash, defect 6 |
| Overview · colours | `No colour identity yet. Refresh from sources or edit manually.` | |
| Overview · colours | `Website extraction unavailable. Add a URL, upload project files, or edit colours manually.` | correctly a *different* state |
| Overview + Details | `No values yet.` | rendered from two panels |
| Overview + Details | `No tone defined yet.` | rendered from two panels |
| Overview + Details | `No aesthetic tags yet.` | rendered from two panels |
| Details | `No business details yet. Upload project files and refresh from sources, or edit manually.` | + Edit button |
| Details · proof points | `No verified proof points yet. Stats must be explicitly sourced.` | disclosure copy, keep verbatim |
| Details · proof points | `None` | edit mode only |
| Competitors | `No competitor suggestions yet. Use “Generate competitors” above after adding a website URL or project files, or add a competitor manually below.` | |
| Competitors | `No confirmed competitors yet.` | |
| Competitors · detail | `Accept a suggestion or add a competitor to view details.` | master-detail empty |
| Audience | `No ICP suggestions yet. Use “Generate ICPs” above after adding a website URL or project files, or add one manually below.` | |
| Audience | `Analyzing website and project files for audience suggestions…` | **loading, not empty** — correct per rule 4 |
| Audience | `No ICPs yet. Accept a suggestion or add manually.` | |
| Audience · ICP card | `None` | job titles, channels |
| Audience · ICP card | `Not set` | primary pains |
| Audience · ICP card | `Not set — ad targeting falls back to keywords and audiences.` | em dash, defect 6; disclosure copy, keep the sentence |
| Files | `Upload brand guides, pitch decks, or strategy docs. Parsed content feeds population across all tabs.` | |
| Files | `No files uploaded yet` | status label |
| Module | `Loading brand intelligence…` | |

Three different null renderings live in this one module — `—`
(`formatRelativeDate`, `fileTypeLabel`, `fileStateLabel`), `None`, and
`Not set`. That is **D2**.

---

## Defects found while reading

New, on top of the nine the previous pass fixed.

1. **The Ad Creative gate calls the module "Ad Campaigns."**
   `AdCampaigns.jsx:206` passes `title="Ad Campaigns"` to `SetupRequired`, so
   the *first* screen a new workspace sees names a destination the nav calls
   **Ad Creative**. Fifth instance of the stale-name class, and the one with the
   worst placement.

2. **`Generating…` renders twice in the same control.**
   `BrandIntelligence.jsx:73` shows it as status text and `:89` as the disabled
   button's label, simultaneously.

3. **Instagram's reason is a tooltip.** `SocialMedia.jsx:499` puts "Instagram
   needs a hosted image or video, so publishing lands with media upload." in a
   `title` attribute only. The mapping doc claims the missing capability is
   "stated, not hidden"; on touch and for keyboard users it is hidden. A
   disabled control whose reason requires a hover is a dead end.

4. **Opportunities renders a blank canvas.** `SeoAeo.jsx:684` makes the whole
   section `null` when GSC is neither configured nor connected, so that child
   route shows nothing at all — not an empty state, an empty screen.

5. **An unreachable retry label.** `retryLabelForKind` returns
   `'Add more sources'` for `insufficient_context` (`:60`), but `blockRetry`
   suppresses the button in exactly that case (`:82`). The label is dead code,
   and the state it belongs to offers the user nothing.

6. **Two em dashes in prose.** `No brand profile yet — add your website…`
   (`:669`) and `Not set — ad targeting falls back…` (`:1062`). Two more in the
   SEO rail: `No threads found — try a more specific topic…` (`:831`, and again
   in the notice at `:376`) and `…only where you genuinely help — at most one
   brand mention in four.` (`:835`). One in a select option:
   `Germany (EU — full ad set)` (`CompetitorAdsPanel.jsx:16`).

7. **Five hyphen-as-dash strings.** `Could not connect - check the credential
   and try again.` (`ConnectorsPanel.jsx:132`), `Copy failed - your browser
   blocked clipboard access.` (`AdCampaigns.jsx:179` and `:190`,
   `SeoAeo.jsx:460`).

8. **Defect 8 from the last pass is only half fixed.** `seoOperator` now groups
   its numbers, but `SeoAeo.jsx:564` still prints the pipeline card's Search
   Console reading with bare `Math.round` — `11240 impressions · 1043 clicks` —
   while line 551 on the *same card* groups `Vol` with `toLocaleString()`. The
   rail repeats it at `:719`, where it also abbreviates to `impr`. The mapping
   doc draws this line as `11,240 impressions`, so the design already assumes
   the fix.

9. **A sixth machine value reaches the screen.** `SeoAeo.jsx:699` renders
   `gscStatus.status` verbatim for anything that is not `connected`, so an
   expired connection prints `expired` as a rail card's state. `StatusPill`'s
   label map was the central fix for this class; this call site does not use it.

10. **`'-'` as a null placeholder.** `SeoAeo.jsx:1057` renders
    `burstiness {… ?? '-'}` in the draft modal. Same defect the Brand
    Intelligence file table had, in a surface about to be drawn.

11. **The connected ratio can never reach its denominator.**
    `Integrations.jsx:23` sets `available` to every connector whose status is
    not `planned` — which is all sixteen, because nothing is `planned` any
    more. But `connected` counts rows returned by `listStatuses`, and the four
    `platform_managed` connectors have no per-workspace row by design. So a
    workspace that has connected *everything it can* reads **`12 of 16`**, and
    `16 of 16` is unreachable. Either the denominator drops the
    platform-managed four (`12 of 12`), or the numerator counts configured
    platform surfaces alongside connected ones. Found while checking the count
    for the states frame, which is why the frame draws `0 of 16` and not the
    `0 of 12` this doc first claimed.

12. **A raw field key in the character count.** `AdCampaigns.jsx:409` builds the
    per-field line straight from `Object.entries(variant.fieldStatus)`, so the
    key reaches the screen as written: `primaryText 284/600`. `headline` passes
    as a word by luck; `primaryText` does not. The frame draws
    `Headline 38/70 · Primary text 284/600 ⚠`.

13. **The `insufficient_context` copy instructs an action the UI has
    withdrawn.** The message is `Not enough source material. Add a website URL
    or upload project files, then try again.`
    (`brandPopulationService.js:641`) — but `blockRetry` removes the only
    button, so it says "try again" beside nothing to try again with. This is
    the same defect as the dead label in defect 5, from the other end, and
    together they settle **D1**: the state needs a route out, and the copy
    drops the trailing clause.

14. **The population banner prints raw source keys.**
    `BrandPopulationBanner.jsx:38` renders `sourcesUsed.join(' + ')`, and the
    seeded values are `['website:ken42.com',
    'file:Ken42-Institutional-Deck-2026.pdf', 'file:KenRoll-Case-Study.pdf']`.
    So the success banner really reads *"Brand populated from website:ken42.com
    + file:Ken42-Institutional-Deck-2026.pdf + file:KenRoll-Case-Study.pdf."* —
    type-prefixed identifiers and file extensions, joined with a plus sign, in
    a sentence. Seventh machine-value leak. Separately, `fieldsUpdated` is
    absent from `population_meta`, so the `{n} fields updated.` clause the
    Brand Intelligence mapping doc quotes never appears in the demo at all.

15. **Disconnect is destructive and unconfirmed.**
    `ConnectorsPanel.jsx:179` wires the Disconnect button straight to
    `disconnect(c.id)`, which calls the service immediately. One misclick on a
    connected card revokes the credential, and for an API-key connector
    reconnecting means going back to the provider for a new token. Every other
    destructive action in the product is a considered one; this is a single
    click with no confirmation and no undo. The `Disconnect HubSpot?` modal
    (`165:152`) is the fix, and it is currently design-only.

## Decisions

Taken against the documented rules. **D1, D4 and D6 are judgement calls** and
are the ones to overturn if you disagree; the rest follow from rules already
written down.

**D1 · `insufficient_context` gets a route, not a retry.** No retry button is
right: re-spending a credit on the same request cannot fix a missing source. But
"no retry" became "no way forward", and the dead `'Add more sources'` label says
that was not the intent. The state gets the error text plus a **link** to File
Intelligence. A link is not a retry and costs no credit.

**D2 · One null rendering, and a sentence only when absence has a
consequence.** `—` is the default for a scalar with no value, per rule 3. `None`
goes — an empty list is an absence, not a value. `Not set` survives *only* where
a sentence follows explaining what breaks, which is targeting alone: `Not set.
Ad targeting falls back to keywords and audiences.` (full stop, not em dash).
Primary pains becomes `—`.

**D3 · The empty calendar gets no overlay.** A month grid with no micro-cards is
self-evident, and the status line already reads `0 posts planned`. The states
frame draws the empty grid explicitly so it is a designed state rather than an
oversight, but no message sits on top of it. The list view keeps its message,
because a blank list is indistinguishable from a broken one.

**D4 · The two Opportunities unavailable states collapse into one.** The
mapping doc kept them at two. From the user's side "this deployment has no GSC
credentials" and "you have not connected GSC" are the same sentence and the same
next step, and one of them currently renders nothing at all. Both become
`Connect Search Console to surface real ranking opportunities.` The
capability's own `degraded` message still wins when it exists.

**D5 · "Not analyzed yet" is its own state.** Ready-but-not-run currently has
no copy, and rule 4 forbids borrowing "found nothing" for it. New:
`Not analyzed yet. Find opportunities reads your Search Console history for
queries you nearly rank for.`

**D6 · Library splits filter from search.** `No items match your filter.`
stays for a filter pill; search gets `No content matches "{query}".` with a
Clear search action. Integrations already treats search-no-match as its own
state, so this is one product, one rule.

**D7 · The Instagram reason becomes visible caption text** under the disabled
button, not a tooltip. This is the same rule as the off-domain flag: when the
product declines to do something, it says why on the screen.

**D8 · The identity empties lose their duplicate.** `No values yet.`,
`No tone defined yet.` and `No aesthetic tags yet.` are drawn **once**, on Brand
Overview, which owns identity. `BusinessDetailsPanel`'s copies are deleted in
the port, along with the fields above them.

**D9 · Integrations' "nothing connected" is a status-line variant**, not an
`EmptyState`. The frame draws the zero clause plus sixteen `available` cards.

**D10 · A rail card never has an empty body.** `CompetitorAdsPanel` returns
`null` while `connected === null`, leaving a titled card with nothing in it.
It gets the loading state its siblings have.

**D11 · The inline empties adopt `EmptyState`.** 25 renderings across two
ad-hoc classes draw identically to the component in Figma; the port routes them
through it so the next screen inherits the decision instead of re-litigating it.

**D12 · The population banner names its sources in prose.** Today it joins raw
keys (defect 14). The frame draws both: the shipped string, and
`Brand populated from your website and 2 project files. Review and edit values
below.` The count of files is real information; `file:` prefixes and `.pdf`
extensions are not. The `{n} fields updated.` clause stays dropped, because the
demo never populates it.

---

## Built in Figma

Six frames, 91 states, one per page, at the next free horizontal slot:

| Page | Frame | Node | Sections | States | Height |
| --- | --- | --- | --- | --- | --- |
| Library | `Library — states` | `152:91` | 2 | 4 | 691 |
| Integrations | `Integrations — states` | `155:91` | 4 | 15 | 2,421 |
| Ad Creative | `Ad Creative — states` | `156:93` | 4 | 11 | 1,852 |
| Social Media | `Social Media — states` | `157:104` | 5 | 15 | 2,478 |
| SEO & AEO | `SEO & AEO — states` | `158:100` | 5 | 16 | 2,643 |
| Brand Intelligence | `Brand Intelligence — states` | `159:115` | 7 | 30 | 4,801 |

### The frame recipe, read off `Dashboard — states` rather than invented

The Dashboard already had a states frame, so the convention existed and these
match it. Measured, not assumed:

```
root      1180 FIXED / HUG · VERTICAL · pad 24/32/32/32 · gap 16 · layer/canvas
title     20px SemiBold · lineHeight 130% · text/primary
section   1116 FILL · VERTICAL · pad 8/0/0/0 · gap 12 · no fill
label     11px SemiBold · lineHeight 135% · tracking 2% · text/dim
state     1116 FILL · pad 18/20 · gap 8 · layer/raised · radius 16 · Elevation/md
box       1076 FILL · pad 16 · gap 6 · layer/inset · radius 12
body      13px SemiBold 145% (headline) · 12px Regular 145% (explanation)
action    instance of Button / primary·secondary·ghost — Label#2:0 / #2:1 / #2:2
```

**Annotations live outside the box; the box holds only product copy.** That is
what keeps a states catalogue compatible with the no-rationale-in-the-UI rule:
the section and state labels are the frame's documentation, and everything
inside `box` is a real string a user would see.

**Tone carries the state.** Loading is `text/muted`; an assertive empty is
`text/primary` with a `text/secondary` explanation; a *partial* failure is
`text/secondary` because the screen still works; a *total* failure is
`semantic/negative`. That split was read off the Dashboard frame, where "Could
not load: Needs you, Funnel. The rest of the screen is current." is secondary
and "Could not load your workspace." is negative.

**Cards in a states catalogue are deliberately unequal in height.** The
same-size rule governs product cards at one level in a real screen. Here each
card is a different specimen, and the Dashboard frame already sizes them to
content — forcing 91 cards to one height would add thousands of pixels of air.
Noted so nobody "fixes" it later.

### Verified, not assumed

A full walk of all six frames reports zero problems: every section 1116, every
box 1076, every state carrying `Elevation/md`, every text metric explicit, every
fill bound to a variable, no font fallback.

Two bugs the read-back caught, both invisible in a screenshot:

1. **Line height and tracking were unset on the first frame.** Auto line height
   made the 11px label 14px tall where the convention is 15, and the 13px body
   16 where it is 19. The labels also carry **2% letter spacing**, which nothing
   in the brief mentions.
2. **A type pass reached inside a component instance.** A `query('TEXT')` sweep
   caught the button's own label and moved it from the component's 146% to 145%
   — a one-percent divergence from every other button in the file. Fixed, and
   the remaining five frames set their metrics at creation so no instance
   internals are ever touched.

## Mapping table

| # | Kepler component | Siphron form | Outcome | Note |
| --- | --- | --- | --- | --- |
| — | `EmptyState` | centred inset block | bends | spinner / message / optional action, on the inset tone not raised |
| — | `SetupRequired` | raised panel + checklist | maps | the only state that routes to its own fix |
| — | inline `__empty` paragraphs | *same as `EmptyState`* | **rejected** | one form, per D11 |
| — | `SectionGenerateControl` | status text + button | bends | five states, and one of them has no button |
| — | connector card states | status pill + detail line | maps | seven states, four with no action |
| — | population banner | rail ToolCard | maps | four states, six named stages while running |
| — | null placeholders | `—` | maps | one rendering, per D2 |
