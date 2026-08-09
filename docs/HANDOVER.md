# Handover — Kepler roadmap execution

**Session date:** 2026-08-09 · **Branch:** `staging` · **Last commit:** `e5bbcde`

Written so a fresh session can pick this up without replaying the conversation.
Read this, then `docs/ROADMAP.md` and the `roadmap-deviations` memory.

---

## 1. State

**Everything is committed. 2 commits unpushed** (`git push origin staging`).

- `302 tests pass` · production build clean · **lint 57 errors — that is the
  accepted baseline**, not a regression. CI runs `npm test` + `npm run build`
  deliberately, never lint.
- **The staging database is deployed and current.** All 13 pending migrations
  (020–032) were applied manually on 2026-08-09 and all 9 edge functions
  deployed. `supabase migration list` shows local == remote == 032.
- **The email sender is NOT armed.** The Vault secrets for 023/028 were
  deliberately skipped, so `kepler-send-scheduler` and `kepler-inbox-monitor`
  are scheduled but no-op (401). See §5.

---

## 2. What shipped — the whole NOW tier

Roadmap NOW tier is **complete** (E27 excluded — the user owns the approvals).

| Epic | What |
|---|---|
| **E1** | Sequence re-approval signal — the silent stop, surfaced |
| **E4** | Usage instrumentation — `usage_events`, wired once through `ModuleScreen` |
| **E16** | Reply inbox — `Outreach / Replies`, actionable |
| **E30** | IA restructure (new epic, see §3) — stages A/B/C |
| **E29** | Integrations states + scope visibility |
| **E22** | ICP targeting block |
| **E2** | Goals + feasibility engine — the spine |

**E2 is the important one.** Migration 032 adds `goals`, `goal_checkpoints`,
`goal_target_history`, `goal_links` and `campaigns.goal_id`. The feasibility
engine (`src/lib/goalFeasibility.js`) proposes a target from the account's own
rates instead of asking on a blank field, and guards the two risks that creates:
cold start returns `null`/`unknown` **never 0**, and thin evidence **widens the
range** (±50% at one snapshot, ±15% at four over two weeks).

Verified end to end: laddering two campaigns with metric history turned a goal
from "Not enough data" into "On track — 62%, 5,544 of 9,000".

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

The NOW tier is done. By ICE the next is **E7 · scheduled detectors (7.7)**, but
the better move is **E3 · goal-grounded generation (8.0)**:

> E3 is the reason E2 exists. Generation currently reads brand voice only
> (`blogPipelineService` → `getBrandContextForGeneration`). E3 makes it consume
> the goal, the campaign, prior assets and live search data — closing the loop
> downward so assets stop being orphans. That is the roadmap's stated thesis.

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
