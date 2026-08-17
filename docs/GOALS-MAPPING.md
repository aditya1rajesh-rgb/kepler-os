# Goals — component inventory and mapping decisions

Working document. Siphron direction, decided component by component.
Read from `pages/workspace-modules/Goals.jsx` and `components/goals/GoalMath.jsx`.

**Status: inventory complete, zero mappings decided.**

---

## One route, two screens

`/goals` renders a **list** by default and a **detail** view when `?goal={id}`
is present. They share nothing but the shell, so they are two mapping problems.

---

## A · List view

| Slot | Content |
| --- | --- |
| `status` | `{n} active` — only when goals exist |
| `primary` | `New goal` |
| `banner` | **four independent** messages: `loadError`, `error`, `failureDetail` (only alongside one of the first two), and `notice` |

### A1 · New goal panel — only while creating

Name · Kind (Measured / Directional pills, each with an explanatory line) ·
Measure select (measured only) · Start · End · Target.

**The target proposal is the interesting part.** Three distinct states:

- *loading* — `Reading your rates…`
- *proposal* — a `Use 1,200` button plus `At your current pace you'd reach
  1,050–1,400 (medium confidence)`
- *no history* — `No history for this measure yet, set a target yourself and
  Kepler will track against it.`

Then an **advice line** that is advisory, never blocking, except that
`level === 'error'` disables Create. Actions: `Create goal` / `Cancel`.

### A2 · Goals list

Row: ★ if primary · name · meta (`{Measure} · target {n}` or `Directional`,
then `· ends {date}`) · StatusPill · `Open`.

**Three empty states, and they are not interchangeable:**

1. `loadError` — *"Goals could not be loaded, so this list is not showing your
   goals."* An unreadable list is not an empty list; saying "no goals yet" here
   would be a confident false statement about the user's own data.
2. no goals — *"No goals yet. A goal is what campaigns and assets ladder to."*
3. normal — the table.

---

## B · Detail view

| Slot | Content |
| --- | --- |
| `status` | StatusPill for the goal's status |

**Canvas (left)**

1. Quiet panel: goal name + description
2. **Campaigns** — rows of `title`, `{done}/{total} steps · {status}`, `Open`.
   Empty state: *"No campaigns yet. A goal moves when there is work under it."*
3. **NextWork** — measured goals only. Already specified on the Dashboard
   (`docs/DASHBOARD-MAPPING.md`, Zone 3) and rejected from the reference there;
   the same decision applies here.
4. **Checkpoints** — directional goals only. Checkbox list, done items carry a
   relative timestamp. Empty state names what a checkpoint is for.

**Rail (right) — `GoalMath`**

"Live math, not metadata." Two entirely different renders:

- **measured** — verdict + measure · large % · `{achieved} of {target}` ·
  progress track · four facts (Forecast at current pace / `Short by`·`Ahead
  by`·`Gap` / Days remaining / Needed per day) · basis sentence · optional
  `Estimated from trailing readings, not per-day totals.` · meta (Window,
  Status)
- **directional** — `Directional goal` plus a note that there is no forecast and
  progress is checkpoints. **No forecast frame at all** — an empty one would
  imply the number is missing rather than inapplicable.

---

## What already exists from the Dashboard build

`Verdict pill` · `Fact cell` · `Button / primary|secondary|ghost` · progress
track · `Elevation/*` · the funnel and leaderboard patterns · the drill-down
panel pattern.

**GoalMath is very nearly the Dashboard's goal-standing card**: same verdict,
same big percentage, same `{achieved} of {target}`, same track, same four facts,
same basis line. The differences are that it adds Window/Status metadata and
drops the goal name.

---

## Mapping decisions — to fill in

| # | Kepler component | Siphron form | Outcome | Expansion rule |
| --- | --- | --- | --- | --- |
| A | shell (status / primary / 4-part banner) | — | — | — |
| A1 | New goal form | *no analogue* | — | — |
| A1 | Target proposal (3 states) | — | — | — |
| A2 | Goals list row | leaderboard row? | — | — |
| A2 | 3 empty states | *no analogue* | — | — |
| B | Goal detail header | — | — | — |
| B2 | Campaigns list | leaderboard row? | — | — |
| B3 | NextWork | *rejected* (per Dashboard) | rejected | — |
| B4 | Checkpoints | *no analogue* | — | — |
| B | GoalMath — measured | goal-standing card | — | — |
| B | GoalMath — directional | *no analogue* | — | — |

Same three outcomes as before: **maps** / **bends** / **rejected**, and the same
rule — where a reference form and a Kepler product rule disagree, the rule wins.
