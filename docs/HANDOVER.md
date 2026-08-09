# Handover — Kepler roadmap execution

**Session date:** 2026-08-09 · **Branch:** `staging` · **Last commit:** `4c0919e`

Written so a fresh session can pick this up without replaying the conversation.
Read this, then `docs/ROADMAP.md` and the `roadmap-deviations` memory.

---

## 1. State

**Everything is committed and pushed.** `origin/staging` == `staging`.

- `370 tests pass` · production build clean · **lint 56 errors — that is the
  accepted baseline** (it was 57; deleting the old dashboard components took one
  with them). CI runs `npm test` + `npm run build` deliberately, never lint.
- **The staging database is current, but two edge functions are AHEAD of it.**
  All 13 migrations (020–032) were applied manually on 2026-08-09 and all 9
  functions deployed — then **E5 changed `oauth-proxy` and `metrics-snapshot`**
  and they have not been redeployed (CI is still broken, see §5). No migration is
  pending: E5 needed none. Until those two land, GA4 snapshots carry no
  `bySource` key and the cockpit's channel table honestly reports that.
- **The email sender is NOT armed.** The Vault secrets for 023/028 were
  deliberately skipped, so `kepler-send-scheduler` and `kepler-inbox-monitor`
  are scheduled but no-op (401). See §5.

---

## 2. What shipped — the whole NOW tier, plus E3 and E5

Roadmap NOW tier is **complete** (E27 excluded — the user owns the approvals),
and two NEXT-tier epics are done: **E3** and **E5**. Neither needed a migration.
E3 is client-side only; **E5 changed two edge functions** and those are the only
undeployed code in the repo.

| Epic | What |
|---|---|
| **E1** | Sequence re-approval signal — the silent stop, surfaced |
| **E4** | Usage instrumentation — `usage_events`, wired once through `ModuleScreen` |
| **E16** | Reply inbox — `Outreach / Replies`, actionable |
| **E30** | IA restructure (new epic, see §3) — stages A/B/C |
| **E29** | Integrations states + scope visibility |
| **E22** | ICP targeting block |
| **E2** | Goals + feasibility engine — the spine |
| **E3** | Goal-grounded generation — the spine, read (see §2b) |
| **E5** | Goal cockpit — the return surface, replaces the Dashboard (see §2c) |

**E2 is the important one.** Migration 032 adds `goals`, `goal_checkpoints`,
`goal_target_history`, `goal_links` and `campaigns.goal_id`. The feasibility
engine (`src/lib/goalFeasibility.js`) proposes a target from the account's own
rates instead of asking on a blank field, and guards the two risks that creates:
cold start returns `null`/`unknown` **never 0**, and thin evidence **widens the
range** (±50% at one snapshot, ±15% at four over two weeks).

Verified end to end: laddering two campaigns with metric history turned a goal
from "Not enough data" into "On track — 62%, 5,544 of 9,000".

---

## 2b. E3 — goal-grounded generation

Generation read the brand profile and nothing else, so every asset was an
orphan: correct about who the company is, ignorant of what it is currently
trying to achieve. E2 built the rung above; **E3 makes generation read it.**

**One call replaces `getBrandContextForGeneration`** in blog, ads and social:
`getGenerationContext()` (`src/services/generationContextService.js`). It
returns the old shape (`prompt` / `structured` / `meta`) plus four legs, in
descending order of authority over the output:

| Leg | Source | Decides |
|---|---|---|
| GOAL | explicit → `campaign.goal_id` → primary goal | what a win means |
| CAMPAIGN | `campaigns` + the step, when there is one | the angle |
| PRIOR | completed `content_items` beneath the goal | what not to repeat |
| SIGNALS | `seoOperatorService` (GSC) + `visibilityService` gaps | the language demand uses |

The system prompts state that precedence explicitly, so a conflict resolves the
same way every time.

**The honesty rules live in the pure module** (`src/lib/generationContext.js`,
27 tests in `tests/generation-context.test.js`). The risky part of grounding is
not assembling context, it is what the prompt may SAY about it — a model handed
a target and no standing will write "we're well on our way," and that sentence
looks exactly as grounded as a true one.

- **No goal → no GOAL block.** Never a "grow the business" stand-in; an invented
  goal grounds the copy in a fiction and reads as grounded.
- **`verdict: 'unknown'` → the block says so and forbids progress claims.**
- **A target is an INTENT and may always be stated. `achieved`/`forecast` are
  CLAIMS** and appear only when the projection produced them — and even then the
  prompt marks them internal framing, never copy.
- **Budget:** the ladder gets ~6K chars and drops whole sections in authority
  order rather than truncating mid-bullet. GOAL survives the squeeze.

**Every leg but the brand degrades soft.** A missing goal, an unreachable Search
Console, an empty visibility scan each remove a paragraph and nothing else.
Grounding that can sink a generation is worse than none, because it fails on the
days the user most wants output. Signals are per-module (`MODULE_WANTS_SIGNALS`)
— on for blog/seo, off for social and ads, where three GSC pulls buy material
those surfaces cannot act on.

**Provenance is returned from the call that builds the prompt**, stored on the
asset, and rendered by `src/components/ui/GroundedIn.jsx` in all three screens.
A grounding claim nobody can inspect is a marketing sentence. When the goal was
INFERRED (asset generated outside any campaign), the strip says so in a full
sentence rather than hiding it behind a chip.

Verified in the demo harness end to end: a laddered campaign produced all four
legs (goal via campaign, 3 prior assets, 6 search signals, 1 answer-engine gap)
and the strip rendering them; an ad generated outside a campaign fell back to
the primary goal and showed the caveat.

**Not done, deliberately:** `generateLinkedInTargeting` still reads brand context
only — it is ICP work, not copy, and the goal has no bearing on a job-title list.

---

## 2c. E5 — the goal cockpit

**This screen replaces the Dashboard.** Same route, same registry entry; the old
`.db-*` screen and its five components are deleted.

**The admission filter is the design.** Every card answers one of three
questions — what changed since I last looked, what needs me now, what should I
do next — and a card that only reports current state does not belong. That is
what deleted the KPI strip, the campaign table and the activity feed: they
reported, and reporting does not create return. The feed's actionable half is
now the queue; its notable half hangs off the goal, where movement becomes
direction instead of noise.

### The zones

| Zone | State |
|---|---|
| **1 · Goal hero** | Built. Progress, forecast, **gap in real units**, days remaining, what moved |
| **2 · Needs you** | Built. Five row types, all from state production already writes |
| **3 · Recommended next** | **Deliberately not built** — that is E10 |
| **4 · Funnel** | Built. Five stages, sparklines, honest empty stages |
| **5 · Channel contribution** | Built, incl. the `production—source` dimension |
| **6 · Other goals** | Built — a quiet strip, plus "make primary" |

**Zone 3 is the interesting omission.** E10 is what scores which work would close
the gap. Until it exists the card states the gap's *size* from the goal's own
math and stops there: it will not rank work it has not measured. A card that
guessed would be indistinguishable on screen from one that knew.

**The hero closes E3's exposed gap.** `goalsService.setPrimary` had no caller, so
the primary-goal fallback standalone generation relies on was unreachable through
the app. The hero offers it, and the other-goals strip does too. An inferred hero
(no primary set → soonest-ending active goal) says so, exactly as E3's provenance
does.

**What moved, without E7.** The roadmap puts E7's detectors on the hero. They do
not exist, so the hero shows the honest half we have — the change between two
real readings of the goal's own measure — and states plainly that nothing is
computing the cause yet.

### Zone 5 — the `production—source` key

`production` is what Kepler made (**known**, because our tagged links carry a
campaign-scoped utm whose id8 survives renaming). `source` is where the outcome
came from (**reported** by GA4). One compound key rather than a toggle between
two axes, so there is only ever one number per row.

- GA4's by-campaign report gained `sessionSource` + `sessionMedium` in **both**
  copies — `oauth-proxy` (browser) and `_shared/googleData.ts` (cron). They must
  stay in sync; the file says so and now it matters.
- Both writers store the split as `metrics.bySource`, keyed by **raw GA4
  spellings**, so display rules can change without a re-pull. No migration.
- `src/lib/channelContribution.js` is pure and holds the rules;
  `measurementService.getContribution` reads it back from snapshots.

**The refusals, which are what `tests/channel-contribution.test.js` pins:**

- **share is over the WHOLE picture**, never the attributed slice — 400/2000
  reads 20%, where dividing Kepler's work by Kepler's work reads 44%;
- **`Other—` rows stay in the table**, so the unattributed remainder is
  comparable rather than a footnote under a chart;
- an ambiguous multi-wing campaign resolves to **`Campaign`**, not a guessed
  wing;
- drilling from a goal **folds sibling campaigns into `Other`** rather than
  widening the goal's claim;
- pre-source snapshots are kept as one `Unknown` row — dropping them would shrink
  the denominator and inflate every other row;
- **no cross-channel efficiency, ever.** Nothing assigns a production cost to
  organic, so "your Meta CPA is 3× your SEO CPA" is not a sentence Kepler can
  honestly say. Contribution comparison works; efficiency comparison does not.

### L1 — the drill target

`cockpit (L0) → Measurement channel detail (L1) → campaign (L2) → asset (L3)`.
L2 and L3 already existed; **L1 was the missing level** and it lives in
Measurement, which is what gives that screen its job in the new model: the
cockpit summarises, Measurement is where you drill. It is **goal-scoped** (the
goal travels in the URL) and **channel-shaped** — SEO shows impressions and
position, outreach shows sends and replies, paid says plainly that spend is not
measured. A single table with columns for all three would be mostly blank for
each, which reads as missing data rather than as a different kind of thing.

### Two bugs only running it could find

- `linkedin` (our own utm) and `linkedin.com` (the referrer) normalised to
  **"Linkedin" and "LinkedIn" — two rows for one channel**, on a table whose
  entire job is comparing channels.
- The paid caveat said paid was "missing entirely" **while paid rows were on
  screen**. Paid rows appear whenever our tagged links used a paid medium; what
  is missing is the money. Now it says that.

---

## 3. E30 — the audit finding, and why it exists

An audit of all 10 screen specs found that **screen-structure decisions were
never given epic numbers, so none had been executed.** E16's undone half was a
category, not a one-off. E30 was created to fix it.

**The actual IA now:**

```
Dashboard
Goals        ← new (E2)
Campaigns ▸ All campaigns · Calendar
SEO & AEO ▸ Pipeline · Opportunities · AI Visibility
Social Media · Ad Creative                    (flat — Studio is dissolved)
Outreach  ▸ Replies · Sequences · Audiences · Research
Library · Measurement · Brand Intelligence ▸ 5 · Integrations · Settings · Help
```

- **Studio was dissolved.** It cost a nav level S4 needed — the router is only
  `/workspace/:id/:moduleId/:subModuleId`, so a child cannot have children.
- **Audiences** absorbed Lists + Saved + Prospecting (`?view=lists|saved|find`).
- **AI Visibility moved** from Measurement to SEO & AEO.
- `RETIRED_CHILDREN` / `RETIRED_PARENTS` in `moduleRegistry.js` are the single
  source of truth for redirects, and compose multi-hop history. Test-locked.

**The rule applied throughout: build nav where the functionality exists.**
Deferred deliberately, because the content does not exist yet: Measurement's
Overview/Channels/Pages (needs E14/E15), Ad Creative's Build/Audience (E20/E22
content), Settings' three children (E9).

---

## 4. Findings that will bite if forgotten

- **`campaign_metrics` snapshots are trailing LEVELS, not daily increments**
  (GA4 = last-28d). Every rate is a level over its own window. Assuming
  increments makes every forecast wrong by ~28× and entirely plausible-looking.
- **Two columns called "goal".** `campaigns.goal` is legacy free text (012:19);
  `campaigns.goal_id` is the real parent.
- **The demo store applies no Postgres defaults** and runs no triggers. Both had
  to be emulated (`src/demo/pgrest.js` `BEFORE_UPDATE`). When a demo result looks
  wrong, suspect this first.
- **Columns designed but never written** — the recurring defect in this codebase.
  `workspace_events.actor_id` and `replies.classified` are both demo-only.
  E29 nearly repeated it: `oauth-proxy` was discarding the `scope` field, so
  scope visibility would have been inert in production. The writer is now wired.
- **`replies.raw_snippet` holds the email SUBJECT, not the body**, despite the
  name. The Replies screen labels it honestly; fixing it properly means
  `inbox-monitor` storing a body excerpt (a real gap, not yet built).
- **`campaign_metrics` has no `source` column and does not need one.** E5's
  source split lives in `metrics.bySource` (JSONB). Two writers produce it —
  `measurementService.pullGa4` and the `metrics-snapshot` cron — and they must
  agree, or the cockpit reads a different shape depending on who took the
  snapshot.
- **`latestPerPeriod` returns 0, not null, when no snapshot exists.** That is
  correct for the KPI reads it was built for and wrong for anything that DRAWS a
  series: a period with no reading plotted at the floor is a cliff that never
  happened. Pass `nullWhenMissing: true` when charting.
- **A period value and a reading are not the same thing.** A period carries the
  latest level at or before its end, so a week nobody pulled data repeats last
  week's number. Deltas taken across periods report "flat" where the truth is
  "no new reading" — take them from `readingSeries` instead.
- **Injected context must not end a line with a field label the surrounding
  prompt parses.** Found in E3: `blogDraft` reads the title with
  `/Title:\s*(.+)/i` and takes the FIRST match in the whole prompt, so a context
  line ending `reference them by title:` retitled the blog with a prior asset —
  silently, and only visible because the demo harness renders the title. The
  wording is now "by name" and a test locks it, but the class of bug applies to
  anything added to a prompt from now on.

---

## 5. Blocked / needs the user

0. **Two edge functions are undeployed.** E5 changed `oauth-proxy` (the browser's
   GA4 report) and `metrics-snapshot` (the cron's). Until both ship, no snapshot
   carries `metrics.bySource` and the cockpit's channel table falls back to a
   single `Other—Unknown` row and says why. Deploying needs the token in (1).
1. **CI `staging-backend` is broken.** It fails at `supabase link` with
   `{"message":"Unauthorized"}` — `SUPABASE_ACCESS_TOKEN` is expired or wrong.
   Deploys are manual until it is rotated. Full instructions in
   `docs/DEPLOY-RUNBOOK.md` §6. Also confirm `SUPABASE_PROJECT_REF` is
   `risoupsjfwnpawjltywh`.
2. **The sender is unarmed by choice.** To turn it on: `supabase secrets set
   SCHEDULER_SECRET=<64-hex>` plus two `vault.create_secret` calls (runbook §3).
   ⚠️ Once armed, `kepler-send-scheduler` sends real email every 5 minutes for
   any approved sequence with active enrollments.
3. **E29 scope visibility reads "unknown" on existing connections** until they
   are reconnected. Correct by design, not a bug.
4. **The design system was explored and dropped.** A light-mode rebuild was
   researched (Radix Colors + Atlassian elevation + shadcn token vocabulary + a
   validated 8-slot chart palette), prototyped as a working probe against the
   real app, and the user rejected it. The probe is shelved in the session
   scratchpad, not in the repo. **Do not restart it unprompted.**

---

## 6. Suggested next

The goal spine is now closed in both directions: E3 pushed the goal **down** into
generation, E5 brought the outcome **back up** into a surface worth returning to.
Two things E5 left as named holes, and they are the strongest candidates:

1. **E7 · Scheduled detectors (7.7 — highest ICE, no dependencies).** E5 built
   the surface its output lands on. The hero's "what moved" currently shows a
   level change and admits nothing is computing the cause; E7 is the cause. This
   is the smallest change that makes the cockpit worth opening daily.
2. **E10 · Continuous goal recommendation (7.3).** Zone 3. The cockpit sizes the
   gap and then deliberately stops, because it will not rank work it has not
   measured. E10 is the ranking, and the zone is already framed for it.

Then **E28 · Library as corpus (7.3)** — E3's PRIOR leg reads `content_items` by
campaign; E28 makes the corpus first-class, which turns "do not repeat these"
into "build on these."

**E6 · closed loop is still gated on E4 evidence.** Nothing yet reads performance
back into the next asset, and the roadmap is explicit that the loop should be
validated on ads, not content.

**What zone 5 will want next, when the paid leg lands:** spend, and with it CPA
and ROAS *within* paid. Not across channels — that refusal is permanent.

Other E2 leftovers: `goal_links` (built, unused — wants a second goal to link
to) and Activity (blocked on E9's `actor_id`). `setPrimary` is **done** — E5's
hero and other-goals strip both call it.

---

## 7. How to verify work

`npm run dev:demo` → `localhost:5176`. Backend-free, seeded as Ken42. Workspace
id `b1cdec8e-069d-4195-ac1c-59c218bb6748`. This is the harness for authed
screens — not the old CSS harness.

New demo tables must be registered in `src/demo/dataset/index.js` `DEMO_TABLES`
or reads warn and return empty.

Three things about the harness that cost time in the E3 session:

- **The demo dataset ships no `goals` rows and no `campaigns.goal_id`.** To
  exercise anything goal-shaped you have to create a goal and ladder a campaign
  first — through the Goals screen, or `goalsService` from the browser console.
- **A page reload re-seeds the store**, so anything you set up is lost. Navigate
  by clicking the sidebar (in-app routing), not by loading a URL.
- **Vite serves the real modules**, so `await import('/src/services/…')` in the
  console runs the actual service against the demo store. That is the fastest
  way to inspect an assembled prompt without clicking through a whole flow.

E5 added one more, and set the demo up so the cockpit has something to show:

- **The ga4 demo snapshots now carry `bySource`** (`src/demo/dataset/campaigns.js`,
  `sources:` per series), using the mediums `lib/tracking.js` actually mints — so
  the harness exercises the real keying rules rather than a convenient fiction.
  `GA4_BY_CAMPAIGN` in `dataset/crm.js` gained the same two dimensions.
- **The cockpit's cold start is the default demo state**, because the dataset
  ships no goals. Create one to see the hero; the queue, funnel and channel table
  are populated either way.
- If another session is already on `5176`, add a second launch config on a spare
  port rather than fighting for it — a page reload there would reset the store
  you just set up.
