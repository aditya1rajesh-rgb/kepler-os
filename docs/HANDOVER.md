# Handover — Kepler UX rework + product roadmap

**Session date:** 2026-08-08 · **Branch:** `staging` · **Last commit:** `dc11738`

Written so a fresh session can pick this up without replaying the conversation.
Read this, then `docs/ROADMAP.md`.

---

## 1. State of the repo — nothing is committed

**62 modified · 10 untracked · 3 deleted. All uncommitted on `staging`.**

Two separable bodies of work sit in the working tree:

**(a) The v4 UX rework — code, shipped and verified**
- `src/index.css` — token layer rebuilt (surface ladder, 4pt spacing, 9-rung type
  scale, elevation, motion, accessibility queries)
- `src/styles/surfaces.css` *(new)* — the single container system
- `src/components/layout/ModuleScreen.{jsx,css}` *(new)* — screen frame
- `src/components/layout/ToolRail.{jsx,css}` *(new)* — demoted-tools rail
- `src/styles/kepler-materials.css` — now a compatibility layer over the ladder
- Every workspace module recomposed; `DashboardHeader.jsx`, `Card.jsx`,
  `Card.css` deleted (dead)
- **Verified:** 192 tests pass · production build clean · **lint error count
  identical to baseline (58 before, 58 after — zero introduced)**

**(b) The planning docs — new, no code impact**
- `docs/ROADMAP.md` — the main artefact. 10 screen specs, 29 epics, sequencing
- `docs/RETENTION-MODEL.md` — code archaeology behind the roadmap
- `docs/UX-SYSTEM.md` — the v4 design system spec
- `docs/HANDOVER.md` — this file

**Recommendation:** commit (a) and (b) as separate commits so the code change and
the planning are reviewable independently. `graphify-out/` and `src/demo/` are
untracked and pre-existing — check before including.

**Run it:** `npm run dev:demo` → `localhost:5176`. Backend-free, seeded as Ken42.
Workspace id in URLs: `b1cdec8e-069d-4195-ac1c-59c218bb6748`.

---

## 2. What the roadmap actually is

A settled account of **what goes on each screen and why**, for all 10 screens,
with rejected alternatives recorded so decisions aren't quietly re-litigated.

**Visual design is deliberately deferred.** The user supplied references
throughout; they're logged per screen in the roadmap's *Visual reference library*
with what each contributed. Measurement's references changed a settled decision,
which is the argument for pulling references *before* specifying a screen.
Outreach and the S10 group still have none.

**The north star:** a marketer *lives* in Kepler as an orchestrator across all
wings, working from insights and measurable outcomes from real data flows.

**The thesis:** generated assets are orphans. Everything must ladder to
user-defined account goals. Close the loop in both directions — goals above
campaigns, performance feeding back into generation.

---

## 3. Standing principles (roadmap §0) — these govern future decisions

**1. Scaffold, not cage.** Every structured input accepts a user-defined escape
hatch. *Structure is universal; math is conditional* — anything can be laddered
to and organised by, but only things bound to a measurable source get forecasts.
Where a user goes off-taxonomy, Kepler states what it can and cannot do rather
than silently degrading.

**2. Rent commodity, own scarcity.** Don't build commodity infrastructure; do
acquire scarce access. Declined: enterprise AEO monitoring (ingest instead),
inbox deliverability (route through customer's own CRM/Gmail). Pursued:
LinkedIn MDP partner status — scarce, gated, an asset once held.

**3. Language discipline.** "**Traceable to**", never "driven by", "attributed
to" or "influenced". The category standard is *influenced*; we diverge
deliberately because it implies causation nobody can prove. One word turns an
honest split into a false claim, and every goal forecast inherits it.

---

## 4. Where things stand — the three highest-signal facts

1. **E27 (platform approvals) is the critical path and is not engineering.**
   Nine approvals across Google, Meta, LinkedIn gate E14/E19/E21/E24. MDP is the
   hardest. Lead times are external and unpublished. **Start before any code.**
2. **E22 (ICP targeting block) is tiny and unblocks E20 + E21.** A dozen fields
   gate two of the most expensive epics.
3. **E6 (closed loop) should be validated on ads, not content.** A blog takes
   months to rank; an ad reports in days at creative level. Failure there saves
   months everywhere.

---

## 5. Corrections made during the session — don't re-introduce these

Recorded because each was argued, reversed, and the reversal matters:

| Claimed | Corrected to |
|---|---|
| "Generation is episodic, demote it" | **Wrong.** Generation is episodic *when orphaned*. Tied to a goal with a gap it's continuous. Generation stays the core act. |
| Dual-lens toggle for channel data | **Compound dimension** (`production—source`, e.g. `SEO—Organic`, `Other—Direct`). Collapses two axes, the whole-pie split and the coverage figure into one table. |
| "Closing the monitor→act loop is our AEO differentiator" | **Unavailable.** AirOps and Goodie are already funded and shipping it. |
| "Kepler could say your Meta CPA is 3× your SEO CPA" | **Cannot.** Nothing assigns cost to organic. Cross-channel *contribution* works; *efficiency* does not. |
| "AEO depth isn't worth competing on" (applied to objects) | Conflated two things. **Breadth of objects** (prompts, citations, pages) is table stakes; **volume within them** is not our fight. |
| S8 first pass | Was a placeholder labelled "settled" — one sentence for screens, targeting gaps listed rather than specified. Rewritten with two children, zones, and three output contracts. |

**Also:** the user twice chose an option I'd flagged as risky (dual-lens toggle —
later reversed on evidence; batch-default variant generation). Both are recorded
with mitigations rather than silent acceptance.

---

## 6. Unverified assumptions — the real risk

**There is no customer research and no product analytics in the repo.** The JTBD
in roadmap §2 is marked hypothesis throughout. Five tacit assumptions (§8) are
unverified. The one that would hurt most:

> **If customers have specialists per wing rather than one generalist,
> "orchestrator" means routing and handoffs — and several screens change shape.**

E4 (instrumentation) exists partly to end this blindness. Three open questions
the user hasn't answered: usage data, whether customers are pre-send or actually
running sequences, and whether the Ken42 demo dataset reflects the real ICP.

---

## 7. Two live defects found in the code, not yet fixed

1. **Silent stop.** `migrations/022:110-123` — editing a running sequence demotes
   it to `draft`; `send-scheduler` only processes active enrollments. **Outreach
   stops and nothing tells the user.** This is E1, highest ICE on the board (9.3),
   days of work.
2. **`workspace_events.actor_id` is never populated.** The column exists and
   references `auth.users`; only the demo dataset writes it. The activity feed
   structurally cannot say who did anything. Part of E9.

Also unfixed and pre-existing: `ConnectorsPanel` and several components trip
`react-hooks/set-state-in-effect` — 58 lint errors baseline, untouched.

---

## 8. Suggested next moves

- **Commit the working tree** in two commits (code / docs)
- **Start E27** — the approvals paperwork, today
- **Pull visual references** for Outreach and the S10 group before redesign
- **Answer the three open questions** in roadmap §8 — they're cheap for the user
  and they de-risk several screens
- If building: **E1 first** (days, pure trust), then **E4 + E22** (cheap
  unblockers), then **E2** (the spine)

---

## 9. Memory files written this session

In `~/.claude/projects/-Users-apple-ai-marketing-platform/memory/`:
- `ux-v4-system.md` — the screen model and surface system; **nav deliberately
  unchanged**
- `orchestrator-north-star.md` — the north star, and that paid media was
  reinstated after initially being deferred
