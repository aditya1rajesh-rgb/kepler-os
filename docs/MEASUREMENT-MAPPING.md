# Measurement — component inventory and mapping decisions

Working document. Siphron direction.
Read from `pages/workspace-modules/Measurement.jsx`,
`components/measurement/{ChannelDetail,Ga4Panel}.jsx`.

**Status: inventory complete, zero mappings decided.**

---

## The headline finding

**Measurement contains no charts.** Not one. The screen whose entire job is
measurement renders two stat strips and a table of numbers; `Ga4Panel` is
connection UI plus more stat facts. The only trend anywhere in the product is
the Dashboard's sparkline.

The data is there — 56 weekly readings per campaign, per provider, with a source
breakdown. So mapping this screen is not a restyle. It is **introducing charts
where the product currently only prints totals**, which is a bigger design move
than anything on the previous three screens.

---

## Two views on one route

`/measurement` shows **Performance** by default and **Channel detail** when
`?channel={key}` is present.

### Shell

| Slot | Content |
| --- | --- |
| `status` | `Last pulled {relative}` |
| `primary` | `Pull latest` → `Pulling…` |
| `banner` | `← All channels` back link when drilled, plus error and notice |
| `rail` | labelled **Sources** |

### A · Performance

**One stat strip, six figures:** Sessions (28d) · Conversions · CRM leads ·
Meetings · Revenue (won) · Campaigns. Deliberately one strip — v3 rendered this
one *and* a second inside `Ga4Panel` in the same scroll with no relationship
between them.

**Campaign performance panel** — `{n} campaigns · matched by UTM`. Each row:
title · `{done}/{total} assets` · the campaign's UTM in code style · then
**seven metrics inline** (sessions, conv., sent, replied, mtgs, CRM, rev.) ·
and a `Tracked links` toggle that expands per-surface tracked URLs with copy.

Empty: *"No campaigns yet. Create one in Campaigns, then ship its tracked links
to attribute outcomes."*

### B · Channel detail

Panel titled `{production} — {source}`, a stat-fact row, the channel's
`missing` disclosure, then a **Campaigns** panel ("The work behind this
channel").

Two distinct empties, and the distinction is deliberate:
- *"That channel has no readings in the current scope."*
- *"No Kepler campaign produced this traffic, it arrived untagged."*

**Loading is NOT the same as no readings** — the source calls this out
explicitly: "that is a different, and much more alarming, sentence than 'still
loading'."

### Rail · Sources

`Data sources` group with a GA4 ToolCard (Connected / Not connected + the
property picker), then a `To measure more` group of setup hints — one per
*unmet* prerequisite only. These hints are in the rail on purpose: they are
setup guidance, so they must not sit above the numbers they qualify.

---

## Mapping decisions — to fill in

| # | Kepler component | Siphron / Bklit form | Outcome | Expansion rule |
| --- | --- | --- | --- | --- |
| A | 6-figure stat strip | pastel tile row / KPI | — | — |
| A | **trend over time** | *does not exist yet* | **new** | — |
| A | campaign row, 7 inline metrics | leaderboard row / table | — | — |
| A | tracked-links expander | *no analogue* | — | — |
| B | channel detail facts | — | — | — |
| B | channel `missing` disclosure | *no analogue* | — | — |
| B | 2 empty states + loading | *no analogue* | — | — |
| R | rail: GA4 source card | — | — | — |
| R | rail: setup hints | — | — | — |

## Open question

The seven inline metrics per campaign row are the densest data on the screen and
currently render as seven bold numbers in a row. That is a table pretending to
be prose. It is the strongest candidate for either a real table with a header,
or a small multiple of charts per campaign.
