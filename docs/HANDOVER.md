# Handover — Kepler roadmap execution

**Session date:** 2026-08-09 · **Branch:** `staging` · **Last commit:** `6b691a3`

Written so a fresh session can pick this up without replaying the conversation.
Read this, then `docs/ROADMAP.md` and the `roadmap-deviations` memory.

---

## 1. State

**Everything is committed and pushed.** `origin/staging` == `staging`.

- `329 tests pass` · production build clean · **lint 57 errors — that is the
  accepted baseline**, not a regression. CI runs `npm test` + `npm run build`
  deliberately, never lint.
- **The staging database is deployed and current.** All 13 pending migrations
  (020–032) were applied manually on 2026-08-09 and all 9 edge functions
  deployed. `supabase migration list` shows local == remote == 032.
- **The email sender is NOT armed.** The Vault secrets for 023/028 were
  deliberately skipped, so `kepler-send-scheduler` and `kepler-inbox-monitor`
  are scheduled but no-op (401). See §5.

---

## 2. What shipped — the whole NOW tier, plus E3

Roadmap NOW tier is **complete** (E27 excluded — the user owns the approvals),
and the first NEXT-tier epic, **E3**, is done. **E3 needs no migration and no
edge-function change** — it is client-side only, so nothing is pending on the
database from it.

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
- **Injected context must not end a line with a field label the surrounding
  prompt parses.** Found in E3: `blogDraft` reads the title with
  `/Title:\s*(.+)/i` and takes the FIRST match in the whole prompt, so a context
  line ending `reference them by title:` retitled the blog with a prior asset —
  silently, and only visible because the demo harness renders the title. The
  wording is now "by name" and a test locks it, but the class of bug applies to
  anything added to a prompt from now on.

---

## 5. Blocked / needs the user

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

NOW is done and E3 closed the loop **downward** — a goal now reaches the assets
made under it. Three candidates, in the order I would take them:

1. **E5 · Goal cockpit (7.3).** The return surface. E2 and E3 both assume
   someone comes back to a goal and sees what moved; nothing renders that yet.
   It also unblocks `setPrimary`, which E3 leans on for standalone generation —
   right now the only way to set a primary goal is the service, so the
   "grounded in your primary goal" fallback is unreachable through the UI.
   That is the sharpest gap E3 exposed.
2. **E28 · Library as corpus (7.3).** E3's PRIOR leg reads `content_items` by
   campaign. E28 makes the corpus first-class, which is what turns "do not
   repeat these" into "build on these."
3. **E7 · Scheduled detectors (7.7 — highest ICE, no dependencies).** Take it if
   a self-contained epic suits the session better; it feeds E5 later either way.

**E6 · closed loop is still gated on E4 evidence** — E3 grounds generation in
the goal, but nothing yet reads performance back into the next asset, and the
roadmap is explicit that the loop should be validated on ads, not content.

Other E2 leftovers, all deliberately deferred: `goal_links` (built, unused —
wants a second goal to link to), Activity (blocked on E9's `actor_id`),
`setPrimary` (service exists, no UI — wants E5's cockpit).

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
