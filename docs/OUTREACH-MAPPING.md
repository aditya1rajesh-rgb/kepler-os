# Outreach — component inventory and mapping decisions

Working document. Siphron direction.
Read from `pages/workspace-modules/Outreach*.jsx`, `Prospecting.jsx`,
`components/outreach/*`.

**Status: inventory complete. Replies, Sequences, Audiences and ABM all built.
Audiences and ABM have their own document: `docs/AUDIENCES-ABM-MAPPING.md`.**

---

## Shape: a shell with four children, and children of their own

`Outreach.jsx` is a 35-line shell keyed by `:subModuleId`. The four children are
**Replies · Sequences · Audiences · ABM** — *not* the Replies/Sequences/
Prospecting/Lists I assumed earlier. Lists, Saved research and Prospecting were
folded **into Audiences** as tabs, because building one audience used to mean
three nav stops with nothing saying they were the same job.

Two of the four have their own view switch, so the module is about **eight
surfaces**:

| Child | Sub-views |
| --- | --- |
| Replies | filter tabs: needs-you / all / … |
| Sequences | **Builder** · **Send engine** |
| Audiences | **Lists** · **Saved research** · **Find prospects** |
| ABM | (single) |

The relocation rule is explicit in the source: *"Relocate, never remove"*, the
same rule the v4 tool rail follows.

---

## A · Replies

The module's most valuable surface, and per the source it previously had the
least prominent one: replies were "a third panel at the bottom of the Send
engine sub-tab, showing a name, a subject and a timestamp, with no sequence
context and no actions."

`status` is a filter tab strip. Panel meta switches between
`{n} waiting on you · oldest {h}h ago` and an explanation of the 10-minute poll.

**Row:** prospect name + company · the **subject line in quotes** (labelled
honestly — `inbox-monitor` stores the subject, *not* the body, so this is not
the reply text) · relative time · `logged manually` when applicable · then **what
they replied to**: `{sequence} · step {n}` and `meeting booked` when set.
Then a StatusPill by reply kind, and actions: `Meeting booked` (only when the
reply still needs a response) and open-sequence.

**Two empty states, again not interchangeable:**
- filtered, but replies exist → *"Nothing waiting on you…"*
- none at all → *"No replies detected yet…"*

## B · Sequences

`VIEWS = Builder | Send engine`.

**Builder** — mode (cold/warm), target list picker, generation config, the
generated sequence, a saved-sequences rail, a push-to-CRM modal with recipient
fields and a start date, and per-step copy affordances.

**Send engine** — `OutreachEngine`, 600 lines, the largest single component in
the module.

## C · Audiences

Tab strip over three whole surfaces, kept intact rather than rewritten:
`OutreachLists` · `AbmSaved` · `Prospecting` (406 lines, the enrichment UI).

`?view=` deep links survive from the retired child routes.

## D · ABM

`AbmResearch`.

---

## Mapping decisions — to fill in

| # | Kepler component | Siphron form | Outcome |
| --- | --- | --- | --- |
| A | reply row (3 stacked context lines + pill + 2 actions) | Recommended Task row | — |
| A | filter tab strip | segmented control | — |
| A | 2 empty states | *no analogue* | — |
| B | builder config + generated sequence | *no analogue* | — |
| B | send engine | *no analogue* | — |
| B | push-to-CRM modal | modal | — |
| C | Audiences tab strip over 3 surfaces | segmented control | **rejected** — the tab strip goes; Audiences becomes one canvas (rail + table + drawer) |
| C | list detail / prospect table | data table | **bends** — Title folds under the name so no value wraps |
| D | ABM research | chat | **bends** — master-detail, the transcript becomes a queue in the rail |

## Note

The reply row is the densest row in the product: three stacked lines of context,
a status pill, and up to two actions. Denser than the campaign step row.
