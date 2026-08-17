# Kepler — what it is, what it does, where it stands

**Written:** 2026-08-13 · **Branch:** `staging` · **Last commit:** `a77731b`
**Verified against:** the code, the migration list, the connector registry and the test suite — not against the older docs, several of which are stale (see §10).

No code in this document. It is the product picture: the idea, the vision, the
functionality as it exists today, and an honest account of what is live, what is
built-but-not-switched-on, and what is not built.

---

## 1. What Kepler is

**Kepler is the place a marketer runs the whole of marketing from — the one
surface where a goal, the work done against it, and the outcome it produced are
the same object.**

A team creates a **workspace** per brand. Kepler builds a structured **brand
intelligence** model of that brand from its website, uploaded documents and
guided input. Every module downstream — SEO/AEO, ads, outreach, social,
campaigns, measurement — works from that model, so the output is grounded in
that specific business rather than generic.

On top of that sits the part that makes it a system rather than a toolbox: the
user sets **account goals**, campaigns ladder to goals, assets ladder to
campaigns, outcomes flow back up through attribution, and generation reads the
goal on the way back down. Nothing is an orphan.

### The one-line version

> A multi-workspace marketing platform where a shared brand-intelligence core and
> a user-defined goal feed specialist AI modules, orchestrated by a campaign
> spine, measured through UTM attribution and scheduled change detection, and
> continuously improved by a feedback loop.

### Who it is for

The **generalist orchestrator** — the marketer of record for a lean go-to-market
team or a small agency. They do not own every wing: paid may sit with an agency,
content may be freelance, the CRM belongs to sales. They coordinate all of it and
they are answerable for the number at the end.

Kepler is deliberately **not** trying to be the best SEO tool, the best
sequencer, or the best ad platform. Each of those wings has a better point tool
and always will. What no point tool can do is show one campaign's contribution
across paid + SEO + outreach + social against a single stated goal. That is the
job.

---

## 2. The vision

### North star (stated 2026-08-08)

> Any marketer on the team lives in Kepler as an orchestrator across all wings,
> working from insights and measurable outcomes that come from **real data
> flows** — not AI estimating what the data would say.

This inverts what the product originally was. Kepler began as a generation tool
with measurement bolted on. The north star puts insight and outcome first, with
generation as one of the actions dispatched from it.

### The correction that shapes everything

An earlier version of the strategy argued that generation is episodic — you
produce a batch of blogs and you are done for a week — and therefore cannot drive
return, so it should be demoted. **That was wrong, and the roadmap says so
explicitly.**

Generation is episodic *when it is orphaned*. Tied to a standing goal with a
measurable gap, it becomes continuous: the gap pulls the next asset. Generation
is the loop. It just needed closing at both ends.

```
Account goal          ← the thing everything ladders to
   └── Campaign       ← carries the goal
         ├── Asset    ← generation CONSUMES goal + campaign + prior work + real search data
         └── Metrics  ← flows BACK up, and back down into the next generation
```

### The defensible position

Every wing tool shows its own wing. Meta shows Meta, Google Ads shows Google, GA4
shows sessions, the CRM shows deals. Only Kepler can say *this campaign, across
paid + SEO + outreach + social, produced this outcome against this goal*. The
moat is the closed loop built from **your** accumulated outcomes — which is the
one thing a competitor cannot copy by shipping the same feature list.

### The bar

Declared 2026-07-11 and still governing: build to **acquisition-grade /
category-default** standard. No convenience shortcuts (no integration
aggregators, no stub-forever, no test-mode auth). Where a shortcut already
exists, retire it rather than build on it.

---

## 3. The principles the product is actually built on

These are not slogans; each one settled a real argument and each one is visible
in the behaviour of the app.

**1 · Connectors are pure upside.**
Every module works AI-only with zero connectors — a team can sign up and produce
real output immediately. Connecting a source (Search Console, GA4, a CRM)
*grounds* that module in live data instead of estimates. Connectors are an
enhancement layer, never a dependency. Enforced architecturally, not by
convention.

**2 · Scaffold, not cage.**
Every structured input accepts a user-defined escape hatch. The taxonomy Kepler
derives is a strong default, never the limit — goal measures, campaign types,
channels, ICP attributes, content types.

**3 · Structure is universal, math is conditional.**
Anything a user creates can be laddered to and organised by. Only things bound to
a measurable source get progress bars, forecasts and automated recommendations. A
free-text goal is a real goal that organises real work; it just doesn't get a
forecast, and it says so.

**4 · Rent commodity, own scarcity.**
Don't build inbox warmup or enterprise AEO monitoring — those are $50–100/month
commodities. Do pursue LinkedIn Marketing Developer Platform partner status,
which is gated, hard to obtain, and an asset once held.

**5 · Honesty is a feature, and it is enforced in code.**
This is the most distinctive thing about Kepler and it runs through every
surface:
- No goal → no goal block in the prompt. Never a "grow the business" stand-in.
- A target is an *intent* and may always be stated; achieved/forecast figures are
  *claims* and appear only when the projection actually produced them.
- One reading is never a change. A percentage against a zero base is null, not
  +100%.
- A lost citation is reported as loudly as a gained one, and sorted first.
- Change events say "alongside", never "because" — correlation stated as
  correlation.
- Channel share is computed over the *whole* picture, never the attributed slice
  (dividing Kepler's work by Kepler's work turns 20% into 44%).
- **No cross-channel efficiency, ever.** Nothing assigns a production cost to
  organic, so "your Meta CPA is 3× your SEO CPA" is not a sentence Kepler can
  honestly say. That refusal is permanent.
- Where Kepler cannot compute something, it says which thing is missing rather
  than degrading silently.

**6 · A stored derived number is a stale number.**
Recommendations are computed on read, never persisted. Anything that is a pure
function of goals, campaigns and their latest readings stays that way. Schedules
exist to notice change, not to cache answers.

---

## 4. How the product is organised

### The unit of everything: the workspace

One workspace = one brand = the tenancy and isolation boundary. Users belong to
workspaces with a role (owner/member). Every piece of data in the system is
workspace-scoped and protected at the database layer.

### The navigation map (current, post-restructure)

```
Dashboard                                     ← the goal cockpit
Goals
Campaigns ▸ All campaigns · Calendar
SEO & AEO ▸ Pipeline · Opportunities · AI Visibility
Social Media
Ad Creative
Outreach ▸ Replies · Sequences · Audiences · Research
Library
Measurement
Brand Intelligence ▸ Overview · Business Details · Competitors · Audience & ICP · Files
Integrations · Settings · Help Center
```

Modules carry **readiness gates** — most unlock once brand context and at least
one ICP exist, so a new workspace is walked forward rather than dropped into an
empty app. A governing rule was applied when this map was built: *build nav where
the functionality exists.* Screens are not shipped empty to match a diagram.

---

## 5. Functionality, module by module

### 5.1 Brand Intelligence — the core

The foundation every other module reads from.

- A tabbed identity model: overview, colours, tone, values, aesthetics, business
  details, competitors, ICPs, files.
- **Population engine** — scrapes the brand website and parses uploaded documents,
  then runs isolated per-section AI passes (overview, tagline, tone,
  values/aesthetic, business details, colour identity). Isolated deliberately:
  one section failing does not lose the rest, and each is retryable.
- **Colour identity** extraction (primary/secondary/accent/dark/light/text plus a
  typography direction), which is what makes generated carousels genuinely
  on-brand.
- **Competitor discovery** and **ICP discovery** — AI proposes, the user confirms
  or edits. Suggestions sit in a pending queue rather than silently mutating the
  brand.
- **ICP targeting block** — the ICP is no longer only messaging-complete; it now
  carries the fields ad targeting actually needs.
- **Provenance** — every field tracks whether it came from manual input, the
  website, a file or AI.
- File intelligence: documents land in a private store, text is extracted, and
  each file can be included in or excluded from analysis.

### 5.2 Goals — the spine

The rung that did not exist until recently and that everything now ladders to.

- An account-level goal object with a measure, a target, a deadline, checkpoints,
  target history and links between goals.
- **A feasibility engine that proposes the target instead of asking for one on a
  blank field.** It derives a reachable range from the account's own rates — and
  guards the two risks that creates: a cold-start account returns *unknown*, never
  zero; thin evidence *widens* the range rather than pretending to precision
  (±50% at one reading, tightening to ±15% at four over two weeks).
- Campaigns ladder to a goal; progress accrues across campaigns rather than
  resetting with each one.
- A primary goal is what standalone generation falls back to when an asset is
  produced outside any campaign.

### 5.3 Dashboard — the goal cockpit

This screen replaced the old KPI dashboard outright, and the reasoning is worth
keeping: **every card must answer one of three questions — what changed since I
last looked, what needs me now, what should I do next.** A card that merely
reports current state does not belong, because reporting does not create a reason
to return. That filter is what deleted the KPI strip, the campaign table and the
activity feed.

Six zones:

| Zone | What it does |
|---|---|
| **Goal hero** | Progress, forecast, the gap in real units, days remaining, and what moved |
| **Needs you** | Five row types of work waiting on a human — all from state the system already writes |
| **Recommended next** | What work would close the gap, and the working behind it |
| **Funnel** | Five stages with sparklines and honest empty stages |
| **Channel contribution** | Contribution by *what Kepler produced* × *where the outcome came from* |
| **Other goals** | A quiet strip, with "make primary" |

### 5.4 Campaigns — the orchestration layer

- A campaign is a goal + an AI-generated strategy + ordered steps mapped to
  modules.
- Plan view and a cross-campaign calendar/timeline.
- Each step deep-links into its module with the brief pre-filled, and every asset
  generated from a step carries the campaign id — which is what makes rollup and
  attribution possible at all.

### 5.5 SEO & AEO

**Pipeline** — a keyword research pipeline (discover → expand → classify intent →
score → geo-check → validate → filter → rank) producing 30–50 keywords with
intent, tier, cluster and geo type. Metrics are marked *estimated* until Search
Console is connected, at which point real query performance merges in. Blog
generation (title, intro, sections, CTA, meta description) with a de-AI humanize
pass, an AEO citability score, and deterministic technical SEO output (sitemap,
robots, URL rules).

**Opportunities** — a Search Console operator loop: real query data turned into
things worth acting on.

**AI Visibility** — scanning what answer engines say about the brand, per prompt
per surface, and tracking citations gained and lost.

### 5.6 Outreach

**Replies** — the reply inbox. Reply, out-of-office and bounce detection feeds an
actionable screen rather than a read-only panel.

**Sequences** — cold sequences (multi-touch, per-channel) and lifecycle flows
(welcome, onboarding, re-engagement, win-back, upgrade), with personalization
tokens for unknowns, banned-phrase validation and per-channel length rules
enforced in code. A send engine exists behind this: enrollments, scheduling,
domain verification, suppression, and an approval gate before anything sends.
Editing a running sequence demotes it for re-approval — and now says so loudly,
which fixed a bug where a customer's outreach could stop silently.

**Audiences** — prospect lists, saved prospects and net-new people search in one
place, with bulk selection, list membership, enrichment and CRM push.

**Research** — account-based research: grounded company/account research runs
that are persisted and re-readable, with exportable reports.

### 5.7 Ad Creative

Config by campaign type, platform, ICP and budget/goal. Live competitor ad
intelligence pulled from the Meta Ad Library, AI-analysed into a differentiation
brief. An 8-angle variant engine (pain, outcome, social proof, curiosity,
comparison, identity, contrarian, urgency), platform character limits validated
in code, and a buying-committee targeting helper.

### 5.8 Social Media

A calendar planner (weeks × posts per week × platforms) with a rotated angle pool
so nothing repeats, platform-specific specs, voice modulation (company / founder
/ team), and carousel generation rendered from the workspace's own colour
identity.

### 5.9 Measurement

- Per-campaign **UTM identity** — the campaign id is embedded in the tag and
  survives renaming, which is what makes "Kepler produced this" a *known* fact
  rather than an inference.
- GA4 pulls attributed by campaign; CRM pulls attributed through the same stamp.
- Point-in-time snapshots so history accrues and trends become possible.
- **Channel detail** — the drill level between the cockpit and a campaign. It is
  goal-scoped and channel-shaped: SEO shows impressions and position, outreach
  shows sends and replies, paid says plainly that spend is not measured. A single
  table with columns for all three would be mostly blank for each, which reads as
  missing data rather than as a different kind of thing.

Drill path: `cockpit → channel detail → campaign → asset`.

### 5.10 Library

Every generated asset in one browser — type filter, search, status, and
deep-links back to the source module.

### 5.11 Integrations

The connector grid with real connection states, scope visibility, and per-
workspace connect/disconnect.

**User-connectable (12):** Google Search Console · Google Analytics 4 · Google Ads
· Meta Ad Library · Meta Ads · Facebook & Instagram Pages · LinkedIn · HubSpot ·
Salesforce · Zoho CRM · Apollo · WordPress.

**Platform-managed answer-engine surfaces (4):** Perplexity · OpenAI · Anthropic ·
Google AI Overviews.

Adding a connector is a registry entry plus one adapter — there is no bespoke
integration code per provider.

### 5.12 Supporting

Onboarding (workspace → brand → files → launch), profile and account settings,
help centre, a command palette, and an events/notifications surface.

---

## 6. The cross-cutting systems

These are the parts that are not a screen but define how the product behaves.

**The AI gateway.** Every model call in the product goes through one server-side
gateway to Google Vertex AI (Gemini). No key ever reaches the browser. The
gateway enforces authentication, a per-user rate limit, a single-model allowlist,
and cost ceilings on output tokens, message count and content size.

**JSON robustness, centralised.** LLM JSON is fragile. Kepler handles it in
exactly one place — fence stripping, span extraction, trailing-comma repair,
truncation repair, then a single strict retry with a larger budget. No module
ever writes its own.

**Goal-grounded generation.** Generation reads four legs, in a stated order of
authority: **goal** (what a win means) → **campaign** (the angle) → **prior work**
(what not to repeat) → **signals** (real Search Console demand and answer-engine
gaps). Every leg but the brand degrades softly — a missing goal or an unreachable
Search Console removes a paragraph and nothing else, because grounding that can
sink a generation fails on exactly the days a user most needs output. Provenance
is stored on the asset and rendered on screen, because a grounding claim nobody
can inspect is a marketing sentence.

**The feedback learning loop.** Every generated asset carries a 1–5 rating;
anything below 3 requires an improvement note. Those notes are injected into the
next generation in that module and surfaced back to the user so they can see what
is shaping the output. Prompt-level learning, no fine-tuning.

**Anti-fabrication.** System prompts forbid inventing metrics and claims, but the
enforcement is code-side: character limits, banned-phrase detection, confidence
flags, and personalization tokens left as placeholders rather than filled with
invention.

**Change detection.** Four detectors run on a schedule and compare readings
rather than reporting levels: campaign and account metrics, Search Console
queries, answer-engine visibility per prompt × surface, and outreach replies and
meetings. The rules are mostly refusals — both an absolute and a relative floor
must clear, one reading is never a change, a lower search position is a *gain*,
and silence is a valid result. A manual "check for changes" path shares a dedupe
key with the scheduled one, so a feature does not depend on an ops task to exist.

**Continuous goal recommendation.** Kepler re-reads the gap as data accrues and
proposes the portfolio of work that would close it — sized entirely from *this
account's own campaigns*, never an industry benchmark. Below three measured
campaigns it refuses to size at all and says so. The working renders at full
weight beneath the claim, because a recommendation nobody can argue with is a
horoscope. One click turns a recommendation into a campaign already parented to
the goal.

**Attribution spine.** UTM identity per campaign → GA4 by campaign → snapshots →
channel contribution → CRM records. The chain that lets a goal, work and outcome
be the same object.

**Security.** Row-level security on every table via workspace membership; secrets
(refresh tokens, credentials) invisible to the browser entirely — only server
functions can read them; the app refuses to boot if a forbidden secret is present
in the client bundle; database-level rate limiting; a CORS allowlist; path-scoped
private file storage; and short-lived tokens for AI access.

**Instrumentation.** Usage events are recorded so decisions about what to build
next can eventually be made on evidence rather than assumption.

---

## 7. Where we stand — the honest read

### 7.1 Live and working

- The app is deployed to staging, auto-deploying on push. Frontend and backend
  both ship from one branch.
- **435 automated tests across 28 files, all passing.** Production build clean.
  CI runs tests and build on every push.
- The **entire goal spine is closed in both directions**: goals with a feasibility
  engine → campaigns laddered to goals → generation that reads the goal →
  outcomes measured back up → the goal asking for more work when it slips.
- Brand intelligence, SEO/AEO, ads, social, outreach drafting, prospecting,
  research, campaigns, library, measurement and the cockpit are all built and
  functional.
- 12 connectors are connectable; Search Console, GA4, Meta Ad Library, Apollo,
  the CRMs and WordPress are functional end to end.

### 7.2 Built but not switched on

This is the most important section, because the gap between the repo and the
running system is currently the single biggest lever in the product.

| Thing | State | Effect while off |
|---|---|---|
| **Change-detection table + schedule + function** | Code-complete, **not deployed** | Detection is inert in production — including the manual button. The cockpit hero can only report that nothing moved. |
| **Channel-source split in two server functions** | Code-complete, **not deployed** | New snapshots carry no source dimension; the channel table says so. |
| **Goal-drift event support** | Code-complete, **not deployed** | Goal standing changes are rejected. Must be applied *after* the detection table. |
| **The email sender** | Deployed but **deliberately unarmed** | Sequences schedule and enrol but nothing sends. Arming it is two secrets — and once armed it sends real email every five minutes for any approved sequence. |

All the deployment items are blocked on **one expired backend access token**. The
automated backend deploy pipeline fails at authentication; deploys are manual
until it is rotated. Four epics of finished work are sitting behind it.

### 7.3 Connectable but inert

- **Paid media.** Google Ads and Meta Ads connect, but no code fetches a single
  spend or performance metric. The paid leg is the largest hole in the
  orchestrator story, and it carries external lead time (see below).
- **Answer-engine visibility on a schedule.** The scanner works manually, but
  nothing triggers a scan, so on an account where nobody presses Scan there is
  never a second run to compare — the visibility detector is permanently silent,
  correctly but uselessly. Scheduling it spends money per workspace per day, so
  it is a deliberate open decision rather than an oversight.

### 7.4 Gated on third parties

Nine approvals across Google, Meta and LinkedIn stand between the current build
and: Google Ads data (developer token), Meta Ads data (app review), social
publishing (LinkedIn MDP — the hardest gate, and the outcome is not in our
control), and mailbox sending. **This is the critical path and none of it is
engineering.** It should be running in parallel with everything else.

### 7.5 Not built

- Performance data feeding back into the *next* brief (the full closed loop). It
  is the most valuable and least certain item in the plan, deliberately held
  until usage evidence exists, and it should be validated on ads — which report
  in days at creative level — not on content, which takes months to rank.
- Organisation-level tenancy, invites, member management and per-actor
  attribution. This blocks learned campaign shapes and the activity surface.
- The revenue picture with an honest cut line.
- Paid ingestion, ad push, targeting validation, audience sync, social
  publishing, social performance.
- The library as a corpus you build on, rather than an archive you avoid
  repeating.
- Competitor enrichment and standing observations; the composite opportunity
  engine; making the accumulated learning legible.

### 7.6 In flight right now (uncommitted)

A visual direction pass. The direction is locked to a single reference system
(violet/cool light, grouping by shadow rather than hairlines — the same hue
family as the current accent, so it is a shift of identity rather than a
replacement). A dev-only design lab, two candidate theme layers and a form layer
inside the real cockpit components exist on disk. A per-zone Dashboard mapping
spec is written.

**Its blocker:** the demo dataset seeds zero goals, so the goal hero, the
recommendation card and the other-goals strip can only be exercised in their
cold-start states. Seeding a measured goal with metric history is the
prerequisite for finishing that work.

Worth stating plainly: a token re-skin is not a design. The value of a reference
is its component anatomy, and where a reference's form and a Kepler product rule
disagree, the rule wins and the form bends. Four zones were rejected outright
because the reference has no analogue for them.

### 7.7 Known debt, named

- The codebase has good bones with one specific disease: **decisions get ~80%
  executed and the last 20% is left as documented residue** — undeployed
  migrations, unnumbered merges, compat aliases, and columns designed but never
  written. It is annotated debt, not hidden debt, which is why it is findable and
  cheap to close.
- Two of the largest module screens want decomposition.
- ~56 non-runtime lint issues are an accepted baseline; CI deliberately gates on
  tests and build rather than lint.
- A few known naming traps: a legacy free-text goal column alongside the real
  goal parent; a reply field named "snippet" that actually holds the subject.

---

## 8. What's next, in order

1. **Deploy what is already written.** One token rotation unblocks four epics,
   two of which are inert in production without it. Nothing else on this list is
   worth more per hour.
2. **Start the platform approvals programme.** Weeks of external lead time gate
   four epics. It is paperwork, and it is the critical path.
3. **Library as corpus** — the last cheap upgrade to generation quality, turning
   "don't repeat these" into "build on these".
4. **Revenue picture** — the funnel's revenue stage currently ends at a number
   with no honest cut line behind it, and goal sizing against revenue needs it.
5. **Outreach warnings** — the remaining half of the trust surface.
6. **Tenancy** — unblocks learned campaign shapes and stops per-actor attribution
   being designed-but-unwritten.
7. **The closed loop**, once usage evidence exists to justify it, validated on
   ads first.

---

## 9. Open questions

These are genuinely undecided, and each one changes design:

1. **Is there real usage data?** There is no product analytics history and no
   customer research in this repo. Cadence assumptions are derived from what the
   data *can* change, not from what users *do*. Instrumentation now exists to fix
   this — it needs time to accrue.
2. **Do goal-grounded briefs actually produce better assets?** Plausible,
   unproven, and worth an A/B before committing to the full closed loop.
3. **Is the marketer really one generalist across all wings?** If they are
   specialists, "orchestrator" means routing and handoffs — a materially different
   product.
4. **Out-of-app nudges** (email/Slack digest) — accepted as valid, explicitly
   deferred. In-app only for now.
5. **Should the visibility scanner run on a schedule?** It spends money per
   workspace per day whether or not anyone is looking.

---

## 10. A note on the other docs

- `docs/ROADMAP.md` is the canonical strategy and screen-specification document.
  It is current in intent; its information-architecture diagrams predate the
  restructure.
- `docs/HANDOVER.md` is the most accurate account of recent execution and the
  deployment backlog.
- `docs/RETENTION-MODEL.md` is the research this whole direction rests on.
- **`docs/PRODUCT.md` is stale.** It describes the system as of July 2026 —
  before goals, goal-grounded generation, the cockpit, change detection,
  continuous recommendation and the navigation restructure. Its architecture,
  security and AI sections remain accurate; its module list, table count and
  roadmap do not.
- `docs/CONTEXT.md` is older still and describes a five-module product with a
  different design system.
