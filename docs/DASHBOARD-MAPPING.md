# Dashboard — component inventory and mapping decisions

Working document. One visual direction, decided component by component.

Read from source, not from screenshots: `pages/workspace-modules/Dashboard.jsx`
and `components/cockpit/*`. Every state and expansion axis below is real — it is
in the code today.

**Direction: Siphron** (node `118:14300`). One direction, no comparison.
**Hero: split** into a goal-standing card and a separate "what moved" card.

### Siphron's available forms

What the reference actually supplies, from reading it at 3–5×:

| Form | Description |
| --- | --- |
| Pastel icon-chip tile | icon chip · small label · large figure · footer line. 4 tints, 2×2. |
| Big-figure + area card | label · large figure · right-aligned secondary % · smooth violet area chart with dashed gridlines and an endpoint dot · footer with date + total |
| Ranked leaderboard row | rank · avatar · name over email · right-side value |
| Data table | toolbar (Hide / Short / Filter / kebab) · columns · avatar clusters · soft tinted status pills · row kebab |
| Controls | gradient violet primary · bordered secondary · dropdown (`See All`, `Weekly`) · dark "current" chip |
| Page head | date eyebrow · `Welcome back, {name}` · avatar cluster · primary + secondary buttons |

**Not supplied by Siphron** — so these have no reference analogue and need their
own answer: an error/partial-failure banner, an empty state, a prose-and-working
block, a compact secondary strip, a "connect this source" affordance.

---

## The shell

`ModuleScreen` supplies four slots the Dashboard fills. These are shared with
every other module, so a decision here propagates beyond this screen.

| Slot | Content | Notes |
| --- | --- | --- |
| `status` | `Hello, {firstName} — here's where {workspace} stands.` / `…has no goal yet.` | two variants |
| `actions` | Refresh button, label swaps to `Refreshing…` | |
| `banner` | error text (`role="alert"`) **and** a partial-failure notice: `Could not load: {zones}. The rest of the screen is current.` | two independent, can co-occur |
| `primary` | `Set your first goal` — **only when there is no goal** | disappears once a goal exists |

The partial-failure banner matters: this screen is allowed to render with some
zones dead and it names which. Any reference layout has to have somewhere for
that to live.

---

## Zone 1 — `GoalHero`

**The only element on this screen allowed to be large.** Everything else is
deliberately quieter. It is not a stat — it is an argument.

Carries, in order: eyebrow (`Primary goal` / `Leading with your soonest goal`, +
measure label) · goal name (a button, opens the goal) · verdict chip · optional
"no primary is set" notice with a *Make this the primary goal* action · big
percentage · `{achieved} of {target} {unit}` · progress track · a four-up facts
grid · a basis sentence · the "what moved" block · two actions.

**Facts grid (4 cells):** Forecast at this pace · `Short by`/`Ahead by`/`Gap` ·
Days remaining · Needed per day.

**"What moved":** either a delta chip + a sentence (`{subject} rose to {n},
against the reading {7 days} earlier.`) plus an `Alongside it: …` contributor
list, or the null state (`Nothing has moved enough to report…` + *Check for
changes*). A sparkline sits alongside.

### Expansion axes — decide before drawing

| Axis | Behaviour |
| --- | --- |
| **Directional goals** | No forecast at all. Percentage, track, facts grid and basis sentence **all disappear**, replaced by one sentence. The hero must survive losing its centre. |
| **Nulls** | Every number can be null and renders `—`, never `0`. A zero forecast is a claim about the business. |
| **Verdict** | 4 tones: on-track / at-risk / off-pace / unknown — plus `Directional`, which bypasses the verdict entirely. |
| **Contributors** | 0..n, joined with `; ` into one unbounded sentence. Three search terms plus two visibility changes is a long paragraph. |
| **Gap label** | The label itself changes with the sign (`Short by` vs `Ahead by`). Not a static caption. |

**Hard mapping question.** Most reference dashboards make the hero a big number.
Kepler's hero is a number *plus its working plus a correlation claim*. Any
reference hero tile will be too small for it. Do we (a) let the hero span full
width as its own composed section, (b) split it into hero-stat + a separate
"what moved" card, or (c) something else?

---

## Zone 2 — `NeedsYou`

The demand queue. Grouped, counted, every row actionable.

Row: count chip · title · detail · `Open`. `row.kind` varies the row class.
Header meta: `{n} waiting, most urgent first`.

**Empty state hands off** — it does not go blank: *Nothing needs you right now.*
+ a CTA that differs on whether a goal exists (`Plan a campaign` / `Set a goal`).
This is a documented rule: an empty queue must not teach the user the screen is
done with them.

| Axis | Behaviour |
| --- | --- |
| Row count | Unbounded. Ken42 shows 4 rows / 11 items. Needs a scroll or truncation decision. |
| Detail length | Long — one real row runs to two lines with an em-dashed clause and quoted campaign name. |
| Kinds | Multiple, currently distinguished by class. Do they get colour/icon in the new direction? |

Maps cleanly onto most references' task/notification list.

---

## Zone 3 — `NextWork` — "What would close the gap"

**The working is the feature.** The headline is worth exactly as much as the
sentences under it, so the workings list is *always shown*, never behind a
disclosure.

Carries: headline · workings (bullet list) · channel hint (evidence sentence,
absent when evidence doesn't separate wings) · two actions (*Plan a campaign
against it* / *Start one myself*) · fineprint naming the goal it will be created
under.

**5 statuses**, each a real answer, none an empty box: `ok`, `no-gap` (ahead of
pace), `insufficient-evidence`, `no-standing`, `not-measured`. Only `ok` and
`insufficient-evidence` allow action.

**Hard mapping question.** This is prose, not data. It is the least
chart-shaped thing on the screen and most references have no analogue for it. A
reference that only supplies charts and stat tiles will leave this zone
unmapped — that is expected, and it needs a deliberate answer rather than being
forced into a card that fights it.

---

## Zone 4 — `FunnelSnapshot`

Five stages: Sessions → Conversions → CRM records → Meetings → Revenue.

Each stage carries a **sparkline, not just a number** — the screen's admission
filter rejects state, and a trend is the cheapest way to turn state into change.
Per stage: label · value · sparkline · delta %.

**No-source state:** a stage with no connector shows `—` and *Connect {GA4 / a
CRM / Outreach / a CRM with deal values}* — the cold-start requirement. A new
workspace must read as "here is what connecting GA4 would give you", never as
five empty boxes.

| Axis | Behaviour |
| --- | --- |
| Figure width | Real range is `3` to `3,332,852`. Already overflowed one candidate tile. Decide the treatment for 7+ digits. |
| Mixed states | Some stages connected, some not, in the same row. |
| Flat series | Renders mid-height, not at the floor — "unchanged", not "at zero". |
| Null periods | The line **breaks**. Never interpolate; a line through an unmeasured week invents a reading. |

---

## Zone 5 — `ChannelContribution`

Keyed `production—source`. One number per row, no axis toggle.

Summary sentence above the table: `Kepler-produced work accounts for {54.3%} of
{8,136} sessions. The rest is real traffic Kepler cannot claim, and it is in the
table.` Then rows: production · source · share bar · sessions · share % · `Drill`.
Caveats list below.

**Three documented refusals — these are not styling and must survive any mapping:**
1. **The remainder is never hidden.** `Other—…` rows sit in the same table as
   Kepler's work. A table showing only attributed traffic claims the whole
   business ran on Kepler.
2. **No chart around a missing leg.** Until an ad platform is connected, paid is
   absent and the card says so in words.
3. **No cross-channel efficiency comparison.** Nothing assigns a production cost
   to organic, so cost-per-outcome is not available here at all.

Consequence: `Other` rows get **no Drill action** and read quieter. Ken42 has 8
rows, 3 of them `Other`.

---

## Zone 6 — `OtherGoals` — "Also running"

Deliberately compact; must stay visible without competing with the hero.
Per goal: ★ if primary · name (button) · `{measure} · {target}` or `Directional`
· `ends {date}` · *Make primary*.

**Returns `null` entirely when there are no other active goals** — so this zone
is frequently absent. Filters to `status === 'active'` and excludes the hero.

---

## Mapping decisions

Three outcomes: **maps** (reference form fits as-is), **bends** (form adopted,
altered to satisfy a Kepler rule), **rejected** (no analogue, or adopting it
would break a rule — Kepler's own form stays, restyled only).

Rule of thumb: where a reference's form and a Kepler product rule disagree, the
rule wins and the form bends.

| Zone | Kepler component | Siphron form | Outcome |
| --- | --- | --- | --- |
| shell | greeting + Refresh + primary CTA | page head + gradient primary + bordered secondary | **maps** — drop the avatar cluster, Kepler has no team avatars here |
| shell | error / partial-failure banner | *none* | **rejected** → new form: full-width inset strip above content, warning or negative tint, sits above the first card |
| 1a | GoalHero — standing | big-figure + area card | **bends** — keep the card's proportions and figure treatment; the chart region becomes the progress track + 4-up facts grid |
| 1a | verdict chip | tinted status pill | **maps** — 4 tones onto positive / amber / negative / neutral tints |
| 1b | GoalHero — what moved | area-chart half of the same card | **maps** — delta chip + sentence + gradient area sparkline |
| 1c | cold-start goal panel | *none* | **rejected** → Kepler's form, restyled: full-width card, gradient primary |
| 2 | NeedsYou rows | ranked leaderboard row | **bends** — count chip replaces the rank number; two-line body is title over detail; `Open` sits where the value does |
| 2 | NeedsYou empty state | *none* | **rejected** → Kepler's hand-off state stays; it must keep its CTA |
| 3 | NextWork | *none* | **rejected** — this is prose with its working shown, the least chart-shaped thing on the screen. Kepler's form stays; restyle only (card, per-status soft tint, bullet workings, secondary + ghost actions) |
| 4 | FunnelSnapshot stages | pastel icon-chip tile | **maps** — already built and running. 5 tints for 5 stages, 5-across, wrapping 2-up |
| 4 | stage sparkline | gradient area chart | **maps** — already built; per-segment areas so null gaps stay holes |
| 4 | no-source stage | *none* | **rejected** → Kepler's `Connect {source}` CTA stays, styled as the tile's soft white pill |
| 5 | ChannelContribution rows | ranked leaderboard | **maps** — already built. `production—source` slots into the name/email pair |
| 5 | summary sentence | card subtitle area | **maps** |
| 5 | caveats list | *none* | **rejected** → stays as a muted list below the table. Refusal 2 depends on it |
| 6 | OtherGoals strip | *none* | **rejected** → Kepler's compact strip stays; restyle to small pill-cards with ★, name, meta, hover `Make primary` |

### Expansion rules — decided

| # | Question | Decision | Built |
| --- | --- | --- | --- |
| 1 | Funnel figures span `3` to `3,332,852`; revenue overflows at 25px | **Abbreviate past 7 characters** — `3,332,852` → `3.33M`, three significant digits. Exact value in `title` **and** `aria-label`, so it is not hover-only: an abbreviated figure is a rounded reading and must stay recoverable on touch and by assistive tech. | ✅ |
| 2 | "What moved" joins contributors with `; ` — unbounded | **Headline + 2 contributors, rest behind `+N more`.** Nothing is hidden — it expands in place. Distinct from Zone 3's workings, which are explicitly always shown. | ⏳ blocked, see below |
| 3 | `Needs you` is unbounded (Ken42: 4 rows / 11 items) | **Cap at 5, then `Show all {n}`** — the reference's own "See All" affordance. Keeps the card a predictable height so a backlog cannot push Funnel and Channels below the fold. | ✅ |

---

## Zone specifications — ready to draw

Exact anatomy and real Ken42 content for each remaining zone, so building them
costs no further deciding. Values are what the running demo actually computes,
not invented.

**Shared components already built:** `Button / primary`, `Button / secondary`,
`Button / ghost`, `Verdict pill`, `Fact cell`, `Funnel stat tile`, and five
`icon/*` components.

### Zone 1a — Goal standing card (≈62% width)

```
Primary goal · Sessions                        [ Behind ]   ← Verdict pill
Q3 organic sessions to 12,000                              ← Heading/xl
34%   4,047 of 12,000 sessions                             ← Heading/3xl + Type/sm
████████████░░░░░░░░░░░░░░░░░░░░░░░                        ← track, accent @34%
Forecast at this pace │ Short by      │ Days remaining │ Needed per day
9,106                 │ 2,894 sessions│ 50             │ 159      ← 4× Fact cell
Based on 56 readings over 385 days (high confidence).      ← Type/2xs muted
[ Open goal ]  2 campaigns under it                        ← secondary + ghost
```

States that must exist as variants:
- **Directional** — percentage, track and facts grid all disappear, replaced by
  one sentence. The card shrinks; Zone 1b widens to take the freed space.
- **Verdict × 4** — On track / At risk / Behind / Not enough data. Pill tint
  follows: positive / warning / negative / neutral.
- **Gap label flips with sign** — `Short by` ↔ `Ahead by` ↔ `Gap`. Not static.
- **Nulls render `—`, never `0`.** A zero forecast is a claim about the business.

### Zone 1b — What moved card (≈38% width)

```
What moved
[ +12% ]  Sessions rose to 8,136, against the reading 7 days earlier.
Alongside it: “erp for schools” climbed 4 positions onto page one;
newly cited on Perplexity for “sis vendors”.
                                                    +3 more ⌄
        ╱╲──╱────╲──╱                                       ← area sparkline
```

- Copy rule: **"alongside", never "because"**. Correlation stated as
  correlation. This is not styling — it is the claim the product will defend.
- Contributors: headline + 2, remainder behind `+N more` (decided).
- **Null state** — the one the demo actually opens on, since `change_events` is
  seeded empty by design: *"Nothing has moved enough to report since the last
  check — small wobbles are deliberately not raised."* + `Check for changes`.

### Zone 2 — Needs you (≈62% width)

Row = count chip (28pt, accent-soft, tabular) · title over detail · `Open`.

```
Needs you   11 waiting, most urgent first        Show all 4 ⌄
 1  1 sequence stopped sending          [ Open ]
    Edited after approval, so sending halted. Re-approve to resume.
 2  2 replies waiting                   [ Open ]
 2  2 campaign steps overdue            [ Open ]
 6  6 finished drafts not laddered to a campaign  [ Open ]
```

- Cap 5, then `Show all {n}` (decided). Chip tint varies by `row.kind`.
- **Empty state hands off** — never blank: *"Nothing needs you right now."* plus
  a CTA that changes on whether a goal exists.

### Zone 3 — What would close the gap (≈38% width)

**Rejected from the reference — Kepler's form stays, restyled only.**

```
What would close the gap    From 3 measured campaigns
2,894 sessions short with 50 days left. 2 more campaigns of
your usual size would plausibly close it.
  • Your 3 measured campaigns have delivered 538–2,295 sessions
    each (median 1,586).
  • At the median that is 2 campaigns; at your best 2, at your weakest 6.
  • Those are trailing levels from each campaign's own readings,
    not lifetime totals.
[ Plan a campaign against it ]  Start one myself
It will be created under “Q3 organic sessions to 12,000”…
```

The workings list is **always visible, never behind a disclosure** — the working
is the feature. Five statuses, each a real answer: `ok`, `no-gap`,
`insufficient-evidence`, `no-standing`, `not-measured`. Only the first and third
allow action.

### Zone 5 — Channel contribution (full width)

Summary sentence, then leaderboard rows, then caveats.

```
Kepler-produced work accounts for 54.3% of 8,136 sessions. The rest is
real traffic Kepler cannot claim, and it is in the table.

1  ●  Other      Organic Google  ▓▓▓▓▓░░░░░░░  2,305  28.3%
2  ➤  Outreach   Sendgrid        ▓▓▓▓░░░░░░░░  1,885  23.2%  [Drill]
3  $  Paid       Google          ▓▓▓░░░░░░░░░  1,331  16.4%  [Drill]
4  ●  Other      Direct          ▓▓░░░░░░░░░░    966  11.9%
…8 rows total, 3 of them Other
```

- **`Other` rows stay in the same list, dimmed, with no Drill.** Hiding the
  remainder would claim the whole business ran on Kepler's output.
- Chip carries the **wing icon**, never an initial — three `Other` rows all
  rendered "O" before this was fixed.
- Caveats below, muted: the missing-paid-leg sentence is how refusal 2 is kept.

### Zone 6 — Also running (full width, compact)

```
Also running
★ 40 qualified meetings from outreach · Meetings · 40 · ends 2026-10-12  [Make primary]
  Be the obvious answer for multi-campus SIS · Directional · ends 2026-12-01  [Make primary]
```

Renders **nothing at all** when there are no other active goals. Must stay
visibly quieter than the hero.

---

### Zone 4 — funnel chart decisions

These are build notes. **None of them belong on the screen.** An earlier pass
printed two of them under the chart as captions, which explained the designer's
reasoning to a marketer who only wanted to read their own numbers.

- **Revenue is not a funnel segment.** It is currency, and at 3,332,852 it is
  larger than the top of the funnel — as a segment it would make the final stage
  the widest, and a funnel that widens is not a funnel. It renders as a plain
  value beside the funnel with no explanation attached.
- **Segment widths use a power scale** (`value^0.3`, normalised). Linear widths
  are undrawable for this data: Conversions is 1.54% of the track and Meetings
  0.04%, i.e. invisible. The power scale preserves ordering and legibility; the
  step percentages carry the exact truth, so nothing is misstated.
- Stage segments follow Bklit: sized `value / max`, `gap: 4`, halo layers
  behind, non-hovered segments dimmed to `0.4`.
- Channel contribution is the **hover state** on the Sessions segment, opening
  into a drill-down panel. It is not a second section — showing the same
  decomposition twice was the redundancy that killed the earlier layout.

### Fixes this mapping forces

**Identity chips can't be initials.** The leaderboard chip currently renders
`production.charAt(0)`, so Ken42's three `Other` rows all show "O". Replace with
a per-wing icon (Outreach, Paid, Social, Campaign) and a neutral dot for `Other`.
Found by running it, not by reading it.

**Directional-goal collapse.** When the goal is directional the standing card
loses its percentage, track and facts grid. Proposal: the standing card shrinks
to label + name + the one explanatory sentence, and the "what moved" card widens
to take the freed space — rather than leaving a tall empty card.
