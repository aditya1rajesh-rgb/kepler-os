# Library — component inventory and mapping decisions

Working document. Siphron direction. One flat destination, one list.
Read from `pages/workspace-modules/Library.jsx` (161 lines).

**Status: inventory complete, mappings decided, three defects fixed (one of them
product-wide).**

---

## Shape

The smallest screen in the product and the only pure **browse** surface: every
asset any module has generated, in one list, newest first. The source is explicit
that it has **no primary action** — there is nothing to generate here — so the
filter row is the screen's control and sits in the bar rather than as a third
stacked strip.

- **Filters** with live counts: `All 20 · SEO & AEO 8 · Ad Creative 2 ·
  Outreach 2 · Social Media 8`.
- **Search** over title and target keyword, in the actions slot.
- **Row**: type badge · title (with the target keyword under it when there is
  one) · status pill · relative time · a go arrow.

Ken42's library holds 20 items spanning six weeks, from a blog draft still
generating five hours ago to a completed comparison page from 01/07/2026.

## Fixed while reading

**`StatusPill` was printing raw machine values, everywhere it is used.** The
component rendered `{status}` verbatim, so the Library listed items as `queue`,
`generating`, `completed`, and Campaigns showed `active`. An item waiting in the
queue was labelled "queue", which is not even the right part of speech.

The fix is central, in `StatusPill` itself: a label map for known machine values
(`queue → Queued`, `stopped_reply → Stopped, replied`, …), the CSS class still
derived from the raw value, and **anything unmapped passes through untouched**
so callers that already supply prose ("Meeting booked") are unaffected. Verified
on Library and Campaigns.

**Library called Ad Creative "Ad Campaigns"** in both the type badge and the
filter row — the module's old name, still shown for a destination the nav calls
Ad Creative. Same defect class as the ABM/Research one.

Also: `No content yet - generate assets…` (hyphen as dash).

## Worth flagging, not fixed

**The go arrow overpromises.** `openItem` navigates to the item's *module*, not
to the item: clicking a specific blog draft lands you on the SEO pipeline board,
not on that draft. The row looks like it opens the asset. Fixing it properly
means deep links per asset type, which is a code change beyond this pass, so the
design draws the row as it behaves and the deep-link work is noted here.

## Built in Figma

Page `Library — Siphron`, frame `Library`. All 20 real assets, filters with
counts, search in the actions slot.

Decided while drawing: **the type badge carries a tint per module** (SEO ice,
Ad Creative peach, Outreach lavender, Social mint) at one fixed width, and the
**status pills share one width** so both read as columns. A browse list is
scanned down, not across, so the two repeating columns have to line up.

**States frame: `Library — states` (`152:91`), four states.** The third empty
split in two: `No items match your filter.` was also firing for a search, and a
search is not a filter, so search gets `No content matches “{query}”.` with a
Clear search action. See `docs/STATES-MAPPING.md`.

## Mapping table

| # | Kepler component | Siphron form | Outcome | Note |
| --- | --- | --- | --- | --- |
| — | filter row with counts | pill row | maps | counts stay in the pills |
| — | search field | input in the actions slot | maps | |
| — | library row | data row | maps | same row form as the Outreach and Audiences lists |
| — | type badge | pill | bends | one tint per module, so the eye can group by source |
| — | status pill | status pill | maps | now labelled, not raw |
| — | 3 states (loading, nothing at all, nothing in this filter) | — | maps | they stay three, and only the first offers no action |
