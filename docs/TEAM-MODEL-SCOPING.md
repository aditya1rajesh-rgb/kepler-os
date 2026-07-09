# KEPLER OS — From Generation Tool to Marketing Team

**Status:** Scoping / vision. No build committed. Written 2026-07-03.
**Decision this doc supports:** whether (and how) to evolve KEPLER from a briefable studio of generators into something that operates like a marketing team as a whole.

---

## 1. The thesis

KEPLER today is **a briefable studio of specialists with a memory.** You pick a module, it generates well, and it learns your brand (Brand Intelligence + the feedback loop). The compounding intelligence is already the team-grade part — most "AI marketing tools" have nothing like it.

But a studio waits to be briefed. A **team** decides what to do, coordinates itself toward an outcome, ships the work, and learns from results. The gap between where KEPLER is and "a marketing team as a whole" is not more generators — it's the layers *above and around* the generators.

The spectrum:

```
Tool ─────────────── Studio ─────────────── Team ─────────────── Autonomous team
(one asset on         (briefable            (goal → coordinated    (sets its own
 demand)              specialists +          plan → ships →          goals, runs
                      memory)  ◀── KEPLER     learns)                 continuously)
                                  is here
```

We are proposing the move from **Studio → Team**, and being deliberate about how far toward autonomy we go.

---

## 2. Anatomy of a real marketing team (functions, not avatars)

A team is a set of *functions*, not a cast of named AI personas. Mapping the functions to current coverage:

| Team function | What it does | KEPLER today | Gap |
|---|---|---|---|
| **Strategy & planning** | Turns a business goal into a marketing plan: which channels, what message, what sequence | — (user decides, per asset) | **Missing** — the strategist |
| **Research & insight** | Audience, competitors, positioning, market | Brand Intelligence (ICP + competitors) | Partial — no ongoing customer research / positioning work |
| **Creation** | Blogs, ads, outreach, social, design | 5 modules — strong | Covered (the specialists) |
| **Coordination / PM** | Sequences the specialists into one campaign with a cadence; reprioritizes | Cockpit (orientation only) | **Missing** — the manager |
| **Distribution** | Actually publishes / sends / posts | — (integration-light by design) | Deferred (heavy) |
| **Measurement & optimization** | Tracks outcomes, A/B tests, reallocates | — (analytics deferred) | Deferred (heavy) |
| **Lifecycle & retention** | Onboarding, nurture, churn, referrals | — | Missing (new channels) |
| **Ops & enablement** | Reusable assets, playbooks, sales enablement | Content Library (storage) | Partial |

**Two gaps convert Studio → Team without touching integrations: Strategy and Coordination.** Everything below the line (Distribution, Measurement) makes it a *complete* team but re-opens the deferred integration/analytics bets.

---

## 3. The structural change: the campaign becomes a first-class object

Today the atomic unit is a **content item** (one asset). A team's atomic unit is a **campaign**:

> a **goal** → a **strategy** → a **sequenced plan** across channels → **many coordinated assets** → a **timeline/cadence** → **outcomes**.

Introducing `campaign` as a first-class object that content items belong to is *the* enabling change. Everything team-shaped hangs off it:

- The **strategist** produces a campaign (goal → plan).
- The **manager/cockpit** runs a campaign (sequences the specialists, tracks progress, reprioritizes).
- The **calendar** is a view over campaign timelines.
- **Distribution** ships a campaign's assets.
- **Measurement** attributes outcomes to a campaign and feeds **campaign-level learning** (today the feedback loop learns *voice*; with outcomes it can learn *what works*).

This reframes the cockpit you just rebuilt: the KPI hero view becomes the **marketing manager's desk** — active campaigns, what's due, what's blocked, what shipped.

---

## 4. Target architecture (the layers)

```
┌─────────────────────────────────────────────────────────────┐
│  INTAKE — goal / brief front door                            │  new (light)
│  "Launch X", "Grow signups", "Raise awareness"               │
├─────────────────────────────────────────────────────────────┤
│  STRATEGY ENGINE — goal → marketing plan                     │  new (core)
│  channel mix · message · sequence · success criteria         │  skills: marketing-plan,
│                                                               │  content-strategy, launch,
│                                                               │  customer-research
├─────────────────────────────────────────────────────────────┤
│  CAMPAIGN SPINE — the first-class object + orchestration     │  new (core)
│  goal · plan · steps · timeline · linked assets · outcomes   │
├─────────────────────────────────────────────────────────────┤
│  MANAGER / COCKPIT — runtime view + reprioritization         │  extends existing cockpit
├─────────────────────────────────────────────────────────────┤
│  SPECIALISTS — SEO/Blog · Ads · Outreach · Social · Design   │  EXISTS (reused as-is)
├─────────────────────────────────────────────────────────────┤
│  MEMORY — brand intel · feedback (voice) · campaign learning │  extends existing
├─────────────────────────────────────────────────────────────┤
│  DISTRIBUTION — publish / send / post          (deferred)    │  heavy — connectors
├─────────────────────────────────────────────────────────────┤
│  MEASUREMENT — outcomes · A/B · reallocation   (deferred)    │  heavy — analytics
└─────────────────────────────────────────────────────────────┘
```

The top four layers are almost entirely **orchestration over what already exists** and need **zero external integrations** — they ride the same Vertex proxy. The bottom two are the deliberately-deferred bets.

---

## 5. Capability gaps mapped to the skills library

The local skills library already encodes the team-level capabilities we don't yet use:

| New capability | Skills that power it |
|---|---|
| Strategist (goal → plan) | `marketing-plan`, `content-strategy`, `launch`, `offers` |
| Deeper research | `customer-research`, `competitor-profiling`, `product-marketing` |
| New channels (roster expansion) | `public-relations`, `community-marketing`, `referrals`, `sms`, `emails` |
| Conversion & positioning assets | `pricing`, `offers`, `lead-magnets`, `cro`, `popups` |
| Lifecycle & retention | `onboarding`, `churn-prevention` |
| Measurement & optimization | `analytics`, `ab-testing`, `revops` |
| Enablement | `sales-enablement` |

The specialists you've built already draw on `copywriting`, `ai-seo`, `ad-creative`, `cold-email`, `social`, `marketing-psychology`, `humanizer` (per the current module↔skill scope). The team layer is mostly *new skills we haven't ported yet.*

---

## 6. Phased roadmap

Sequenced by dependency and by "team-feel per unit of effort." Integration/analytics bets last, so the core team experience ships without connector/auth/cost overhead.

### Phase A — Strategist + Campaign spine  *(core; no integrations)*
**Goal:** KEPLER turns a goal into a coordinated, sequenced plan across existing modules.
- New `campaign` object (goal, strategy, ordered steps → module + brief, timeline, linked content items, status).
- Strategy engine: intake a goal → produce the plan (skills: `marketing-plan`, `content-strategy`, `launch`).
- Cockpit becomes the manager view: active campaigns, next actions, generate-in-context (each step deep-links to its specialist, pre-briefed).
- **Reuses:** all 5 modules, brand context, feedback loop, cockpit shell, Content Library.
- **Deliverable:** "Give me a goal → here's your plan + every asset, in order." A genuine team output.
- **Risk:** low. Orchestration only.

### Phase B — Cadence & calendar  *(sustained rhythm)*
**Goal:** move from one-shot campaigns to an ongoing publishing rhythm.
- Calendar view over campaign timelines; recurring/evergreen cadences; "what's due this week."
- **Reuses:** campaign spine (A), social planner concepts already in the Social module.
- **Risk:** low–medium.

### Phase C — Expand the roster  *(more of a full team)*
**Goal:** cover functions a full team has that KEPLER doesn't.
- New capability areas from the skills library: PR, community, referrals, lifecycle (onboarding/nurture/churn), conversion assets (offers/pricing/lead-magnets).
- Each rides the same generation pattern as existing modules.
- **Risk:** medium (surface-area growth) — pick 2–3, don't boil the ocean.

### Phase D — Distribution  *(revisits "integration-light")*
**Goal:** the team actually ships.
- Connectors: social posting, email/CRM send, etc. Auth, rate limits, per-platform quirks.
- **Reuses:** campaign spine as the thing being shipped.
- **Risk:** high. Auth/cost/maintenance. This breaks the current integration-light stance — explicit decision required.

### Phase E — Measurement & optimization loop  *(revisits "analytics deferred")*
**Goal:** the team learns from real outcomes and reallocates.
- Ingest performance (GA4/Search Console/platform metrics), attribute to campaigns, A/B testing, reallocation suggestions.
- **Unlocks campaign-level learning:** the feedback loop graduates from "learns your voice" to "learns what works."
- **Risk:** high. Data plumbing + the deferred analytics bet.

**Recommended commitment now:** Phases **A** (and **B**). C is opportunistic. D and E are separate, explicit strategic bets — worth planning for, not worth starting until A proves the model.

---

## 7. Trade-offs & risks

- **Theater risk (biggest).** "Team" can degrade into named avatars and agents "chatting" that add no value. Guard: the value is the *quality of the strategic decisions and the coordination*, measured by whether the plan is one a good marketer would actually run. No personas-as-decoration.
- **Prior constraints this re-opens.** Integration-light (Phase D) and analytics-deferred (Phase E) were deliberate calls. A and B honor them; D and E don't. Decide those on their own merits later.
- **Scope creep.** Roster expansion (C) can sprawl across 44 skills. Discipline: expand only where a real user goal demands it.
- **Autonomy level.** How much does the "team" act vs. propose? Recommendation: **propose-and-approve** first (KEPLER plans, you approve each step), earn trust before any auto-execution — especially before Phase D can send anything on your behalf.
- **Trust & the front door.** The conversational/command front door was also deferred. A goal-intake step (Phase A) is a *narrow* version of it — worth reconsidering whether the full Cmd+K/chat front door rides along or stays deferred.

---

## 8. Open decisions (the forks, for when we act)

1. **How far now?** Commit to A only, A+B, or A+B+one slice of C?
2. **Autonomy:** propose-and-approve (recommended) vs. more automation?
3. **Campaign types first:** which goals matter most — launch, lead-gen/signups, awareness, fundraise, retention? (Shapes the first strategy templates.)
4. **Front door:** narrow goal-intake, or revive the fuller conversational command layer?
5. **Integration stance:** hold integration-light through A–C and treat D/E as a separate green-light? (Recommended.)
6. **Success metric for the team itself:** what tells us KEPLER "feels like a team"? (e.g. time-from-goal-to-full-campaign, % of plan the user runs unedited.)

---

## Appendix — one-line summary

> KEPLER is a studio; the campaign object + a strategist + a manager view turn it into a team, using skills you already have and zero new integrations. Distribution and measurement make it a *complete* team but are separate, heavier bets to green-light on their own.
