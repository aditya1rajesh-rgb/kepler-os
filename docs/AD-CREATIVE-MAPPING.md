# Ad Creative — component inventory and mapping decisions

Working document. Siphron direction. One flat destination, one screen.
Read from `pages/workspace-modules/AdCampaigns.jsx` (493 lines) and
`components/ad-campaigns/CompetitorAdsPanel.jsx`.

**Status: inventory complete, mappings decided, four defects fixed (one real).**

---

## Shape

A two-pane builder — **configuration left, preview right** — with a `Research`
rail. The primary action sits in the screen bar, and the source records why: in
v3 it lived in the header of a near-empty panel a full scroll *above* the form it
submits.

The module is **gated** on brand context plus an ICP.

## A · Campaign configuration

Name · strategy (Lead Gen / Event / Brand Awareness / Retargeting / Product
Launch, as a tile grid) · target ICP (a select over saved personas) · goal ·
placement pills (Google Ads / LinkedIn / Meta / Multi-platform) · budget tier as
a **three-stop slider** labelled Essential / Growth / Scale.

The budget slider is the only range input in the product. It is three discrete
stops, so it is drawn as a segmented control with a track, not as a continuous
slider that implies precision the model does not have.

## B · Campaign preview

**Brief summary** restates what will be generated: campaign name, target ICP,
goal, strategy. Every one of those four can read "Not selected" / "Not set", and
that is the point — it is a pre-flight check, not decoration.

**Ad variants** as cards. Each carries the angle (`outcome`, `objection`,
`authority`, `urgency`), the headline, primary text, description, CTA, the
rationale for the angle, a **per-field character count against the platform
limit** (`headline 38/70 · primaryText 284/600`), an `Over limit` status when it
breaches, Copy, and a rating control.

**LinkedIn adjacent targeting** is the most distinctive thing here and has no
analogue elsewhere in the product: seven adjacent roles with seniority and a
reason each, job functions to layer, exclusions, and a recommended combination.
It is targeting advice, not copy, and it is what makes this screen more than a
generator.

## C · Research rail

*Saved* (campaigns, each with its variant count) and *Competitor intelligence*
(Meta Ad Library, which grounds generation and says so in the status line:
"Grounded in your Meta Ad Library competitor read").

---

## Fixed while reading

**Opening a saved campaign showed a brief that contradicted its own variants.**
The stored payload used `objective` / `campaignType` / `count`, while the screen
reads `goal` / `type` / `name`, so `openSaved` restored only the platform: the
brief read "Campaign: Unnamed campaign · Target ICP: Not selected · Goal: Not
set · Strategy: Not selected" directly above four variants that plainly came
from a named, targeted campaign. Two different claims about the same thing on
one screen.

The demo fixtures now use the shape the app actually writes, and `openSaved`
falls back to the item's title, because a saved item always has one and should
never render as "Unnamed campaign".

Also fixed: the empty state told you to click **"Generate Campaign Assets"**
while the button reads **"Generate campaign assets"** — one control, two names.
And `Adjacent roles that influence or fund this purchase - stack these…`
(hyphen as dash).

## Built in Figma

Page `Ad Creative — Siphron`, frame `Ad Creative · Builder` (1,570px).

**Two panes, not three.** The screen first went in as configuration | preview |
Research rail, which left the preview 424px: the four variant cards stacked one
per row, the targeting roles needed two lines each, and the frame ran to
2,590px. Three columns do not fit at 1,180.

The fix collapses it to two: **the rail's cards become footers on the
configuration pane** (Saved campaigns and Meta Ad Library sit under a hairline
below the budget tier), and **the preview extends to the right edge** at 720px.
That buys two variants abreast, single-line targeting rows, and a screen 40%
shorter. It also fills the configuration pane, which had been carrying ~2,000px
of dead space under the equal-size rule.

Research belongs there anyway: it is reference material you consult while
configuring, not while reading output.

Also decided: **the budget slider is drawn as a three-stop segmented control**,
not a range input. It has exactly three values, and a continuous track implies a
precision the model does not have.

**States frame: `Ad Creative — states` (`156:93`), eleven states** across four
sections. Two defects surfaced in the states this module was about to have drawn:
the gate titles itself **"Ad Campaigns"** (`AdCampaigns.jsx:206`), the fifth
stale-name leak and the one a new workspace sees first; and the per-field
character count prints raw field keys, so `primaryText 284/600` reaches the
screen. The frame draws `Ad Creative` and `Primary text 284/600`. See
`docs/STATES-MAPPING.md`.

## Mapping table

| # | Kepler component | Siphron form | Outcome | Note |
| --- | --- | --- | --- | --- |
| A | two-pane builder | split panes | maps | equal height by the card rule |
| A | strategy tile grid | pill row | bends | five tiles at this width read as pills, not cards |
| A | placement pills | pill row | maps | |
| A | budget slider | segmented control + track | bends | three discrete stops, so no continuous slider |
| B | brief summary | fact list | maps | unset values stay visible as "Not set" |
| B | variant card | raised card | maps | angle as a badge, rationale muted under the copy |
| B | per-field char counts | caption | maps | goes negative-toned at `Over limit` |
| B | adjacent targeting | *no analogue* | **new** | role · seniority · why, then layered functions and exclusions |
| C | rail: saved + Meta Ad Library | ToolRail | maps | |
