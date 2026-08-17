# Design reference extract — Finnulate 2.0, `image 7`

Source: `figma.com/design/Z7naUFc0uls3tDrHXS5CIL/Finnulate-2.0?node-id=2-21`

## What this file actually is

**The Figma file contains no design data.** It has one page — "Reference &
Collections" — holding ~60 nodes, every one of them a `rounded-rectangle` named
`image N` with a bitmap fill. No frames, no auto-layout, no components, no text
nodes, no variables, no styles.

`get_design_context` on `2:21` returns exactly this:

```jsx
<div className="relative size-full" data-node-id="2:21" data-name="image 7">
  <img className="absolute inset-0 object-cover size-full" src={imgImage7} />
</div>
```

That is the whole payload. So the MCP route we planned — `get_variable_defs`
for the token table, `get_design_context` for structure — cannot work on this
file. Not a permissions or tier limitation: there is nothing under the bitmap
to read. Everything below was recovered by sampling the PNG's pixels and
reading it at 3× magnification, which means **names and intent are inferred,
values are measured.**

The file is organised as a moodboard, in sections: `Nav`, `Task cards`, `Home`,
`Calender`, `dilouge modal`, `Task detail screen`, `notification`, `Policy`.
Treat it as inspiration to argue with, not a spec to conform to.

## Measured values

### Surfaces — a warm-neutral ladder, inverted from ours

| Role | Value | Notes |
| --- | --- | --- |
| Mockup backdrop | `#dddcda` | outside the app frame; not part of the UI |
| Content surface | `#ffffff` | cards, panels, table — the **raised** tone |
| Chrome / recessed | `#f3f2f0` | sidebar, search field, card footer plate |
| Ink | `#000000` | headings and numbers, true black |
| Ghost / disabled | `~#b9b9b9` | faded table row, ghost chart bars |

The greys are deliberately **warm** — `#f3f2f0` and `#dddcda` both run
R > G > B by 2–3 points. Not a blue-grey system.

### There is no chromatic accent

94% of pixels are effectively greyscale (saturation ≤ 0.1). The primary button
("Export CSV") is `#100f0d`–`#4c4c4a`; the emphasised chart bars are `#202020`.
**Black is the accent.** Colour appears only as state:

| State | Value |
| --- | --- |
| Success | `#0f684c` (deep green) |
| Pending | `#d99f3e` (amber) |
| Refunded / neutral | grey |

### Typography — two families, split by data type

This is the most transferable idea in the reference, and it is a rule, not a
texture:

- **Monospace** for machine-generated values: KPI numbers (`10,320`), IDs
  (`#04910`), quantities, currency (`$3,450`), deltas (`+0,94`), and all
  uppercase letterspaced labels (`TOTAL REVENUE`, `RECENT TRANSACTIONS`,
  column headers). Bold for figures, regular for labels.
- **Proportional sans** for human-generated content: customer names
  (`Ryan Korsgaard`), product names (`Ergo Office Chair`), nav items, button
  labels, unit suffixes (`Orders`, `New Users`), and prose.

Label treatment: uppercase, mono, ~11–12px, tracking ~0.08–0.1em, grey.
Sidebar group headings break the pattern — sentence case, near-black, ~13px.

### Geometry

Cards ~12px radius, controls ~8px, checkboxes ~4px, status pills fully rounded.
Table rows ~48px. Icons 20px, 1.5px stroke.

## Component anatomy worth stealing

**KPI card.** White card sits *inset on a slightly larger `#f3f2f0` plate*, so
the delta footer reads as an under-layer rather than a bordered region. Inside:
uppercase mono label → large bold mono figure with a sans unit suffix beside it
→ a sparkline of thin hairlines with exactly one bar blacked out as the current
period. Footer: green mono delta + grey sans qualifier.

**Sidebar.** Sidebar is the *recessed* tone and the active item *lifts to
white* with a soft shadow — the inverse of the usual "tint the active row"
move, and cheaper to read. The active icon also switches from stroked to
filled. Groups are separated by hairlines with a text heading, not by boxes.
Workspace switcher at top: tinted card, app-icon tile, label over name, stacked
chevrons.

**Status pills.** White fill, 1px light border, semantic colour carried only by
a filled dot and the label text. No tinted background. Notably lighter-touch
than our `--positive-soft` tinted chips.

**Panel header.** Uppercase mono title + ⓘ affordance on the left, controls
right-aligned, `…` overflow at the far right. Consistent across every panel.

**Charts — neither one is a bar chart.** This only became visible at 5×
magnification, and it is the single biggest driver of whether a rebuild reads
as "the same design":

- *Sales trend* is a **waffle matrix**: a grid of discrete 7px rounded squares
  with 2px gutters (~60 columns × 27 rows), black for the focus series stacked
  up from the baseline and pale grey for the comparison series above it. Every
  column carries at least one black cell, so the baseline reads as a solid
  rule. Gridlines are faint solid hairlines.
- *Revenue breakdown* is a **thin stacked stem**: one ~3.5px rounded vertical
  rule per period, widely spaced (~14 across the plot), black from the baseline
  with the comparison series stacked pale on top — stacked, not overlaid.
  Gridlines here are **dotted**, not solid.

Axis labels are mono throughout. The tooltip is a plain white card with
dot-prefixed rows and a 1px vertical marker line down to the axis.

**Table.** Checkbox column, uppercase mono headers each with a sort glyph,
type-split cells (see typography), `…` row action, and the last row faded out
as a scroll affordance.

## How this collides with Kepler v4

| Dimension | Reference | Kepler v4 (`src/index.css`) |
| --- | --- | --- |
| Mode | light, warm-neutral | premium dark |
| Canvas | `#ffffff` | `#0a0b0f` |
| Chrome | `#f3f2f0` (recessed) | `#0e0f14` |
| Accent | none — black is the accent | indigo `#4a6cf7`, the Kepler identity |
| Ladder direction | chrome recessed, content lifts to white | chrome on canvas, content raised above |
| Type | dual-family, mono for data | single-family Inter, by design |
| Saturation | 94% greyscale | indigo-forward |

Two things follow.

**The palettes are irreconcilable.** Adopting the reference's colour means
inverting v4's polarity and dropping indigo — i.e. replacing the documented
identity, not extending it.

**The structural logic already agrees.** v4's stated rule is "group with TONE
instead \[of outlines]… a container earns its place on the ladder by what it
*is*". `#ffffff` cards on `#f3f2f0` chrome is exactly that discipline — a ~4 L\*
step doing the grouping with no hairline. The reference is independent
confirmation that v4's grouping model is right; it disagrees only about
polarity and hue.

So the component anatomy above (KPI plate, lifted active nav item, dot-only
status pills, dual-family type, two-series bars) ports to dark v4 **without**
touching the palette. That is the high-yield, low-risk subset.
