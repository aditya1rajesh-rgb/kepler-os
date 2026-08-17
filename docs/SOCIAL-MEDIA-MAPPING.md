# Social Media — component inventory and mapping decisions

Working document. Siphron direction. One flat nav destination, three views
inside it. Read from `pages/workspace-modules/SocialMedia.jsx` (586 lines) and
`components/social/CarouselPreview.jsx`.

**Status: inventory complete, mappings decided, three defects fixed (one real).**

---

## Shape

Not a nav parent: **three views on one screen**, switched in the status row —
`Content Planner · Design Generator · Account History`. The Planner adds a
Calendar/List toggle and a month stepper beside them, which the source is
explicit about: v3 stacked three chrome rows (a panel of tabs, a row of view
toggles, a count) and they collapsed into one because they are all screen
controls.

The module is **gated**: without a saved brand profile it renders
`SetupRequired` instead, because posts are generated against brand voice and
would otherwise be placeholders.

## A · Content Planner

**Calendar setup** sits on the canvas, above the calendar it produces — the
source records that it was tried in the tool rail and moved back, because "a
primary action whose inputs are behind a toggle is incoherent". Six controls:
start date, timeline (2 weeks / 1 month / 6 weeks), posts per week, platform
pills (LinkedIn, X / Twitter, Instagram, Facebook), voice (Company page /
Founder / Mix), optional monthly theme.

**Calendar view**: a month grid, weekday headers, day numbers, and micro-cards
reading `{platform}: {hook}`. Ken42's August has 8 posts on the 4th, 7th, 11th,
14th, 17th, 19th, 22nd and 24th.

**List view**: one card per post with a platform badge carrying the voice
(`LinkedIn · founder`), the hook, the ISO date, and a Design Studio button.

## B · Design Generator

Two panes. Left is the post: platform · voice · date · angle in the header, the
copy in a textarea with a **live character count against the platform limit**
(`Copy (466/1300)`, with a ⚠ once over), the CTA, hashtag chips, then Save /
Copy / publish / Delete and a rating control.

The publish button is the honest part. It changes by platform and connection
state, and Instagram gets a **disabled button that says why**: "Instagram needs
a hosted image or video, so publishing lands with media upload." A missing
capability is stated, not hidden.

Right pane is the carousel: on-brand HTML slides generated from the post, or the
offer to generate one. Optional, and says so.

## C · Account History

Real published posts and their engagement, described in the header as "the
ground truth for what works". Each row: the post text, `{network} · {mediaType}
· {when}`, then reactions / comments / shares, and a link out.

Two setup states above it: not configured on this build (with the reason
LinkedIn history is absent — LinkedIn does not allow reading personal-profile
posts), and connected-but-no-Page-chosen, which offers the Page picker.

---

## Fixed while reading

**Every LinkedIn post was labelled "Facebook".** The row rendered
`p.channel === 'instagram' ? 'Instagram' : 'Facebook'`, so any channel that was
not Instagram was attributed to Facebook. Ken42's demo history is four LinkedIn
posts and one Facebook post; the screen claimed all five were Facebook. Now
mapped from the value, with an explicit `Unknown network` rather than a guess.

**Shares were hidden on four of the five rows** by the same bug: the shares
figure was gated on `p.channel === 'facebook'`, so LinkedIn's 29, 74, 96 and 41
shares were dropped even though the data carried them. Now shown whenever the
metric exists.

Plus two hyphen-as-dash strings: `Some slots were skipped - re-run to fill them.`
and `Nothing to publish - the post is empty.`

## Built in Figma

Page `Social Media — Siphron`.

| Frame | Contents |
| --- | --- |
| `Social Media · Content Planner (calendar)` | one control row, calendar setup, the August grid with all 8 real posts |
| `Social Media · Content Planner (list)` | the same 8 posts as rows with platform-and-voice badges |
| `Social Media · Design Generator` | post pane (466/1300 count, real copy, CTA, hashtags) and the carousel pane |
| `Social Media · Account History` | the not-configured note and 5 published posts with reactions, comments and shares |

Decided while drawing: **calendar week rows are equal height**, not sized by the
busiest day, under the same rule as cards at one level. The Instagram publish
button is drawn in its disabled state with its reason under it, because that is
the state Ken42 is actually in.

**States frame: `Social Media — states` (`157:104`), fifteen states** across five
sections — publishing alone is four, and history is four. Two decisions taken
there: the Instagram reason moves out of its `title` tooltip into visible caption
text, because a disabled control whose reason needs a hover is a dead end on
touch; and the empty **calendar** gets no overlay message, because an empty month
grid is self-evident and the status line already reads `0 posts planned`. The
list view keeps its message, since a blank list is indistinguishable from a
broken one. See `docs/STATES-MAPPING.md`.

## Mapping table

| # | Kepler component | Siphron form | Outcome | Note |
| --- | --- | --- | --- | --- |
| — | 3-view switch + toggles | segmented control ×2 + stepper | maps | one control row, as shipped |
| A | calendar setup | form grid | maps | stays on canvas, above its output |
| A | month grid | calendar | maps | same form as the Campaigns calendar |
| A | post micro-card | inset chip | bends | one line, platform then hook, no chrome |
| A | list card | two-line raised row | maps | same row form as Audiences and Replies |
| B | two-pane generator | split panes | maps | equal height by the card rule |
| B | character count | caption | maps | turns negative-toned past the limit |
| B | platform-conditional publish | button | maps | the disabled Instagram case keeps its reason |
| B | carousel preview | slide strip | bends | needs a horizontal strip, not a stack |
| C | history row | row + metric cluster | maps | metrics right-aligned, link last |
| C | 2 setup states | banner | maps | they stay two |
