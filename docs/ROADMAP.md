# Kepler roadmap — to "a marketer lives in this app"

**North star (2026-08-08):** any marketer on the team lives in Kepler as an
orchestrator across all wings, working from insights and measurable outcomes that
come from real data flows.

**Generation stays the core act.** The problem is not that Kepler generates too
much — it's that **generated assets are orphans**: standalone pieces that serve no
stated goal, are grounded in nothing but brand voice, and never learn from what
came before. Everything must ladder to **account goals the user defines**, in
service of specific campaigns.

**Decided constraints:** out-of-app nudges **deferred** — in-app only. Paid media
is **in scope** (reinstated 2026-08-08); platform approvals should be applied for
immediately since they carry weeks of external lead time.

**Evidence base:** `docs/RETENTION-MODEL.md`. There is **no customer research and
no product analytics** in this repo; anything marked *(hypothesis)* is exactly
that, and the roadmap is sequenced to fix that blindness early.

> **Correction to an earlier draft.** I previously argued "generation is episodic,
> therefore it can't drive return" and proposed demoting it to a dispatched action.
> That was wrong. Generation is episodic *when it's orphaned*. Tied to a standing
> goal with a measurable gap it becomes **continuous** — the gap pulls the next
> asset. Generation is the loop; it just needs closing.

---

## 0. Standing design principle: scaffold, not cage

*Established while specifying the Goals screen; applies to every screen from here on.*

> "The set constraints that we place don't necessarily map into the real world.
> It's a decent base, but some operations need that human thought process."

Every structured input in Kepler accepts a user-defined escape hatch. The
taxonomy we derive from data is a **strong default, never the limit** of what a
user can express — goal measures, campaign types, channels, ICP attributes,
content types, mapping rules.

**The honesty clause makes it work.** Where a user goes off-taxonomy, Kepler
states plainly what it can and cannot do with that input rather than silently
degrading. A free-text goal is a real goal that organises real work — it just
doesn't get a forecast, and it says so. The failure mode to avoid is "let users
type anything", which quietly becomes "half the app does nothing with half its
data".

The general rule this produces:

**Structure is universal. Math is conditional.**
Everything a user creates can be laddered to, attached to, and organised by.
Only the things bound to a measurable source get progress bars, forecasts and
automated recommendations.

### Second standing principle: rent commodity, own scarcity

*Emerged across S4, S6 and S7, having settled three separate arguments.*

**Don't build commodity infrastructure. Do acquire scarce access.**

| Module | Declined to build | Because |
|---|---|---|
| AEO (S4) | Enterprise monitoring scale | Commodity — $50–100/mo, ingest it instead |
| Outreach (S6) | Inbox warmup / deliverability | Commodity — Instantly sells it at $97/mo flat |
| Social (S7) | *nothing* — **we pursue LinkedIn MDP ourselves** | Scarce — hard to obtain, and an asset once held |

Inbox warmup is a commodity anyone can buy. **LinkedIn Marketing Developer
Platform partner status is scarce**, gated by review, and once granted it is a
genuine barrier a competitor cannot trivially replicate. Renting the first while
owning the second is coherent, not contradictory.


## 1. Domain model

The user is a **generalist orchestrator**. They don't own the wings — paid sits
with an agency, content may be freelance, the CRM belongs to sales. They coordinate
and are answerable for the number at the end.

Kepler's job is not to be the best SEO tool or the best sequencer; each wing has a
better point tool. Kepler's job is to be the only place where **a goal, the work
done against it, and the outcome are the same object**.

## 2. Jobs to be done *(hypothesis — unvalidated, see §7)*

| Type | Job |
|---|---|
| **Functional** | Move a stated goal forward; produce the *right* next asset, not just an asset; prove contribution to revenue |
| **Social** | Be the person who has the numbers when the founder asks |
| **Emotional** | Confidence nothing is silently broken; that the work adds up to something |

**Two pains verified in code, not assumed:**
- Editing a running sequence **silently stops it** (`migrations/022:110-123`). The
  product creates the anxiety it should remove.
- Generation is grounded in **brand voice only** — `blogPipelineService.js` pulls
  `getBrandContextForGeneration` (brand + ICP) and nothing else. The model writing
  your blog does not know what campaign it serves, what goal it advances, what was
  already written for that campaign, or what previously performed.

## 3. What already exists (better than expected)

The measurement chain is **largely built**:

```
content_items.campaign_id ─► campaigns ─► campaign_metrics ─► GA4 / CRM / closed-won
        (migration 012)        (012)          (017)
```

Assets can already be attributed to campaigns. Campaigns already accrue daily
metrics. **Two rungs are missing** — one above, one below:

- **Above:** there is no account-level Goal. `goal` exists only as a free-text
  column on `campaigns` (`012:19`). Nothing persists across campaigns, so nothing
  can accumulate toward a target.
- **Below:** generation never *consumes* any of it. The chain carries data upward
  for reporting and never feeds it back down into the next asset.

That's the whole thesis: **close the loop in both directions.**

```
Account Goal          ← NEW (the thing everything ladders to)
   └── Campaign       ← exists, needs a goal_id
         ├── Asset    ← exists; generation must CONSUME goal + campaign +
         │              prior performance + real search data, not just brand voice
         └── Metrics  ← exists, must flow BACK into the next generation
```

## 4. Entropy / negentropy read

Using the negentropy lens — **entropy** (drift toward decay and complexity without
value), **negentropy** (deliberate reversal: compounding value), **tacit knowledge**
(the unwritten knowledge of how things really work).

**Already compounding:** `campaign_metrics` daily accrual; `generation_feedback` +
`brand_field_suggestions`; `workspace_events`.

**Entropic:**
- **Assets are orphans.** Volume grows, meaning doesn't. More content, no more
  clarity about whether anything is working — complexity without capability, the
  textbook definition.
- **Generation can't improve.** With no goal and no performance signal in the
  prompt, asset #50 is generated with exactly the knowledge available for asset #1.
- Stateless jobs (teardowns, scans) discard every run.
- Silent stop — trust decay.

**The stasis trap:** Kepler produces output but no **compounding asset**. Closing
the generation loop is what converts output into an asset that gets better with
use — and it is the one thing a competitor can't copy by shipping the same feature
list, because it's built from *your* accumulated outcomes.

## 5. Prioritisation: ICE (not RICE)

Product stage early PMF, small team, **data availability minimal** — no analytics
instrumentation exists. RICE needs Reach, which we'd have to invent, so a RICE
score would be fabricated precision. **ICE** (Impact × Confidence × Ease, 1–10).

| # | Epic | I | C | E | ICE |
|---|---|---|---|---|---|
| E1 | Sequence re-approval signal | 9 | 10 | 9 | **9.3** |
| E2 | Goals + feasibility engine | 9 | 9 | 4 | **7.3** |
| E4 | Usage instrumentation | 7 | 9 | 9 | **8.3** |
| E3 | Goal-grounded generation | 10 | 8 | 6 | **8.0** |
| E7 | Scheduled detectors | 8 | 8 | 7 | **7.7** |
| E5 | Goal cockpit (return surface) | 9 | 7 | 6 | **7.3** |
| E6 | Closed loop: performance → next asset | 9 | 6 | 4 | **6.3** |
| E8 | Learning made legible | 6 | 6 | 6 | **6.0** |
| E9 | Tenancy: org + workspace, invites, members, actor_id | 9 | 8 | 4 | **7.0** |
| E11 | Learned campaign shapes (org-scoped, opt-in) | 10 | 6 | 3 | **6.3** |
| E12 | Composite opportunity engine | 9 | 7 | 5 | **7.0** |
| E13 | AEO surface: prompts, citations, provider ingestion | 8 | 7 | 4 | **6.3** |
| E14 | Paid media ingestion (campaign/ad-set/creative) | 9 | 7 | 3 | **6.3** |
| E15 | Revenue picture (CRM totals, honest cut line) | 8 | 8 | 6 | **7.3** |
| E16 | Reply inbox | 9 | 9 | 7 | **8.3** |
| E17 | Outreach warnings (contains E1) | 8 | 8 | 6 | **7.3** |
| E18 | Audience sync to ad platforms | 8 | 6 | 4 | **6.0** |
| E19 | Ad push to platforms (write scopes, ID link) | 9 | 6 | 3 | **6.0** |
| E20 | Deep copy + targeting (both spec/rendition splits) | 8 | 8 | 4 | **6.7** |
| E21 | Targeting validation via platform APIs | 8 | 6 | 4 | **6.0** |
| E22 | ICP targeting block (blocks E20/E21) | 8 | 9 | 7 | **8.0** |
| E23 | Competitor enrichment + observations | 8 | 8 | 5 | **7.0** |
| E24 | Social publishing (LinkedIn + Meta, MDP-gated) | 8 | 5 | 3 | **5.3** |
| E25 | Grounded social composer | 8 | 8 | 6 | **7.3** |
| E26 | Social performance + audience analytics | 7 | 7 | 6 | **6.7** |
| E27 | **Platform approvals programme** (gates E14/E19/E21/E24) | 10 | 6 | 4 | **6.7** |
| E28 | Library as corpus | 7 | 8 | 7 | **7.3** |
| E29 | Integrations states + scopes | 7 | 9 | 8 | **8.0** |
| E10 | Continuous goal recommendation | 10 | 7 | 5 | **7.3** |

**Note on E6.** The full closed loop scores lowest — confidence 6 (does
performance data actually improve the next brief? unproven) and ease 4. It is the
most valuable and least certain thing here. E4 exists partly to raise its
confidence before we commit to it.

## 6. Roadmap — Now / Next / Later

*Reconciled after all 10 screen specs. The earlier version was written when there
were 10 epics; there are now 29. Now/Next/Later rather than dated quarters —
confidence beyond the first horizon is genuinely low, and E27 depends on third
parties who do not publish timelines.*

### NOW — trust, sight, and start the clock

**E27 · Platform approvals programme** — *begin immediately, runs in parallel with
everything.* Nine approvals across Google, Meta and LinkedIn. Paperwork that gates
engineering: E14, E19, E21 and E24 all stall without it, and MDP is the hardest
gate in the plan. **This is the single most schedule-sensitive item and none of it
is code.**

| Epic | ICE | Why now |
|---|---|---|
| **E1** Sequence re-approval signal | 9.3 | Days of work. Stops silent outreach halts. Pure trust. |
| **E4** Usage instrumentation | 8.3 | Cheap enabler; converts E6 from a guess into a decision |
| **E16** Reply inbox | 8.3 | `inbox-monitor` has fed this for months and nothing displays it |
| **E29** Integrations states + scopes | 8.0 | Prerequisite for every connector arriving later |
| **E22** ICP targeting block | 8.0 | Small; **blocks E20 and E21** |
| **E2** Goals + feasibility engine | 7.3 | The spine everything else ladders to |

### NEXT — the spine pays off

| Epic | ICE | Depends on |
|---|---|---|
| **E3** Goal-grounded generation | 8.0 | E2 |
| **E5** Goal cockpit | 7.3 | E2 *(E5a zones ship without it)* |
| **E17** Outreach warnings | 7.3 | contains E1 |
| **E15** Revenue picture | 7.3 | — |
| **E28** Library as corpus | 7.3 | E2 |
| **E10** Continuous goal recommendation | 7.3 | E2 |
| **E7** Scheduled detectors | 7.7 | — |
| **E12** Composite opportunity engine | 7.0 | E2, E23 |
| **E23** Competitor enrichment + observations | 7.0 | — |
| **E9** Tenancy: org + workspace | 7.0 | — |
| **E25** Grounded social composer | 7.3 | E2 |

### LATER — gated on approvals, or on evidence

| Epic | ICE | Gate |
|---|---|---|
| **E20** Deep copy + targeting | 6.7 | E22 |
| **E26** Social performance | 6.7 | — |
| **E14** Paid media ingestion | 6.3 | **E27** |
| **E13** AEO surface | 6.3 | — |
| **E21** Targeting validation | 6.0 | **E27**, E22 |
| **E19** Ad push to platforms | 6.0 | **E27** |
| **E18** Audience sync to ad platforms | 6.0 | E14 |
| **E8** Learning made legible | 6.0 | — |
| **E6** Closed loop | 6.3 | **E4 evidence**, E14, E19 — validate on ads first |
| **E11** Learned campaign shapes | 6.3 | **E9** |
| **E24** Social publishing | 5.3 | **E27 / MDP approval — outcome not in our control** |

### Three sequencing facts worth stating plainly

1. **E27 is the critical path and it is not engineering.** Four epics stall
   behind approvals with external lead times. Start before any of them.
2. **E22 costs little and unblocks a lot.** A dozen ICP fields gate two of the
   most expensive epics specced.
3. **E6 should be validated on ads, not content.** A blog takes months to rank; an
   ad reports in days at creative level. If the closed loop fails there, months
   are saved everywhere else.

## 7. Dependencies

```
E1 ─────────────────────────────────► independent, ship first
E2 ──► E3 ──► E6                       goals gate generation grounding, which gates the loop
E2 ──► E5
E4 ──► E6 (confidence gate)
E7 ──► E5 (change events feed the cockpit)
paid-media approvals ──(weeks)──► paid-media leg
```

## 8. Tacit assumptions this rests on

1. **Users can articulate an account goal.** ~~Biggest risk in the plan.~~
   *Mitigated by design:* E2 no longer asks for a goal on a blank field — it
   proposes one from the account's own funnel rates and shows the reachable range.
   The residual risk moves rather than disappears: it is now **cold-start
   accounts** (no history to derive rates from) and **false precision** (a
   confident number from thin data). Both are called out in E2 as things to design
   against, not assumptions to hope on.
2. **Goal-grounded briefs actually generate better assets.** Plausible, unproven.
   Worth an A/B before E6.
3. **The marketer is one generalist across all wings.** If they're specialists,
   "orchestrator" means routing and handoffs — a different product.
4. **Sequences are actually running in production.**
5. **"Real data flows" = connected sources, AI interpreting** — not AI estimating
   what the data would say.

## 9. Deliberately not on this roadmap

- **Demoting generation.** Corrected — see the note at the top.
- **More generation *surface*.** The count of things Kepler can generate isn't the
  constraint; the intelligence behind each one is.
- **A notification system.** Deferred, and premature before E5 proves what's worth
  being notified about.
- **Any new container/layout system.** v4 (`docs/UX-SYSTEM.md`) is sufficient;
  more would be negentropy theatre.


---

# Part II — Screen specifications

Settled screen by screen. Each records what is on the screen, what the user does,
what the data model needs, and what it changes in Part I.

**Status:** 10 of 10 settled — all screens specified.

---

## S1 · Goals *(new screen)* — **settled**

**Nav:** top of Main, above Campaigns.

**Mental model: goal = epic, campaign = the work under it.** Borrowed deliberately
from issue trackers because the user already owns it (Apple's familiarity
principle — build on what people know, and honour its physics).

### The object

Two kinds, per §0 — structure is universal, math is conditional.

| | **Measured goal** | **Directional goal** |
|---|---|---|
| Bound to | A funnel measure Kepler can read | Nothing — free text |
| Example | "1,200 conversions by 31 Mar" | "Own the NAAC conversation" |
| Gets | Baseline, forecast, progress, feasibility, continuous recommendations | Checkpoints the user defines and marks off |
| Campaigns ladder to it | Yes | **Yes** |
| Appears in the cockpit | With a number | With its checkpoints |

Both organise real work; only measured goals get math, **and the UI says which is
which**. Upgrade path: attach a measure later and a directional goal becomes
measured, keeping its history and campaigns.

Measures available from existing data: sessions, conversions, CRM records,
meetings, revenue (`campaign_metrics`), AI share of voice (`visibility_scans`).

### Structural rules

- **A goal has a fixed end date.** Not a rolling horizon — goals resolve.
- **Under one month is advisory, not blocked.** Kepler says *"a month is
  campaign-shaped: goals want several campaigns and enough cycles for a forecast
  to mean anything — create a campaign instead?"* and lets you proceed. Per §0.
- **One parent, many links.** A campaign ladders to exactly one goal so rollup
  math is unambiguous, but can be *linked* to others. A launch serving traffic and
  pipeline gets one parent and one link, rather than being forced into a lie.
  *(Resolves the question parked at S1 draft.)*
- **Campaigns are created under a goal.** A goal with no campaigns is the empty
  state, and its primary action is "add the work".

### Zones

**Canvas**
- Title, description
- **Campaigns** — progress rolled up across them. Per row: name, channel chips,
  steps done, status, and *contribution to the goal*. Actions: **+ New campaign**
  (pre-parented) and **Recommend campaigns**.
- **Linked** — cross-links to other goals or campaigns
- **Activity** — what happened, and **who did it**

**Right rail — live math, not metadata.** This is the departure from the issue
tracker, whose rail is inert. Kepler's most valuable real estate carries:
status · measure · target · **progress** (large) · **forecast** at current pace ·
**gap in real units** · start and fixed end date · the feasibility basis it was
set against. Metadata drops below.

### Continuous recommendation *(decided)*

Kepler re-reads the gap as data accrues and keeps proposing the portfolio that
would close it — *"2,400 sessions short with 6 weeks left; this campaign
plausibly delivers ~1,500 at your current conversion rates."*

This is the return-driver: **the goal actively asks for work.** It requires the
feasibility engine to run on a schedule rather than only at creation — reuse the
existing `pg_cron → pg_net → edge` transport from migration 023.

### Attribution *(decided — see E9)*

Show who is doing what, on the substrate that already exists. No new permission
model: `workspace_members.role` and 66 RLS policies have been enforcing this
since migration 001.

### Data model

```sql
goals               -- workspace_id, name, kind('measured'|'directional'),
                    -- measure NULL-able, target NUMERIC NULL-able,
                    -- baseline JSONB, feasibility_basis JSONB,
                    -- start_date DATE, end_date DATE NOT NULL,
                    -- is_primary BOOL, status, created_by, created_at
goal_checkpoints    -- goal_id, label, done_at, done_by
goal_target_history -- goal_id, target, changed_at, changed_by
goal_links          -- goal_id, linked_type('goal'|'campaign'), linked_id, relation
campaigns           -- + goal_id UUID NULL REFERENCES goals   (the one parent)
```

`campaign_metrics` unchanged — progress is derived, never entered.

### Changes to Part I

- E2 absorbs the two-kind model, checkpoints, target history and links.
  Ease 5 → 4 (ICE **7.3**).
- **Continuous recommendation is promoted out of E2** into its own epic — it is
  the return-driver, not a sub-feature. See E10.
- **New E9 · Surface the workspace.** Invite flow, members screen, and populate
  `workspace_events.actor_id` — a column designed into migration 027 that the
  production writer omits and the reader ignores (only the demo dataset sets it).
  The RBAC substrate is complete; nothing enforces-new is needed.
  I 7 · C 9 · E 7 → **ICE 7.7**
- **New E10 · Continuous goal recommendation.** Scheduled feasibility re-read +
  campaign portfolio proposals against the live gap.
  I 10 · C 7 · E 5 → **ICE 7.3**

---

## S2 · Home / cockpit — **settled**

**Replaces** the current Dashboard. This screen *is* epic E5.

### The admission filter

> **Every card answers one of three questions: what changed since I last looked,
> what needs me now, or what should I do next.**
> A card that only reports current state does not belong.

This is what keeps the cockpit from drifting back into a tile grid. The reference
dashboards we looked at all fail it — they report, and reporting does not create
return.

### Zones, in priority order

**1 · Primary goal — the hero.** Dominant, above the fold.
Name and measure · **progress** against target (large) · **forecast** at current
pace with an on-track / at-risk / off-pace verdict · **the gap in real units**
("2,400 sessions short") · days remaining.

Plus **what moved**: "+340 this week — ranking gains on 3 terms contributed."
*This is where the E7 detectors surface.* Movement is shown in service of the
goal rather than as a separate feed — a generic activity stream of things you
cannot act on is filler, but the same signal attached to a target is direction.

**2 · Needs you — the demand queue.** Grouped, counted, every row actionable:
replies waiting · **sequences awaiting re-approval** (where E1's silent-stop fix
surfaces) · overdue campaign steps · unverified sending domains · drafts never
reviewed · proposed brand learnings. Sorted by urgency.
Empty is a real state, and it hands off: *"nothing needs you — here's what would
move the goal."*
**No new schema.** Every one of these states exists today.

**3 · Recommended next work.** E10's continuous recommendation, surfaced here:
the campaign or asset that would close the gap, with its plausible contribution
("~1,500 sessions at your current conversion rates") **and its working shown** —
per the false-precision guard, a confident number from thin data is worse than no
number.

**4 · Funnel snapshot.** Sessions → conversions → CRM records → meetings →
revenue. Each with a **sparkline, not a bare number** — a number alone is state,
a number with a trend passes the filter. Buildable today.

**5 · Channel contribution — drillable.** Which wing is delivering against the
goal. Until the paid-media leg lands this is structurally incomplete and must
**say so** rather than showing a chart that silently omits spend.

**One compound dimension** *(decided — revised after reviewing Dreamdata)*.
"Channel" is genuinely two axes, and the earlier decision was a toggle between
them. Dreamdata solves the same problem with a **compound key**
(`Paid--Google`, `Organic Search--Google`), which is better: there is only ever
one number, so "which one is right?" never arises.

Kepler's key is `production—source`:

`SEO—Organic` · `SEO—Direct` · `Outreach—Email` · `Social—LinkedIn` ·
`Paid—Google` · `Other—Organic` · `Other—Direct`

- **production** = what Kepler made. Known perfectly.
- **source** = where the outcome came from (GA4). Reported.

Richer than Dreamdata's, whose *both* halves are reported data.

**This collapses three problems into one dimension.** Work Kepler did not produce
appears as `Other—…` rows, so the whole pie, the honest cut line and both axes
live in the same table rather than needing a toggle plus a separate coverage
figure. The unattributed remainder stops being a footnote and becomes a row.

**Contribution only — no cross-channel efficiency** *(decided)*. Paid shows its
own CPA and ROAS where the data is real; Kepler never compares cost-per-outcome
across channels, because nothing assigns a production cost to organic and a
fabricated one would make paid look expensive against "free" content.
*Correction to an earlier claim in this document: "your Meta CPA is 3× your SEO
CPA" is not something Kepler can honestly say. Cross-channel **contribution**
comparison works; cross-channel **efficiency** comparison does not.*

### Drill path

**L0** channel contribution (this card) → **L1** channel detail → **L2** campaign
→ **L3** asset.

**L2 and L3 already exist** — campaign detail and asset views are built. The only
new surface is **L1, a channel view, which lives in Measurement** rather than
becoming a nav item. This gives Measurement its job in the new model: the cockpit
summarises, Measurement is where you drill.

Each channel is **channel-shaped, not a generic table** — SEO has positions and
impressions, paid has spend and CPC, outreach has sends and replies. They share
one spine: contribution to the goal measure. A one-size table would be useless.

**Drilling preserves goal context.** Clicking a channel from the goal hero lands
in Measurement filtered to *that goal*, not a global view — otherwise the thread
breaks at the first level.

**6 · Other goals.** A quiet strip of compact verdicts, so secondary goals stay
visible without competing with the hero.

### Cold start

None of the reference dashboards show this, and it is the state every new
workspace opens in. No goal → the cockpit becomes the goal-setting path, not an
empty grid. No connected data → the funnel shows what connecting each source
would unlock. The cockpit degrades into onboarding rather than into blankness.

### Deliberately excluded

- **Generic activity feed** — "things happened" you cannot act on. Its actionable
  half is already in *Needs you*; its notable half now lands on the goal hero.
- **Leaderboard** — gamifying a three-person team is noise.
- **Storage / upgrade prompts** — that card serves the vendor's goal, not the
  user's.

### Changes to Part I

- **E5 is now fully specified by this section.** Two of its six zones (*Needs
  you*, *Funnel snapshot*) need no new schema and could ship before E2 —
  worth splitting E5 into E5a (no-dependency zones) and E5b (goal-dependent
  zones) if we want cockpit value early.
- **E7 gains its surface.** Detector output lands on the goal hero as "what
  moved". Without this the scheduled detectors would have emitted change events
  with nowhere to display.
- **Channel contribution creates a dependency on the paid-media leg** for
  completeness, and an honesty requirement until then.
- **S5 · Measurement gains a defined job**: host L1 channel detail, goal-filtered.
  Spec it there.

---

## S3 · Campaigns — **settled**

The ladder between goal and asset. A campaign is already a set of dated, moduled
steps, which is why it takes to multiple views naturally.

### Structure *(decided)*

**One screen + a view switcher**, not a multi-screen module. List / board / table
are the same data in different clothes and belong behind a switcher; Kepler's
sidebar children are reserved for genuinely different jobs (ABM vs Sequences vs
Lists), and splitting views across nav would break that rule.

Two things *are* different jobs:

- **Campaigns / Calendar** — a **new sidebar child**. "What's shipping this month
  across everything" is a scheduling question, not a campaign question. A
  per-campaign calendar exists today but is buried inside one campaign's detail,
  so the orchestrator's actual question cannot currently be asked.
- **Goal-horizon timeline** — campaigns laid across a goal's dates, showing
  sequencing, overlap and gaps. **Lives on the goal detail screen (S1)**, not
  here, because that's where the question arises. Costs no new screen.

Net nav change: **one item**.

### Ways in *(decided)*

The centre of gravity moves: once campaigns are created under goals, the
Campaigns nav item becomes a **browse surface** rather than the primary creation
path. It still earns its place — you need to find campaigns without going through
a goal.

Built:
- **Accept a recommended campaign** (E10) — pre-parented and pre-briefed against
  the goal's live gap. The path that makes the goal actively ask for work.
- **Jump from an overdue step** in the cockpit's *Needs you* — links to the
  specific late step, not just the campaign, so the queue can actually be cleared.
- **Attach generated work from inside a module** — reverses today's
  campaign→module flow so assets stop being born orphaned.

Retained from today: strategist chat, quick form, plan-around-an-event.

**Not built:** bulk adoption of orphan assets from Library. *Known consequence:*
every asset generated to date stays goal-less. Revisit if the back-catalogue
turns out to matter.

### Campaign shapes — static scaffolding, then learned *(decided)*

The five existing `CAMPAIGN_TYPES` (Launch, Lead generation, Awareness,
Fundraise, Retention) survive as **cold-start scaffolding only** — an account with
no history needs something to start from.

Over them sit **learned shapes**: campaign structures derived from what actually
produced outcomes, continuously adapting rather than hand-maintained. Static
presets decay and quietly become the ceiling on what people attempt; learned
shapes get better the more the product is used.

**Scope: org-level, opt-in per workspace** *(decided)*. See E11.

Every suggestion **cites its provenance** — "this shape worked in KenLearn" —
because an unattributed recommendation is unauditable, and this one crosses a
workspace boundary.

### Orphan campaigns

Every campaign that exists today has `goal_id = NULL`. They need a visible home
(an "Unassigned" filter) and a nudge to ladder them, not a silent gap.

### Data model

```sql
campaigns        -- + goal_id (from S1)
campaign_shapes  -- org_id, derived_from JSONB, structure JSONB,
                 -- outcome_stats JSONB, updated_at
```

### Changes to Part I

- **E9 expands and is rescored.** It was "surface the workspace"; it is now the
  **tenancy foundation** — Organisation above Workspace, invites, members,
  `actor_id`, and the per-workspace sharing consent. It touches the trust model of
  all 28 workspace-scoped tables. Decided: **build early, alongside the member
  surfacing**, so tenancy is disrupted once rather than twice.
  I 9 · C 8 · E 4 → **ICE 7.0** (was 7.7)
- **New E11 · Learned campaign shapes.** Shapes derived from outcomes, shared
  org-wide with per-workspace opt-in, every suggestion citing provenance.
  **Blocked on E9.** This is the compounding moat — the one thing a competitor
  cannot copy by shipping the same features, because it requires accumulated
  outcomes rather than code.
  I 10 · C 6 · E 3 → **ICE 6.3**

### Trust boundary — non-negotiable

"Same team" covers two situations Kepler cannot distinguish from data: a
multi-brand company (sharing is obviously fine) and an agency running client
workspaces (sharing is a confidentiality breach, possibly contractual). It must
therefore be **declared, never inferred**, and **opt-in, never default** — the
breach would happen before anyone found the toggle.

Retrofitting consent onto a learning system is far harder than designing it in,
which is why the org model is specified before any shape is learned.

---

## S4 · SEO & AEO — **settled**

The exemplar for goal-grounded generation. Whatever is settled here applies to
Social and Ad Creative.

### Competitive position *(researched Aug 2026)*

Four groups, not one category:

| Group | Players | Note |
|---|---|---|
| Pure AEO monitors | Profound, Peec, Otterly, Scrunch, AthenaHQ, Brandlight, SE Visible | Profound raised **$96M Series C at ~$1B, Feb 2026**, 700+ enterprise customers |
| Incumbent bundlers | **HubSpot AEO**, Surfer AI Tracker | HubSpot: 25 prompts free, then **$50/mo** |
| Workflow + generation + AEO | **AirOps**, Goodie | Already attacking the monitor→act gap |
| Classic SEO content | Surfer, Ahrefs, Semrush, Scalenut | SERP-based optimisation |

*Caveat: much of the public comparison content is vendor-authored. Weighted
funding, pricing and feature specifics over rankings.*

**Two conclusions:**

1. **AEO monitoring is a $50–100/mo commodity** with a $1B-funded leader and a
   free incumbent tier. Kepler must not position or price on monitoring depth.
2. **"Closing the monitor→act loop" is no longer an available differentiator.**
   AirOps publishes to CMS from visibility data via Grids/Page360; Goodie ships an
   agentic layer pushing schema and copy fixes. Claiming it means arriving late to
   a fight two better-funded companies are already having.

**What survives as defensible:** this is the only place where SEO work is scored
against a **company goal** alongside **every other channel**. Nobody in the
category has a goal object with feasibility math above the content layer, and all
of them are single-channel.

### AEO strategy — own the objects, ingest the volume *(decided)*

**Correction to an earlier draft of this section.** It said "don't compete on
depth" and treated AEO as a signal feeding opportunities. That collapsed two
different things:

- **Breadth of objects** — prompts, citations, pages — is **table stakes, not
  depth**. Without prompt-level rows, "share of voice 12%" is an unauditable
  number. Without citations you cannot answer *who got cited instead of me*,
  which is the most actionable fact in the category (Semrush surfaces
  `reddit.com — 201` as a cited source; that tells you where to go be present).
- **Volume within objects** — 500 prompts vs 50, engine count, sentiment,
  regional splits — is where we do not compete, and where ingestion covers us.

So: **own the objects shallowly, ingest the volume.** Native scanning stays
goal-sufficient; external providers (Profound, Peec, …) connect like GA4 or GSC
and their depth lands in the same surface.

**Data model:** `visibility_scans` gains `provider` (`native` | `profound` |
`peec` | …), mirroring `campaign_metrics`. Prompts and citations become
first-class rows rather than aggregate numbers.

**Prompt set — dual source, user-owned** *(decided)*:
1. **Generated** from brand + ICP + active goal — the conversational shape.
2. **Derived** from real Search Console queries, rewritten conversationally
   ("nirf 2026 parameters" → "how do NIRF weights work now?").
3. **User-edited** freely, per §0.

Derived prompts **show the source query they came from**, because the rewrite
will sometimes misfire and a silently-wrong tracked prompt is worse than none.
This dual source is itself a connected-only advantage: standalone AEO tools ask
you to type prompts or offer generic ones — none can seed from your actual
search demand.

**Explicitly out of scope:** backlinks and authority scores. That needs a link
index and is pure spend against Ahrefs and Semrush with no goal linkage.

**Known gaps, not yet specced:** query fanout (one prompt expanding into many
real queries) and position history with new/lost keywords — we pull GSC rows but
retain no history.

### Screen structure — a multi-child module *(decided)*

Three children, each a genuinely different job, with the **goal obligation bar
constant across all of them** — the obligation doesn't change when you switch
lens, only the lens does.

**SEO & AEO / Pipeline** — *default*. The kanban: queue → generating →
completed. Retained deliberately; it is the right shape for work in flight. Each
card carries its goal, campaign and projected contribution.

**SEO & AEO / Opportunities** — E12's composite ranked list, every row showing
its reasoning:

- **goal urgency** — which measure is short, by how much
- **campaign alignment** — briefed but not yet made
- **competitor movement** — competitor pages and new citations
- **AEO gaps** — prompts where competitors are cited and we are not *(computed
  today in `visibility_scans`, currently unused for ranking)*
- **search signals** — striking distance, low CTR, cannibalisation, decay
- **mention threads** — community questions worth answering

**SEO & AEO / AI Visibility** — prompts as rows (mention rate, citation rate, per
engine), expanding to the citations behind them. Provider-agnostic, so native and
ingested data sit in one surface.

**Pages is deliberately NOT a fourth child.** Live-URL performance is the SEO
channel's drill-down and lives in Measurement (S5, L1→L2). Duplicating the table
here would guarantee the two drift apart.

**Rail:** Search Console, Page teardown, Mention finder, Technical SEO, AEO
sources.

### Changes to Part I

- **E3 · Goal-grounded generation is specified by this screen.** The generation
  context carries goal + campaign + prior assets + live search/AEO signals.
- **New E12 · Composite opportunity engine.** Broaden ranking beyond GSC to goal,
  campaign, competitor and AEO inputs, with reasoning exposed. This is the
  module's defensibility.
  I 9 · C 7 · E 5 → **ICE 7.0**
- **New E13 · AEO surface.** Prompts and citations as first-class objects,
  dual-source prompt derivation, `visibility_scans.provider`, and connector
  adapters for external AEO tools. Expanded from "provider ingestion" once it
  became clear the objects are table stakes rather than depth.
  I 8 · C 7 · E 4 → **ICE 6.3**
- **E7 gains the native scanner** on a schedule (currently manual-only).

---

## S5 · Measurement + paid media — **settled**

### Competitive position *(researched Aug 2026)*

| Group | Players | Price | Doing |
|---|---|---|---|
| Data pipelines | Supermetrics (150+ sources, native Claude connector), Funnel.io (400+, $200/mo), Improvado (1000+, enterprise) | $44–799/mo | Move ad data to warehouses |
| B2B attribution | Dreamdata ($599/mo, CRM-rooted), Factors.ai ($399/mo) | | Tie touches to pipeline/revenue |
| Free baseline | GA4 | £0 | Last-click, channel groupings |

**Kepler has 12 connectors. Funnel has 400, Improvado 1,000.** Connector count is
an unwinnable race; we do not enter it.

**Two findings that shaped the posture:**

1. **Attribution's credibility problem is openly admitted by the category.**
   70–80% of the B2B journey happens in dark funnel/dark social no click-tracker
   sees. Last-touch holds 67% adoption *despite being known-ineffective*;
   multi-touch reached only 47%. The industry's answer is "method stacking"
   (MTA + MMM + incrementality), not better MTA.
2. **HockeyStack left B2B attribution in April 2026** to sell "Revenue Agents",
   after being the premium player at $1,399/mo. When the best-funded specialist
   exits, building an attribution engine as a side-quest is not the move.

### Posture: the whole pie, with an honest cut line *(decided)*

Kepler does **not** model credit. It shows **totals from the CRM** — pipeline and
closed-won — and draws one honest line through them:

- **traceable to Kepler campaigns** (via UTM/campaign linkage)
- **everything else** (shown, never claimed)

This is arithmetic, not modelling, and it is *more* honest than the attribution
platforms, which would model credit across the whole thing. It also extends a
pattern already in the product: Measurement's existing unattributed line
("3,717 sessions not attributed to a KEPLER campaign") promoted from footnote to
primary view and extended to revenue.

**Why the totals matter, not just our slice:** an orchestrator who must leave for
the CRM to see total pipeline is not an orchestrator. Showing the whole picture
is a retention requirement, and showing it honestly is what keeps it defensible.

**Language discipline — non-negotiable.** "**Traceable to**", never "driven by",
"attributed to" or "influenced". One word turns an honest split into a false
claim, and every goal forecast downstream inherits it.

**Where we get close to Dreamdata:** CRM connectors and closed-won revenue
already exist, and `campaign_metrics` already carries the funnel to revenue.
Campaign → revenue *for campaigns Kepler ran* is most of Dreamdata's core value,
scoped to what we can actually stand behind.

**Not built:** multi-touch models, identity resolution, dark-funnel inference.

### Paid media leg *(decided — ad-set and creative depth)*

Google Ads + Meta Ads, ingested at **campaign → ad set → creative**, UTM-matched
to Kepler campaigns exactly as GA4 already is.

Campaign level alone would have been cheaper, but creative-level data is **the
only way generated ads ever learn** — without it, Ad Creative's assets can never
feed the closed loop (E6), and the module stays as stateless as SEO was.

*Accepted costs:* materially higher API volume, rate-limit handling, and storage.
Design for incremental sync from the outset rather than full refreshes.

*Lead time:* Google Ads developer token approval and Meta Marketing API review
are calendar weeks. **Start the applications before the build.**

### Layout patterns adopted from Dreamdata *(Aug 2026 references)*

**Paid channel view — funnel-ordered stat rows.** Dreamdata's paid screen stacks
four rows in funnel order, and it maps directly onto our channel-shaped view:

1. `Cost · Impressions · Clicks`
2. `Visitors · Contacts · Companies`
3. `Prospects · Value`
4. `CPM · CTR · CPC · CPA · ROAS`

Row 4 is **paid-internal efficiency** — permitted, because it stays inside one
channel. It is never compared across channels (see S2).

**Pages view** — filter bar with Group By / Secondary Group By / Metric-on-graphs,
a two-tier stat row, and stacked bars over time by URL.

**Whole-pie composition** (from the Wizzco reference) — one total with its named
constituents beside it, which is the visual for CRM totals split by the cut line.

**State the method inline.** Dreamdata writes its methodology into a sentence at
the top: *"measure the prospects that reached SQL using the First Touch
Non-Direct attribution model."* We run no models, but the pattern is the right
one for honesty: *"showing outcomes traceable to Kepler campaigns via UTM —
78% coverage."* Methodology in the open, not in a footnote.

**Vocabulary divergence, deliberate.** The category standard is "**Influenced**"
(Influenced Leads, Influenced Value). We use "**traceable to**", because
*influenced* implies causation nobody in this category can prove. More honest,
but users arriving from Dreamdata will scan for "influenced" and not find it.

### Structure — three children *(decided)*

- **Measurement / Overview** — goal-centric cross-channel contribution, the
  dual-lens toggle from S2 (*By our work* / *By source*) with its coverage figure,
  and the whole-pie revenue view.
- **Measurement / Channels** — the L1 drill from S2. **Channel-shaped, not a
  generic table**: SEO has positions and impressions, paid has spend and CPC,
  outreach has sends and replies. One shared spine — contribution to the goal.
  Drilling preserves goal context.
- **Measurement / Pages** — live-URL performance, moved here from SEO & AEO so
  the table exists once.

**AI Visibility moves out** to SEO & AEO (S4), following the pattern *modules are
where you work, Measurement is where you see contribution*. Measurement retains
AI share-of-voice only as a **measure a goal can be set against**.
Net nav change: zero — Measurement loses a child, SEO & AEO gains one.

### Changes to Part I

- **New E14 · Paid media ingestion.** Google Ads + Meta Ads at campaign/ad-set/
  creative, UTM-matched, incremental sync. Unblocks the cross-channel picture and
  the Ad Creative closed loop. Gated on external platform approvals.
  I 9 · C 7 · E 3 → **ICE 6.3**
- **New E15 · Revenue picture.** CRM totals with the traceable/other cut line,
  extended from the existing unattributed pattern.
  I 8 · C 8 · E 6 → **ICE 7.3**
- **E6 (closed loop) gains its ads path** — creative-level data is its
  precondition for the Ad Creative module.

---

## Visual reference library

Collected during specification, **for the redesign phase** — these informed
structural decisions, not visual ones. Layout, hierarchy and treatment are
deliberately deferred; this roadmap settles *what is on each screen and why*.

| Screen | References | What each contributed |
|---|---|---|
| **S1 · Goals** | Jira issue detail | Epic→subtask hierarchy with progress rollup; right-hand details rail; **linked work items** (which resolved the one-parent-many-links rule); inline subtask creation |
| **S2 · Cockpit** | Taskk, Siphron, Spark Pixel dashboards | KPI row → chart → actionable table; **sparklines inside stat cards** (adopted — a number with a trend passes the filter, a bare number doesn't); *Recommended Task* and *Get AI insight* patterns. Rejected: leaderboards, storage/upgrade prompts |
| **S3 · Campaigns** | Acme kanban, trading Journal, Synapse My Tasks | **Same work seen several ways** — Board / Timeline / Table / Calendar / Gantt switchers; grouped-by-day list; card vs list toggle. Drove the view-switcher-not-nav-children decision |
| **S4 · SEO & AEO** | AirOps Prompts, Semrush SEO Dashboard ×2, Semrush Domain Overview | **Prompts / Citations / Pages as first-class objects** (the correction that AEO objects are table stakes, not depth); query fanout; mention rate vs citation rate; AI Search panel beside organic; position tracking with new/lost; **top cited sources** (`reddit.com — 201`) |
| **S5 · Measurement** | Dreamdata (Events, Pages, Paid Performance), Wizzco wealth dashboard | **Channel+Source as a compound dimension** — replaced the dual-lens toggle; funnel-ordered stat rows for paid; Pages filter/Group-By/Metric pivot; **methodology stated inline in a sentence**; whole-total-with-constituents composition (Wizzco). Also confirmed "Influenced" as category vocabulary we deliberately diverge from |
| **S6 · Outreach** | Gong Deals, Clay Audiences + ABM sync, Apollo contact detail, Claygent | **Gong warnings** — named conditions with evidence + suggested action, count badges on rows; **Clay audiences** — criteria builder, enrichment, many destinations, per-platform match rates; Apollo record tabs (Activities/Sequences/Conversations) with Add-to-list / Add-to-sequence as primaries; Claygent as the enrichment-agent UI pattern |
| **S7 · Social Media** | none — specced from competitive research | Scheduling commoditised at $6–199/mo; publishing gates researched directly |
| **S8 · Ad Creative** | none yet — specced from competitive research | — |
| **S9 · Brand Intelligence** | none yet | — |
| **S10 · Library / Integrations / Settings** | none — convention-driven, deliberately | Follow Linear/Notion/Figma/Slack settings conventions exactly; innovation here is a usability tax |

**Gaps to fill before redesign:** Outreach and the S7 group have no visual
reference. Measurement's references arrived and materially changed a decision —
the dual-lens toggle became a compound dimension — which is the clearest
evidence that reviewing references before settling a screen is worth the delay.

**Known visual gaps flagged during specification, unaddressed:** query fanout
(no concept in Kepler), position history with new/lost keywords (GSC rows are
pulled and not retained), authority/backlinks (deliberately out of scope).

---

## S6 · Outreach — **settled**

### Competitive position *(researched Aug 2026)*

| Job | Players | Price |
|---|---|---|
| Cold email at volume | Instantly, Smartlead | ~$37–97/mo **flat**, unlimited inboxes |
| Mid-market sequencing | lemlist | $59–109/seat |
| Enterprise engagement | Outreach.io, Salesloft | $125–200+/**user**/mo |
| Data orchestration | Clay | $185+/mo, credit-based |
| Conversation intelligence | Gong | enterprise |

**Two structural facts:**

1. These are **engagement layers that expect a CRM underneath**. None owns the
   customer record — and neither does Kepler, which already connects to Zoho,
   HubSpot and Salesforce.
2. **Deliverability is a hard gate.** Google/Yahoo's 2024 bulk-sender rules
   favour dedicated tools with inbox rotation and warmup infrastructure.

### Deliverability position — stated explicitly *(decided)*

`send_path` already supports `crm_zoho | crm_hubspot | gmail | cold_domain`,
meaning Kepler mostly sends through **the customer's own infrastructure**. That
is the correct posture and is now an explicit product decision rather than an
implementation detail: **Kepler does not compete on inbox warmup, rotation or
deliverability infrastructure.** Instantly at ~$97/mo flat with unlimited
inboxes wins that job; building toward it is a losing spend.

**What we compete on:** outreach as **one wing of a goal**, sharing audiences,
research and measurement with every other channel.

### Structure — four children *(decided, down from five)*

- **Outreach / Replies** — **new.** The highest-value recurring event in the
  product. `inbox-monitor` has been detecting replies, OOOs and bounces every 10
  minutes and writing `outreach.reply` events; **nothing has ever surfaced them.**
- **Outreach / Sequences** — builder + send engine, now carrying health warnings.
- **Outreach / Audiences** — **Lists and Saved merge here.** Clay-style: criteria,
  enrichment, and many destinations. *Prospecting folds in* as the way you fill
  an audience rather than a sibling screen.
- **Outreach / Research** — ABM account investigation. Kept separate because
  conversational account research is a genuinely different activity from list
  building and would be cramped inside Audiences.

*Migration:* existing `prospect_lists` and the Saved segments consolidate into
Audiences; no data is lost, but the nav changes under existing users.

### Warnings — Gong's pattern, on the thing they describe *(decided)*

Named conditions with **the evidence behind them and a suggested action**, shown
as count badges on rows and rolled up into the cockpit's *Needs you* queue.

| Condition | Signal (all exist today) |
|---|---|
| Sequence needs re-approval | `sequences.status` demoted by the edit trigger — **E1's silent stop finally surfaces** |
| Reply waiting | `enrollments.status = 'stopped_reply'` |
| Prospect ghosting | no reply after N touches |
| Bounce rate climbing | `messages.status = 'bounced'` |
| Sending domain unverified | `sending_domains.status = 'pending'` |
| Enrollment paused | `enrollments.status = 'paused'` |

Deliberately **not** a separate health screen — that repeats the criticism the
AEO research levelled at dashboards nobody opens. Warnings live on the object
they describe.

### Audiences — one audience, many destinations *(decided)*

An audience built in Kepler drives a **sequence**, an **ad-platform match**, and
a **campaign**. Clay's reference shows match rates per platform (LinkedIn 95%,
Meta 64.8%, Google Ads 88.3%) — that reporting comes with it.

This is the orchestrator claim made concrete: **no single-wing tool can send the
same audience to outreach and paid targeting**, because none of them runs both.
Depends on E14's paid connections.

### Changes to Part I

- **New E16 · Reply inbox.** Surface what `inbox-monitor` already writes, with
  enrollment and sequence context. Data exists; this is wiring plus a screen.
  I 9 · C 9 · E 7 → **ICE 8.3**
- **New E17 · Outreach warnings.** Gong-style conditions on sequences and
  prospects, rolled into the cockpit. Contains E1 as its first condition.
  I 8 · C 8 · E 6 → **ICE 7.3**
- **New E18 · Audience sync to ad platforms.** Match-rate reporting per platform.
  Blocked on E14.
  I 8 · C 6 · E 4 → **ICE 6.0**

---

## S8 · Ad Creative — **settled**

*Taken before Social Media because it is the validation vehicle for E6, the
lowest-confidence epic on the board.*

### Competitive position *(researched Aug 2026)*

The category shifted under everyone:

> Meta Advantage+ and Google Performance Max moved **targeting and bidding inside
> the platform**. The operator job became feeding the machine good inputs — fresh
> creative, clean feed, accurate conversion data — and it spends the budget.

| Player | Position |
|---|---|
| **AdCreative.ai** | High-volume static/video + performance scoring **trained on billions in ad spend** |
| **Pencil** | Enterprise creative OS: generation, editor, scoring, brand-guideline enforcement |
| **Creatopy → "The Brief"** | Agent-based full campaign lifecycle, **direct ad serving to 25+ networks** |
| **Meta / Google native** | Free, built in, now generating creative themselves (AI backgrounds, dubbing, persona images) |

**Kepler generates no visual creative at all.** `adGenerationService` emits angle,
headline, primaryText, CTA, description, rationale plus LinkedIn adjacent
targeting. It is a **copy and targeting strategist**, not a creative studio — the
module name oversells what is behind it. *(Renaming is open.)*

**Where we can hold our own:** AdCreative.ai scores creative against billions in
industry spend, which Kepler can never match. Once E14 lands, Kepler scores
against **your own** creative history — *"your risk-reversal ads averaged 2.3× the
CTR of feature-led ones for this ICP."* Narrower, but account-specific in a way
industry benchmarks are not.

### Scope: copy and targeting, gone deep *(decided)*

No visual generation for now — pixel production is what Meta and Canva have
commoditised. Instead, go deep on the two things left to a human: **what to say**
and **who to say it to**.

### Two seams, one architecture

Both halves of this module split the same way, and both splits are required now
so that later additions don't force a rewrite:

| | Platform-agnostic spec | Per-platform rendition |
|---|---|---|
| **Copy** | angle, hook, proof, offer, CTA | asset counts, char limits, formats |
| **Audience** | buying committee, firmographics, exclusion logic | LinkedIn / Meta / Google vocabulary |

Today both are fused — `omit primaryText for google` sits inside the copy
generator, and targeting exists only as LinkedIn output. Split now and a visual
rendition, or a fourth ad platform, is a new renderer rather than a rewrite.

### The platform reality that shapes targeting

**LinkedIn is the outlier where precise targeting still works.** Meta moved
delivery into Advantage+ *audience signals*; Google PMax takes *signals* too.
Advice that says "target these interests" on Meta in 2026 is advice for a system
Meta has largely retired.

**Decided: signals where signals are taken, plus a manual fallback** — plenty of
accounts still run manual campaigns, so both paradigms are produced, with the
platform's current default led.

### Targeting output contracts

**Decided: platform-ready values, validated against live platform APIs**, so a
buyer copies them straight into Campaign Manager or Ads Manager, and each value
is verified as actually selectable with an audience-size estimate attached.

**LinkedIn** *(extends what exists — `adjacentTitles` / `jobFunctions` /
`exclusions` / `recommendedCombination` are already good)*:
```
committee[]        { title, seniority (LinkedIn's 7-value enum), why,
                     validated, linkedInFacetId }
jobFunctions[]     { name, id }
companyAttributes  { sizes[], industries[], geographies[] }
exclusions[]       { title, why }
recommendedCombination
reachEstimate      { min, max, capturedAt }
```

**Meta** — two modes:
```
mode               'advantage' | 'manual'
audienceSignals[]  { type: interest|behaviour|demographic, name, id, why }
seedAudiences[]    { keplerAudienceId, purpose: custom|lookalike, lookalikePct }
detailedTargeting[]  (manual mode only)
exclusions[]
reachEstimate
```

**Google** — shape depends on campaign type:
```
campaignType       'search' | 'pmax' | 'demandgen'
keywordThemes[]    { theme, matchType, why }        (search)
negativeKeywords[]                                   (search)
audienceSignals[]  { type: inMarket|customSegment|customerMatch,
                     name, id, seedTerms[], why }    (pmax / demandgen)
exclusions[]
reachEstimate
```

*Reach estimates carry `capturedAt` and refresh on demand — they go stale, and a
stale number presented as live is the false-precision failure again.*

### Screens — two children *(decided)*

**The ad platforms separate audience from creative** — Meta's ad set holds the
audience, the ad holds the creative. Mirroring that is domain-correct, and it
lets one audience spec serve several creative sets, which is how media buyers
work.

**Ad Creative / Build**
1. **Goal obligation bar** — module frame, as in S4
2. **Brief** — campaign, goal link, ICP, platforms, placements, budget tier,
   generation mode (batch or matrix)
3. **Variants** — cards carrying the message parts (angle · hook · proof · CTA),
   per-platform renditions with live character counts and policy validation,
   **inline performance** once ads are live (spend, impressions, CTR,
   conversions), and push status
4. **Push** — draft state per platform, deep link to the platform
*Rail:* competitor ad intelligence (Meta Ad Library, built), saved campaigns

**Ad Creative / Audience**
1. **Goal obligation bar**
2. **Buying committee map** — platform-agnostic: primary role plus adjacent
   roles, each with seniority and rationale, derived from the ICP's role, titles,
   segment, geography, pains and triggers
3. **Firmographics** — size, industry, geography, pulled from the ICP
4. **Platform renditions** — LinkedIn / Meta / Google, each in its own
   vocabulary, values validated against the platform API, reach estimate shown,
   with the signals-vs-manual mode selector on Meta and Google
5. **Exclusions** — shared logic, expressed per platform
6. **Kepler audiences** — which lists sync as custom audiences or customer match
   (E18)
*Rail:* reach comparison across platforms, saved audience specs

### Variant model: batch by default, matrix on demand *(decided)*

- **Batch** — N variants, each a distinct angle. Fast, familiar.
- **Matrix** — a designed test: angle × audience × offer, one dimension varying,
  so a win is interpretable ("risk-reversal beat feature-led for CIOs").

*Risk flagged and accepted:* casual batch use yields data the closed loop learns
less from. **Mitigation — batch runs still record the angle**, so angle-level
learning survives; only *causal* learning needs the matrix. The UI states which
kind of learning each run supports.

### Push to platform via API *(decided)*

Kepler creates the ad as a **draft**, owning the platform creative ID so the
closed loop links automatically. Without that ID, E14's creative-level data
cannot be matched to the variant Kepler wrote — **this is the precondition for
E6 validation**.

**Cumulative permission surface** — now three distinct scope categories:

| Need | Scope | Epic |
|---|---|---|
| Read ad performance | Google Ads read · Meta `ads_read` | E14 |
| Create ad drafts | Google Ads write · Meta `ads_management` + business verification | E19 |
| Validate targeting + reach | LinkedIn Ad Targeting Facets · Meta Targeting Search + Reach Estimate · Google Audience Insights | E21 |

Apply for all three together rather than sequentially — each round of review
carries its own lead time.

### Why this validates E6

E6 scores lowest on confidence because nobody knows whether performance data
improves the next brief. A blog takes months to rank — too slow to learn from.
**An ad reports in days, at creative level, with platform-verified numbers.**
Ad Creative is therefore the cheapest available test of the riskiest premise in
the plan: if the loop works here it justifies building it everywhere; if it does
not, months are saved.

### Changes to Part I

- **New E19 · Ad push to platforms.** Draft creation via API, variant↔creative ID
  link. Gated on **write** scopes. Precondition for E6 validation.
  I 9 · C 6 · E 3 → **ICE 6.0**
- **E20 · Deep copy + targeting.** Platform-native asset shapes, argument
  structure, per-platform targeting contracts, policy validation, and **both
  spec/rendition splits** (message and audience) that keep visuals and new
  platforms addable. Rescored — the audience split and three output contracts
  make it bigger than first estimated.
  I 8 · C 8 · E 4 → **ICE 6.7**
- **New E21 · Targeting validation.** Platform taxonomy lookup and reach
  estimates, so every emitted value is verified selectable. Third scope category.
  I 8 · C 6 · E 4 → **ICE 6.0**
- **E6 gains a validation path** — and should be sequenced after E14 + E19 rather
  than attempted on content first.

---

## S9 · Brand Intelligence — **settled**

The grounding layer every generator reads from. **Assessment: this is the most
mature module in the app, and its structure does not change.** Both gaps below
were exposed by specifying downstream consumers, not by reviewing this module.

### What is already strong — and stays as-is

- **A rich brand profile**: `industry`, `productsServices`, `offersProducts`,
  `offerDescriptions`, `targetMarket`, `valueProposition`, `differentiators`,
  `painPointsSolved`, `proofPoints`, `companySize`, `geographicFocus`,
  `keyMessages`, plus brand identity (colours, typography, visual direction).
- **Provenance per field** — `MANUAL / WORKSPACE / WEBSITE / FILE / COMBINED /
  AI / LEARNED`. Nothing else in the codebase tracks where a value came from.
- **Confidence scoring, staleness detection (90d+), website-drift checking**, and
  a learning loop proposing field updates from rated outputs.
- **Five children** — Overview, Business Details, Competitor Intelligence,
  Audience & ICP, File Intelligence. The split works; no navigational change.
- **Brand identity assets already exist**, which matters if S8's deferred visual
  generation is ever built — the brand kit is there waiting.

**Scope under orgs (E9):** brand stays **workspace-scoped**. A multi-brand company
runs separate workspaces with separate brands; only *learned campaign shapes*
(E11) cross the org boundary. Brand data never does.

### Gap 1 — the ICP is messaging-complete, targeting-incomplete

Current shape:
```
segment · role · titles · companyType · geography
primaryPains · triggers · blockers · buyingContext · messagingHooks · channels
```

Excellent for **copy** — pains, triggers, blockers and hooks are exactly what a
message needs. But S8's targeting renditions need firmographics it does not
carry:

- **Company size band** — `companyType` is free text; LinkedIn, Meta and Google
  all target on employee count. (`companySize` exists on the *brand* — that's our
  size, not the target's.)
- **Industry in a targetable taxonomy** — platforms need selectable values
- **Revenue band** — targetable on some platforms

**Decided: add a platform-agnostic targeting block** to the ICP, with S8's
renditions translating it into each platform's vocabulary. Same spec/rendition
seam used for copy and audience — the ICP stays readable rather than becoming a
platform config form.

```
icpTargeting  { companySizeBand, industry (taxonomy id + label),
                revenueBand, geographyTargets[] }
```

*Deferred enhancement worth keeping:* these fields could later be **seeded from
closed-won CRM accounts** — read the size and industry of deals that actually
closed and propose them as the ICP's real firmographics. Grounded in outcomes
rather than opinion, and it reuses connectors already built. Needs enough
closed-won history to be meaningful, so it is a later refinement rather than the
initial mechanism.

### Gap 2 — competitors are stateless

The entire object today:
```sql
competitors: id · workspace_id · name · url · confirmed · notes
```

Three committed consumers need more than a name list: **E12** ranks on competitor
movement, **S4's AI Visibility** must show which competitor was cited instead of
you, and **S8** grounds creative in competitor ads via a Meta Ad Library read that
**already works and stores nothing**.

Every competitor observation is currently discarded after rendering — the same
disease diagnosed in the SEO jobs, sitting in the module everything else reads
from.

**Decided: enrich the record and accumulate observations.**

```sql
competitors               -- + positioning, pricing_posture, channels[]
competitor_observations   -- competitor_id, kind ('page'|'ad'|'citation'|'ranking'),
                          -- observed_at, source, payload JSONB
```

`kind` covers what the existing detectors already produce: pages from teardowns,
ads from the Ad Library read, citations from `visibility_scans`, ranking movement
from GSC. **Most of this is capturing output that is already generated and thrown
away.**

### Where E8 lands

"Make the learning legible" belongs on this screen. `brand_suggestions` already
accumulates proposals from rated outputs; surfacing what Kepler has learned about
the account — and letting the user accept, reject or edit — is the compounding-
value story made visible, and it lives where the brand model lives.

### Changes to Part I

- **New E22 · ICP targeting block.** Platform-agnostic firmographics on the ICP.
  Small, high confidence, and **blocks E20/E21** — S8's platform renditions cannot
  produce firmographic targeting without it.
  I 8 · C 9 · E 7 → **ICE 8.0**
- **New E23 · Competitor enrichment + observations.** Descriptive fields plus an
  observations table accruing what detectors already emit.
  I 8 · C 8 · E 5 → **ICE 7.0**
- **E8 is sited here** rather than floating unassigned.

---

## S7 · Social Media — **settled**

### Competitive position *(researched Aug 2026)*

Buffer **$6/mo** · Later **$18** · Hootsuite **$99/user** · Sprout **$199/seat** —
and **AI captions plus auto-scheduling became default across all of them in
2025–26**. Scheduling and caption generation are table stakes at $6/month. Kepler
competes on neither.

### Publishing — direct API, approvals owned *(decided)*

Posting to LinkedIn **company pages** requires the Community Management API:
registered company, verified Page, two-tier review (Development tier is
rate-limited and expires after 12 months; Standard needs a screencast per use
case). And critically:

> **Marketing Developer Platform partner review gates anyone serving accounts
> they don't own.**

Kepler serves customers' pages, so **MDP partner status is required** — the
hardest gate in this roadmap. Decided: **pursue it directly** rather than routing
through an aggregator, because once held it is an asset (see §0's second
principle).

### X — generate, don't publish *(decided)*

X moved to **pay-per-use in Feb 2026**: $0.015 per post, **$0.20 if the post
contains a link**. B2B posts almost always carry a link, so Kepler's primary use
case is the expensive one — and X is the only platform here with per-post COGS
(LinkedIn and Meta are free to post to once approved).

**Decided: defer X publishing, keep X generation in scope.** Kepler produces
X-shaped content — character limits, thread structure — and the user posts it.
This removes the API dependency and the COGS entirely while keeping X in the
content model.

*This is the message/rendition seam from S8 paying off early: a platform can have
a rendition without having an integration.*

### Scope

**Platforms:** LinkedIn · Meta (publish) · X (generate only). **No breadth chase**
— no TikTok, Threads, Pinterest.

**Not built:**
- **Social inbox / engagement management.** Comment and DM handling is Hootsuite
  and Sprout's core, needs another tier of API access, and is a customer-service
  job rather than marketing orchestration.
- **Generic caption generation.** Every post is grounded in brand, ICP, campaign
  and goal. Ungrounded AI captions are the commoditised feature; competing there
  means fighting a $6/mo tool on its strongest ground.

**In scope:** post performance and audience analytics — kept deliberately, since
they feed goal contribution.

### Three children — kept, deepened *(decided)*

Plan · make · measure are genuinely different jobs, so the existing split is
right and only the contents change.

**Social / Calendar** — the canvas, with the goal obligation bar as module frame.
Cross-platform schedule; posts carry their goal and campaign.

**Social / Composer** — single post and carousel, always grounded. Platform
renditions per the S8 seam (LinkedIn / Meta / X shapes, character validation).
**Carousel generation and the brand kit already exist here** — which makes this
the natural seed if S8's deferred visual generation is ever built.

**Social / Performance** — post results plus audience analytics, feeding channel
contribution in S5.

### Changes to Part I

- **New E24 · Social publishing.** LinkedIn + Meta direct integration.
  **Confidence is low because MDP approval is not guaranteed** — this is the one
  epic whose delivery depends on a third party's decision.
  I 8 · C 5 · E 3 → **ICE 5.3**
- **New E25 · Grounded social composer.** Brand/ICP/campaign/goal-grounded
  generation with platform renditions including X.
  I 8 · C 8 · E 6 → **ICE 7.3**
- **New E26 · Social performance.** Post results + audience analytics.
  `channelHistoryService` already pulls account history, so this is partly built.
  I 7 · C 7 · E 6 → **ICE 6.7**
- **New E27 · Platform approvals programme.** See below.

### The approvals programme *(new — needs an owner and a start date)*

Across S5, S8 and S7 the roadmap now depends on **nine platform approvals**:

| Platform | Approvals |
|---|---|
| Google Ads | developer token (read) · write scopes · audience/targeting APIs |
| Meta | `ads_read` · `ads_management` + business verification · targeting APIs · Pages publishing review |
| LinkedIn | **MDP partner status** · Community Management Standard tier |
| X | *(none — publishing deferred)* |

Several sit on the critical path, all carry external lead time, and MDP is the
hardest. **E27 · Platform approvals programme** — I 10 · C 6 · E 4 → **ICE 6.7**.
Impact is 10 because E14, E19, E21 and E24 all stall without it; this is
paperwork that gates engineering, and it should start before any of them.

---

## S10 · Library · Integrations · Settings — **settled**

Convention-driven surfaces. **No competitive research done deliberately** — the
win here is following established patterns exactly (Linear, Notion, Figma, Slack
all converge on the same shapes), not innovating. Innovation in settings is a
usability tax.

All three are currently thin: Settings has exactly one section ("Account"),
Library filters on content type alone, and Integrations knows only
connected/disconnected.

### Library — from archive to corpus *(decided)*

Today: type filter plus text search. Under the new architecture every asset
carries a goal, a campaign, and performance — so Library becomes the place you
ask *"everything that served the Q2 pipeline goal, ranked by contribution."*

- Filter by **goal · campaign · type · status · contribution**
- **Orphans are their own filter** — since S3 chose not to build bulk adoption,
  every pre-goal asset stays goal-less, and this is the only place they remain
  findable
- **This is the corpus E6 learns from.** Not an archive you never open — the
  record of what actually worked, across every channel

### Integrations — a state it has never had *(decided)*

Connections arriving from E13, E19, E21 and E24 mean a connector can be **built
but not yet approved**. Today's UI knows only connected/disconnected.

Needs:
- **Approval state** — `available · approval pending · connected · degraded`
- **Scope visibility** — read vs write vs targeting is now meaningful and
  determines what actually works. A connection granting read-only should say so
  rather than failing silently at push time.
- Categories extend from today's seven with **AI visibility** (E13)

### Settings — from one section to an area *(decided)*

Three children, following the convention every multi-tenant tool uses:

- **Settings / Account** — you: name, email, password
- **Settings / Workspace** — this brand's config, deletion
- **Settings / Organisation** — members, roles, invites, and **E11's
  cross-workspace sharing consent**

The sidebar's existing `WorkspaceSwitcher` gains org awareness.

### Roles — the S1 question, answered *(decided)*

S1 parked this: *"owner/member may be too coarse, but I'd rather discover that
against a real screen."* Here is the screen, and the answer is **keep two roles**.
Inventing a permission matrix for a three-person team is the over-build.

But **gate the consequential actions** to owner regardless of role granularity:

| Owner-only | Why |
|---|---|
| Enable cross-workspace sharing (E11) | Crosses a confidentiality boundary |
| Connect / disconnect integrations | Grants or revokes data access |
| Organisation settings, invites | Changes who can see everything |
| Workspace deletion | Irreversible |

Members do all the work — goals, campaigns, generation, publishing. Sending stays
gated by E1's re-approval rather than by role, because the risk there is
*unreviewed content*, not *unauthorised person*.

### Changes to Part I

- **New E28 · Library as corpus.** Goal/campaign/performance filtering, orphan
  visibility. I 7 · C 8 · E 7 → **ICE 7.3**
- **New E29 · Integrations states + scopes.** Approval state and scope visibility.
  I 7 · C 9 · E 8 → **ICE 8.0**
- **E9 gains its surface** — Settings/Organisation is where tenancy lands.

