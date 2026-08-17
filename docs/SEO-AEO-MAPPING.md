# SEO & AEO — component inventory and mapping decisions

Working document. Siphron direction. Three surfaces on one component
(`SeoAeo.jsx`, 1,090 lines) plus `components/seo-aeo/AiVisibilityPanel.jsx`.

**Status: inventory complete, mappings decided, nine copy and formatting defects
fixed.**

---

## Shape

`Pipeline · Opportunities · AI Visibility`, and the source is explicit that these
are three different jobs: work in flight, what to work on next, and where the
answer engines stand. Only the Pipeline gets the rail, because the other two have
their own primary actions "and would only inherit clutter".

| Surface | Status line | Primary | Rail |
| --- | --- | --- | --- |
| Pipeline | `4 queued · 1 generating · 3 completed · Search Console synced 16/08/2026` | Generate keyword ideas | SEO tools (5 cards) |
| Opportunities | — | on the section itself | — |
| AI Visibility | — | Run visibility scan | — |

## A · Pipeline

A three-column board: **Queue · Generating · Completed**. The card is dense and
every line on it is earned:

- title, then `{intent} · {tier}` (`informational · quick_win`)
- a `GEO` status pill when the keyword is a GEO candidate
- a money-type badge with the routing decision appended: `vs · win off-domain`,
  `Pricing · pricing explainer`, `Comparison · comparison page`
- **the off-domain flag**, which is the most interesting thing on the screen:
  `⚑ Win off-domain: G2 category page and a third-party roundup outrank
  vendor-owned vs pages for this query`. The product is telling you *not* to
  publish, and why.
- `Keyword: …`, then `Vol 1,900 · KD 19 · Opp 100`
- the rationale, in one sentence
- on completed cards: `Score: 93/100 · 498 words` and the real Search Console
  reading `11,240 impressions · 1,043 clicks · pos 3.1`
- `Source: keyword-research`, or `keyword-research+gsc` when GSC data was merged

**Rail — SEO tools**, five cards in three groups: *Data source* (Search
Console), *Find work* (Page teardown, Mention finder), *Technical SEO* (Sitemap,
robots & llms.txt / IndexNow / GEO readiness). The rail carries its own note:
"Tools act on the pipeline board. Anything you add from here lands in the Queue
column."

**Draft modal**: grounded-in list, a quality line (`Quality 93/100 · AEO 88/100
(B) · burstiness 0.42 · 498 words`), AEO recommendations, meta description, the
markdown, and a rating control. Actions: copy markdown, copy schema, publish to
WordPress when configured, create social posts.

## B · Opportunities

The GSC operator loop. `28 found` across 39 queries, summarised as chips
(`Striking distance: 21 · Low CTR: 5 · Cannibalization: 2`), then a list where
each row is badge, query, estimated impact, the reading, the instruction, and
**Add to pipeline** — which is what makes this a work surface rather than a
report.

Two states that are not the same and must not be drawn as one:
- ran, found nothing → "No opportunities surfaced yet. Your site needs more
  Search Console history."
- not connected → the capability's own degraded message, or "Connect Search
  Console to surface real ranking opportunities."

## C · AI Visibility

Four figures (share of voice 37%, answer presence 96%, prompts tracked 6,
surfaces 4), a share-of-voice bar list with the brand first and eight
competitors under it, and the **gap list**: prompts where a competitor is named
and you are not.

`0%` here is a measurement, not a null: LeadSquared and ExtraaEdge really were
not mentioned. It stays `0%`, not `—`.

Sample-vs-live is stated on the surface, not hidden: "Sample data: providers not
connected yet."

---

## Fixed while reading

| File | Was | Now |
| --- | --- | --- |
| `seoOperator` | `22400 impressions/mo` | `22,400` — five figures across four opportunity types now group like every other number in the product |
| `seoOperator` | `…impressions/mo — one push from page 1.` | `: one push from page 1.` |
| `seoOperator` | `…re-promote — the page is slipping.` | `: the page is slipping.` |
| `SeoAeo` | `No opportunities surfaced yet — your site needs…` | full stop |
| `AiVisibilityPanel` | four em-dashed notices (`Sample scan —`, `Scan complete —`, `No AI surfaces are connected yet —`, `Sample data —`) | colons and full stops |
| `AiVisibilityPanel` | `Content opportunities — buyers ask these…:` | `Content opportunities: buyers ask these…` |

The number formatting was the substantive one. Every other numeric surface uses
`Intl.NumberFormat`; the operator loop used bare `Math.round`, so the one screen
built entirely from real Search Console data was the one printing ungrouped
five-figure numbers.

## Built in Figma

Page `SEO & AEO — Siphron`.

| Frame | Contents |
| --- | --- |
| `SEO & AEO · Pipeline` | the three-column board with all 8 real cards, plus the SEO tools rail (5 cards, 3 groups) |
| `SEO & AEO · Opportunities` | summary chips and the top 5 opportunities with impact, reading, instruction and Add to pipeline |
| `SEO & AEO · AI Visibility` | four figures, the 8-row share-of-voice bar list, the gap list |

**States frame: `SEO & AEO — states` (`158:100`), sixteen states** across five
sections — the rail's five tool cards each carry their own unavailable state,
which is where the count of five came up short.

Three corrections there. **The two Opportunities unavailable states collapse into
one**: from the user's side "this deployment has no GSC credentials" and "you
have not connected GSC" are the same sentence and the same next step, and one of
them currently renders *nothing at all* — `SeoAeo.jsx:684` makes the whole
section `null`, so that child route is a blank canvas rather than an empty state.
**A third Opportunities state was missing**: ready-but-not-run has no copy, and
"haven't looked" is not "found nothing", so it gets
`Not analyzed yet. Find opportunities reads your Search Console history for
queries you nearly rank for.`

Also found: `SeoAeo.jsx:699` prints `gscStatus.status` verbatim, so an expired
connection renders `expired` in a rail card — a sixth machine-value leak at a
call site that bypasses `StatusPill`'s label map. And defect 8 from the last pass
is only half fixed: the pipeline card at `:564` still prints
`11240 impressions · 1043 clicks` with bare `Math.round`, while line 551 on the
same card groups `Vol` with `toLocaleString()`. See `docs/STATES-MAPPING.md`.

## Mapping table

| # | Kepler component | Siphron form | Outcome | Note |
| --- | --- | --- | --- | --- |
| — | 3-tab strip | segmented control | maps | |
| A | three-column board | column cards | bends | columns are equal-width cards, and equal height by the card rule |
| A | pipeline card | raised card | bends | seven possible lines; the off-domain flag gets the warning tone, everything else stays muted |
| A | GEO / money-type badges | pill | maps | |
| A | rail, 5 tool cards in 3 groups | ToolRail | maps | already drawn for Measurement and Brand Intelligence |
| A | draft modal | modal | maps | |
| B | summary chips | pill row | maps | |
| B | opportunity row | raised row + action | maps | impact is right-aligned, it is the sort key |
| B | 2 unavailable states | *no analogue* | maps | they stay two |
| C | 4 figures | fact row | maps | |
| C | share-of-voice bars | **Bklit ranked bar chart** | maps | the *same chart* as the Dashboard channel drill-down, drawn the same way |
| C | gap list | two-column row | maps | prompt left, competitors right |
