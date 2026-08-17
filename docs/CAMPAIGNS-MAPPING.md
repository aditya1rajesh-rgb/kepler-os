# Campaigns — component inventory and mapping decisions

Working document. Siphron direction.
Read from `pages/workspace-modules/Campaigns.jsx` (897 lines),
`CampaignsCalendar.jsx`, `components/campaigns/*`, `components/campaign-intake/*`.

**Status: inventory complete, zero mappings decided.**

---

## Three views on one route, plus two modals

`/campaigns/all` switches between **List**, **Detail** (`?campaign=id`) and
**Intake** (`showIntake`). Detail has its own sub-toggle, `plan | calendar`.
That is more surface than Dashboard and Goals combined.

---

## A · List

| Slot | Content |
| --- | --- |
| `status` | Tab strip: **Active / Drafts / Past** — the screen's own filter, deliberately in the bar rather than a third stacked chrome row |
| `actions` | `Plan around an event` |
| `primary` | `Plan with the strategist` |
| `banner` | `SetupRequired` when brand or ICP is missing — disables both create buttons |

**Card** (a grid of them, each the whole click target):
type chip · StatusPill · title · channel chips (from `plan.channelMix`) ·
footer with `{done}/{total} steps done`, relative time, and a delete affordance.

**Three list states:** loading · no campaigns at all · none in this tab.

**Two creation paths, deliberately labelled differently** — `Plan with the
strategist` opens the chat; the empty state's `Create from a quick form` opens
the modal. v3 labelled both "New campaign"; two labels, two destinations.

---

## B · Detail

**Header row:** back link · type chip · optional event chip · `{done}/{total}
steps done` · **goal picker** (which goal this ladders to; *unparented is a real
state*).

**Brief panel:** title · `strategySummary` · `successCriteria` list.
This briefly lived in the rail and was moved out — it is what the campaign is
FOR, so it leads.

**Plan panel** with a toolbar: autoschedule ("spread unscheduled steps one week
apart") and a **list / calendar** view toggle.

- **List view** — ordered steps. Each: order number · module icon · title ·
  module label · brief · rationale · inline error · scheduled date with a clear
  affordance · right-side action, which is one of *open the generated asset*,
  *generate* (with a spinner and a `Generating…` label), or *open in module
  instead*.
- **Calendar view** — month nav, weekday header, day grid, step events plus the
  campaign's anchor date (`anchorLabel`).

**Rail:** `ToolCard` "Linked assets" with a count and a list of asset titles.

**Detail states:** `loading | ready | missing`.

---

## C · Intake

The strategist chat. `New campaign` heading plus a subheading, and a quick-link
across to the modal form. This is a conversational surface, not a form.

## Modals

- **Quick plan** — `What's the goal?` free text, then a campaign-type grid of
  tiles (label + description), inline error.
- **Plan around an event** — hint, event name, date, inline error.

---

## What is reusable from the two finished screens

`Button / primary|secondary|ghost` · `Verdict pill` (as StatusPill) · card and
elevation ramp · `Queue row` · the leaderboard row · the drill-down panel
pattern · tab strip (new).

## Mapping decisions — to fill in

| # | Kepler component | Siphron form | Outcome | Expansion rule |
| --- | --- | --- | --- | --- |
| A | tab strip in the status slot | segmented control | — | — |
| A | campaign card | pastel tile? / task row? | — | — |
| A | SetupRequired banner | *no analogue* | — | — |
| A | 3 list states | *no analogue* | — | — |
| B | detail header + goal picker | — | — | — |
| B | brief + success criteria | — | — | — |
| B | plan step row (3 action variants) | Recommended Task row | — | — |
| B | calendar view | *reference has a Timeline, not a month grid* | — | — |
| B | Linked assets rail | — | — | — |
| C | intake chat | *no analogue* | — | — |
| M | quick-plan / event modals | *no analogue* | — | — |

## Open questions

1. **Is Intake in scope?** It is a chat, and Siphron supplies nothing like it.
2. **Calendar view** — the reference has a horizontal *Timeline* with time-axis
   chips, not a month grid. Adopting the timeline would change what the view
   shows; keeping the month grid means rejecting the reference here.
3. The plan step row carries up to three different right-side actions plus an
   error and a date. It is the densest row in the app so far.
