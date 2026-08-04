# Kepler SEO/AEO Quality Rehaul — Build Spec

**Status:** DRAFT for review · 2026-07-25 · owner: Aditya
**Supersedes:** the SEO/AEO quality assumptions in `docs/PRODUCT.md`; slots alongside `docs/ROADMAP-HANDOFF.md` (which parked AEO visibility at "R3").
**Scope:** raise the *quality of work* Kepler's SEO/AEO module produces. Not a wedge/GTM re-decision (see §8).

> This is a spec, not a mandate. Every workstream carries an honest cost and defensibility tag so we can cut or resequence with eyes open. Nothing here is built yet.

---

## 1. Thesis — the one root cause

**Today Kepler's SEO/AEO module is a well-crafted writer that is blind and has no scoreboard.**

The craft layer is genuinely good and worth keeping: anti-fabrication rules, a humanize pass, a banned-phrase scan, and a quality gate that re-drafts anything scoring below 80. But that craft sits on top of two structural holes:

1. **No eyes.** Every generation call is closed-book against a short brand blurb. No live SERP, no People-Also-Ask, no competitor page content, no real keyword volume/difficulty, no sales-call language. The grounding plumbing *exists* (`callAI(..., { grounding: true })`) and is proven in `abmResearchService.js`, but **no SEO/AEO service turns it on.**
2. **No scoreboard.** Nothing measures whether the work ranks or gets cited, then feeds it back. The AEO visibility scanner is *designed* (`campaign_metrics` provider `'aeo'` is socketed) but the `visibility-scanner` edge function **was never written**; every provider is `configured: false`.

**The reframe:** the rehaul is not "better prompts." The writing craft is the commodity part (our own discovery: generation is weekend-clonable in every channel). The quality delta lives in **what feeds generation** (real data in) and **what happens after** (measurement out). That is our committed *generate → measure → learn* spine, applied to output quality.

Every one of the 8 source articles and the PDF is really telling this same story.

---

## 2. Evidence base — the operative lesson from each source

| # | Source | The operative lesson we're encoding |
|---|--------|--------------------------------------|
| 1 | Reddit catching 25k fake posts/day | Mentions are AEO currency, but the fake-seeding shortcut has a short "citation half-life." Build a **durable, disclosed-SME mention strategy**, never a fake-post generator. |
| 2 | ChatGPT decoupling from Google → Bing | AEO is engine-specific and unstable. **Bing indexation (IndexNow)** now matters for ChatGPT visibility; treat "which engine pulls from which index" as data, not a constant. |
| 3 | babylovegrowth.ai academy | A competitor gives away the full AEO curriculum free (per-engine citation playbooks, llms.txt, structured data for AI, GEO-readiness checklist, 100-day plan). This is now **table stakes**, not a differentiator. |
| 4 | Claude + GSC "SEO operator" (Distribb) | The real value is **operating on your own live data**: pages ranking 11–20 worth fixing, content decay, CTR gaps, cannibalization, dead pages → prioritized plan → rewrite w/ before-after diff → approve → publish. |
| 5 | "5 SEO fixes in an afternoon" | High-leverage work is **small deterministic recipes** on existing pages: internal links, meta-title = exact keyword, FAQ block, refresh dates/stats. |
| 6 | McKinsey frameworks as skills | The value was never the framework — it's **operationalizing methodology under structure**. Our services *claim* to "port the skill" but only inline prose. Make the workflows genuinely methodology-driven and data-fed. |
| 7 | pSEO with buy-intent (20.3M clicks) | **Money keywords only** (alternatives / vs / pricing / reviews / free-trial) with **empirical asset routing** — and the intelligence to **know when *not* to publish** (recommend a placement, not a page). |
| 8 | Breaking B2B 90-day PDF (Sam Dunning) | The spine: money keywords first (95/5 rule) → SERP-informed page-type choice → out-teach the top 3 → technical hygiene → no-budget backlinks → ship-rank-improve → convert-focused design → **sales-call language mining** → leading/lagging indicator tracking. Mass-produced AI content is dead. |

**Local skill library** (`~/Desktop/Automation Skills/AD Skills/marketingskills-main/skills/`) is the authoritative methodology spec for the build — especially `ai-seo`, `seo-audit`, `programmatic-seo`, `schema`, `content-strategy`, `public-relations`, `customer-research`. Quantified levers to encode from `ai-seo` (Princeton GEO, KDD 2024): cite sources **+40%**, statistics **+37%**, quotes **+30%**, authoritative tone **+25%**, keyword-stuffing **−10%**. Citation share by content type: comparisons **~33%**, definitive guides **~15%**, original research **~12%**.

---

## 3. Current-state ground truth (file-anchored)

Verified live against the codebase on 2026-07-25.

**Module & services**
- UI: `src/pages/workspace-modules/SeoAeo.jsx` (+ `.css`), registered as `seo-aeo` under the `studio` parent in `src/constants/moduleRegistry.js`.
- Services: `keywordResearchService.js`, `blogPipelineService.js`, `aeoScoreService.js`, `brandContextService.js`, `humanizeService.js`, `contentService.js`, `integrationService.js`.
- Technical SEO (deterministic, no AI): `src/lib/technicalSeo.js`.
- AEO measurement (separate, under Measurement module): `Measurement.jsx` `renderAiVisibility()`, `src/services/visibilityService.js`, `src/lib/visibility.js`, `src/services/measurementService.js`.
- All AI → one proxy (`supabase/functions/ai-proxy`) → **Vertex Gemini 2.5 Flash** (single model; `FREE_MODEL_FALLBACKS` naming is legacy). Grounding path in `src/services/aiClient.js` ↔ `ai-proxy/index.ts`.

**What's real**
- Keyword generation, 5-step blog pipeline (outline → draft → humanize → review → one gated re-draft → AEO score), deterministic AI-detection metrics, AEO scorer rubric, deterministic sitemap/robots.
- **Exactly one real data connector: Google Search Console** — live via `oauth-proxy` `gscQuery` (28-day, `dimensions:["query"]`, top 100). Used *only* to seed/merge keywords by exact-lowercase term match (`SeoAeo.jsx`). A second cron path (`_shared/googleData.ts`) feeds aggregate totals to `metrics-snapshot`.
- Grounding is wired end-to-end and proven in `abmResearchService.js`.

**What's stub / absent**
- **No grounding in any SEO/AEO service** — keyword ideas and blog "facts" are pure model recall.
- **No SERP / volume / difficulty data.** Grep-confirmed: no Ahrefs / SEMrush / SerpAPI / DataForSEO / Moz anywhere. `computeOpportunity` (`keywordResearchService.js:57`) is dead code until this lands.
- **No GSC operator analysis** — the 11–20 / decay / CTR / cannibalization / dead-page moves are all missing though the data already flows.
- **No competitor/own-page reading for SEO.** `websiteIntelligenceService.js` fetches pages via Jina Reader but only for brand population.
- **No CMS publish path.** Blogs are copy-paste only; the only real publishers are LinkedIn/Meta (social). Sitemap URLs are synthetic — nothing is ever published there.
- **AEO measurement is 0% live.** `visibilityService.js:32-40` — all providers `configured:false`, `ask()` throws `not_configured`; `visibility-scanner` edge fn never written. Only `mock` mode produces answers (honestly labelled "Sample data").
- **Schema is thin** — `buildSchema` emits only BlogPosting + FAQPage, author always `Organization`.
- **Self-grading on one cheap model** — draft, review ("strict editor"), and AEO score all run gemini-2.5-flash with thinking disabled.
- **"Skills" are prose comments**, not loaded files (`campaignPlan.js`: "no runtime skill files exist in this repo").

---

## 4. Design principles (locked)

1. **No shortcuts** (north star). No fake-post/mention generators, no fabricated metrics, no AI-bait chunking. Honest-when-blind beats confident-and-wrong — the existing anti-fabrication posture is a feature; extend it.
2. **Real data in, or say so.** Every quality claim ties to a real signal (GSC, live SERP, real page content, real prices, real customer language) or is explicitly labelled an estimate.
3. **Buy-intent first.** Money keywords and decision queries lead; top-funnel volume-chasing is deprioritized (95/5 rule; AI is killing thin top-funnel).
4. **Know when not to publish.** The module must be able to recommend *no page* / *a placement instead* — a differentiator per source 7.
5. **Integrate, don't out-build, at ~85%.** SERP/volume data → a vendor API (DataForSEO/SerpAPI), not a homegrown crawler. Reserve build effort for the seams (GSC operator logic, measurement loop, learn loop).
6. **Reuse the spine.** Grounding = the two-call pattern already in `abmResearchService`. Measurement = `campaign_metrics` provider `'aeo'`. Learning = the `getGuidance` feedback-loop injection. New connectors = the registry+adapter pattern. No net-new plumbing where the seam already exists.

---

## 5. The six workstreams

Each: **Goal · Sources · Current code · Changes (file-level) · Cost · Defensibility · Definition of Done.**

### WS1 — INPUT: ground everything in real data  *(highest ROI)*

**Goal.** Give the writer eyes. Three sub-tracks, in cost order.

**WS1a — GSC operator loop** *(cheapest, biggest immediate lift — data already flows)*
- Sources: 4, 5, 8 ("Super Quick #1 Win").
- Current: GSC pulled only to seed keywords (`SeoAeo.jsx` `pullGsc` → `integrationService.query`).
- Changes:
  - New `src/services/seoOperatorService.js` computing, from the GSC query+page rows already returned: **striking-distance** (position 11–20 with impressions above a floor), **content decay** (needs the 2-window GSC compare — extend `oauth-proxy` `gscQuery` to accept a date range and add a prior-period pull), **low-CTR-for-position** outliers, **cannibalization** (>1 page for one query), **dead/zombie pages** (impressions, ~0 clicks).
  - New "Opportunities" view in `SeoAeo.jsx` rendering a prioritized, plain-English action list ("12 pages one push from page 1").
  - Extend `oauth-proxy` `gscQuery` to also request `dimensions:["page"]` and `["query","page"]` for the cannibalization/decay joins.
- Cost: **S–M.** No new vendor, no new secret. Mostly analysis code over data we already fetch.
- Defensibility: medium — it's the operator experience the source articles sell, on data most tools don't wire into generation.
- DoD: from a connected GSC, the module lists ≥5 concrete, ranked opportunities with the underlying numbers, no fabrication.

**WS1b — turn on grounding** *(cheap-ish; not a flag flip)*
- Sources: all; `ai-seo` skill.
- Current: `useJson = json && !grounding` (`aiClient.js:286`) — grounding ⊥ forced-JSON on Vertex. So each JSON-producing service must become **two calls**: (1) grounded prose research (live web) → (2) non-grounded JSON structuring. Pattern already implemented in `abmResearchService.js`.
- Changes: refactor `keywordResearchService.generate` and `blogPipelineService` outline/draft stages to the two-call shape; add a shared `groundedResearch()` helper so we don't re-implement per service.
- Cost: **M.** Per-service refactor + extra token spend per generation.
- Honest caveat: Gemini `googleSearch` grounding gives *real web retrieval*, **not** rank/volume/difficulty. It fixes "made-up facts" and "doesn't know what's out there," not "no metrics." That's WS1c.
- Defensibility: low on its own (anyone can flip it) but it's the floor for everything above it.
- DoD: blog drafts cite real, currently-live sources; keyword ideas reflect real SERP reality, not model recall.

**WS1c — real keyword metrics (SERP connector)** *(integrate, don't build)*
- Current: volume/difficulty forced null; `computeOpportunity` dead.
- Changes: add a `dataforseo` (or `serpapi`) adapter via the connector registry + a new `keyword-metrics` proxy path; inject real volume/difficulty into `normalizeKeyword`, flipping `metricStatus:'measured'` and activating `computeOpportunity`.
- Cost: **M** + ongoing $ (paid API). Requires a user-provisioned key.
- Honest caveat: this is the "platform data chokepoint you don't control" flagged in discovery. It's real value but it's the least defensible spend — hence integrate, gate behind the user's own key, degrade gracefully to estimated.
- DoD: keywords show real volume/difficulty and a live opportunity score when a key is present; identical honest-estimate behavior when absent.

**WS1d — read real pages (competitor + own)**
- Sources: 8 (competitor analysis, out-teach the top 3), 4 (audit own pages).
- Current: `websiteIntelligenceService.js` Jina Reader used for brand only.
- Changes: generalize it into a page-teardown helper the operator loop (WS1a) and buy-intent router (WS2) call to read the actual top-ranking pages for a target query and the user's own page being refreshed.
- Cost: **S–M.** Reuses Jina; watch rate limits.
- DoD: for a target query, the module summarizes what the current top 3 pages cover and the gaps to beat them.

### WS2 — DECIDE: buy-intent engine + asset router

**Goal.** Reorder around money keywords and add the "what asset, or none" decision.
- Sources: 7, 8.
- Current: keyword service is intent-aware (`INTENT_VALUE`, tiers) but every keyword funnels to "write a blog"; no asset routing, no "don't publish."
- Changes:
  - Bias `buildKeywordPrompt` toward decision queries (alternatives / vs / pricing / reviews / free-trial / best-[niche]-for-[ICP]) and surface them as a distinct "Money Keywords" tier in the UI.
  - New `assetRouterService.js` encoding source 7's empirical rules: *alternatives* → 84% of winners are third-party listicles → recommend a **placement/PR play**, not a page; *X vs Y* → build it yourself; *pricing* → one strong page (don't split); *reviews* → win off-site; low-signal → **recommend not publishing.**
  - Router output feeds WS5 (publish) and WS4 (mention strategy) — a page, a placement recommendation, or a "skip."
- Cost: **M.**
- Defensibility: medium-high — the "knows when not to publish" behavior is a genuine differentiator vs. volume-spam tools.
- DoD: given a money keyword, the module recommends a specific asset type *or* a non-page play *or* skip, with the empirical rationale.

### WS3 — GENERATE: raise the craft ceiling

**Goal.** Make the output methodology-driven and deeper.
- Sources: 6; local skill library; `ai-seo` Princeton levers.
- Current: strong craft, but inlined prompts, thin schema, self-grading on one cheap model.
- Changes:
  - **Operationalize methodology** — port the real `ai-seo` / `seo-audit` / `content-strategy` steps into the multi-step pipeline (structure blocks per query type, E-E-A-T signals, freshness), fed by WS1 data at each step. Keep the humanize pass.
  - **Schema depth** — extend `buildSchema` beyond BlogPosting+FAQPage to Article / HowTo / BreadcrumbList / Product as appropriate, with real author `Person` + credentials (E-E-A-T), not always `Organization`. (Cross-reference the local `schema` skill.)
  - **Stronger judge** — move the review + AEO scoring off the same cheap self-grader: either a stronger judge model or a grounded review. Encode the Princeton levers into `aeoScoreService` so the rubric is research-backed, not vibes.
  - **Sales-call language** (source 8, step 8) — add an optional ingestion point for real customer/sales language into `brandContextService`, mirrored into copy. (No transcript store today — see Open Decision O3.)
- Cost: **M–L.**
- Defensibility: low-medium (craft is commodity) but necessary to clear the "not AI slop" bar.
- DoD: generated pages carry appropriate schema + author E-E-A-T, pass a non-self-graded review, and reflect the WS1 grounding.

### WS4 — PRESENCE: AEO done the durable way

**Goal.** Be where AI looks — technically and authentically.
- Sources: 1, 2, 3; `ai-seo` skill.
- Current: none of this exists (technical SEO is sitemap/robots only).
- Changes:
  - **Per-engine technical readiness**: generate `llms.txt` and `/pricing.md` machine-readables; a robots.txt **AI-bot gate** audit (GPTBot, PerplexityBot, ClaudeBot, Google-Extended, Bingbot); **IndexNow/Bing** submission helper (source 2 makes Bing indexation matter for ChatGPT). Extend `lib/technicalSeo.js`.
  - **GEO-readiness checklist** (from `ai-seo`): extractable answer blocks (40–60 words), comparison tables, FAQ from real objections, freshness stamps.
  - **Durable mention strategy** (source 1): a **mention-surface finder** — surface real Reddit/Quora/community threads and journalist requests where a *disclosed, genuinely helpful* answer belongs, and draft that answer with disclosure. Never posts autonomously; never fabricates neutrality. (Cross-reference local `public-relations` skill.)
- Cost: technical readiness **S–M**; mention finder **M** (needs a discovery source — Reddit/Apify search).
- Defensibility: technical = low (table stakes per source 3); mention-done-right = medium and on-brand for the no-shortcuts posture.
- DoD: the module outputs a GEO-readiness report + machine-readable files, and a *human-in-the-loop, disclosed* mention plan — no auto-posting.

### WS5 — PUBLISH: close the gap

**Goal.** Get content to a real URL so the loop can close.
- Current: no CMS publisher; the only publishers are LinkedIn/Meta.
- Changes: add a CMS connector (start with **WordPress** REST — largest B2B footprint; then Webflow/Ghost) via the connector registry, mirroring the `oauth-proxy` publish pattern. Add a `publish` method to `contentService`. Approval-gated (human confirms before publish) per platform posture.
- Cost: **M–L** (OAuth/app config per CMS).
- Defensibility: medium — table-stake for the "OS" claim, and the prerequisite for WS6 rank tracking.
- DoD: an approved blog publishes to a real WordPress URL; the real URL flows into the sitemap and the rank loop.

### WS6 — MEASURE → LEARN: the scoreboard and the moat

**Goal.** Track ranking + AI citation, feed both back.
- Sources: the wedge itself; `ai-seo` monitoring section.
- Current: `visibility-scanner` never written; providers `configured:false`; no rank loop.
- Changes:
  - **Write `supabase/functions/visibility-scanner`** and implement `ask()` per surface in `visibilityService.js:32-40`. Start with **Perplexity** (API returns citations — richest, cheapest signal), then ChatGPT/Claude, then Google AI Overviews (no API → Apify/SerpAPI scrape). Snapshot real runs to `campaign_metrics(provider='aeo')` (already socketed).
  - **Rank-tracking loop** — once WS5 publishes to a real URL, track that URL's impressions/position over time in GSC and attribute movement to the generated page.
  - **Feed back** into the `getGuidance` learn loop so what actually ranks/gets-cited shapes future generation.
  - Add a real daily **scheduler** (deferred decision: Supabase Cron vs Vercel Cron vs GH Actions).
- Cost: **L** + ongoing $ (provider keys) + the scheduler decision.
- Defensibility: **highest** — this is the closed loop the discovery named as the moat; mirror image of Profound/Peec (who only measure, never generate).
- DoD: a scheduled scan records real AI-citation share-of-voice for tracked queries, and a published page's rank trajectory is visible and fed back.

---

## 6. Sequencing (phases with DoDs)

| Phase | Contents | Rationale | DoD |
|-------|----------|-----------|-----|
| **P0** | WS1a (GSC operator loop) | Most quality/effort; data already flows; no new spend | Ranked opportunity list from real GSC |
| **P1** | WS1b (grounding two-call) + WS2 (buy-intent + asset router) | Makes net-new generation genuinely good & decision-led | Grounded, buy-intent output that can say "don't publish" |
| **P2** | WS3 (craft, schema/E-E-A-T, stronger judge) + WS4-technical (llms.txt, robots gate, IndexNow) | Clears the "not AI slop" + AEO-table-stakes bar | Pages carry real schema/E-E-A-T + GEO-readiness report |
| **P3** | WS5 (WordPress publish) | Unlocks the loop | Approved blog live at a real URL |
| **P4** | WS6 (visibility-scanner + rank loop + learn feedback + scheduler) | The moat; depends on P3 | Scheduled AI-citation + rank tracking, fed back |
| **parallel** | WS1c (SERP connector), WS1d (page teardown), WS4-mentions | Gated on user-provided keys / lighter-weight | Graceful degrade when unconfigured |

**Recommended first build: P0 (WS1a).** Highest quality-per-unit-effort, no new vendor or secret, and it's the exact "SEO operator on your own data" experience sources 4/5/8 are selling.

---

## 7. Cross-cutting technical notes

- **Grounding two-call pattern (non-negotiable).** `grounding:true` ⊥ `json:true` on Vertex (`aiClient.js:286`). Any grounded+structured feature = grounded prose call → non-grounded JSON structuring call. Factor a shared helper; do not re-implement per service. (See `abmResearchService.js` for the working reference.)
- **Judge model.** Draft/review/AEO all self-grade on gemini-2.5-flash (thinking off). Decouple the judge (Open Decision O1).
- **Connectors.** SERP metrics (WS1c), CMS (WS5), and visibility providers (WS6) all go through the registry+adapter + proxy pattern — no bespoke functions. Each names the exact credential + scopes the user must provision (per connector-planning discipline).
- **Learn loop.** WS6 feedback reuses the existing `getGuidance` injection — do not build a parallel learning path.
- **Anti-fabrication stays.** Extend, never weaken, the existing null-metric / no-invented-stats posture; it's the credibility backbone.

---

## 8. Reconciliation with the existing roadmap

The 2026-07-12 discovery (`docs/ROADMAP-HANDOFF.md`) committed to **loop + outreach-first** and **parked the AEO visibility wedge**, because AEO defensibility is weak (citation churn 40–70%, platform risk). Sources 1 and 2 are live evidence of exactly that volatility.

**This spec does not reopen that call.** It:
- Leans on the **durable** parts (real-data grounding, GSC operator, buy-intent, measurement loop, E-E-A-T) and treats the **volatile** parts (per-engine hacks, mention-seeding) as lighter-weight and honestly-framed.
- Makes the *generation layer* genuinely good so it stops being commodity slop — which serves the practitioner cockpit regardless of whether AEO or outreach is the headline pitch.
- Keeps WS6 (the AEO measurement wedge) as the highest-defensibility track but sequenced last, consistent with its "R3" parking — now with a concrete build path.

If outreach remains the priority for eng capacity, **P0 + P1 (WS1a, WS1b, WS2) are still worth doing standalone** — they lift quality without committing to the full measurement build.

---

## 9. Open decisions (with recommended defaults)

- **O1 — Judge model.** Stronger judge for review/AEO, or grounded review on the same model? *Default: grounded review now; revisit a stronger judge if quality still lags.*
- **O2 — SERP vendor.** DataForSEO vs SerpAPI vs Ahrefs API. *Default: DataForSEO (cheapest per-query, broad).* User-key-gated.
- **O3 — Sales-call language ingestion.** No transcript store exists. Manual paste field, or a call-tool connector (Gong/Fathom)? *Default: manual paste into brand context for now.*
- **O4 — First CMS.** *Default: WordPress REST (largest B2B footprint).*
- **O5 — First visibility surface.** *Default: Perplexity (citations via API, cheapest signal).*
- **O6 — Scheduler mechanism.** Supabase Cron vs Vercel Cron vs GH Actions. *Default: decide at P4; GH Actions is the current CI-adjacent path.*
- **O7 — Mention-finder discovery source.** Reddit API vs Apify. *Default: Apify (already integrated).* Human-in-the-loop only.

---

## 10. Risks & non-goals

**Risks**
- SERP/citation vendor cost and rate limits (WS1c, WS6) — gate behind user keys, degrade honestly.
- Jina Reader rate limits at page-teardown scale (WS1d).
- AEO signal volatility (sources 1, 2) — anything engine-specific may decay; keep it thin and swappable.
- Self-hosted rank/citation tracking is only as good as GSC + provider coverage; be explicit about blind spots.

**Non-goals (explicit)**
- No fake-post / fake-review / fake-neutral mention generation — ever.
- No fabricated volume/difficulty/traffic metrics.
- No autonomous posting to Reddit/Quora/social — human-in-the-loop, disclosed, always.
- No homegrown SERP crawler — integrate a vendor.
- Not a wedge/GTM re-decision — quality rehaul only.

---

## 11. Costing (vendor / operating cost)

Live vendor pricing as of Aug 2026. **Headline: everything here is nearly free per client except AI-visibility scanning (WS6); the entire cost question reduces to scan cadence × surface count.** This is *operating* cost — build effort is the S/M/L tags per workstream.

**Unit costs**

| Vendor | Used in | Unit price | Notes |
|---|---|---|---|
| DataForSEO (SERP + volume) | WS1c, WS1a | $0.0006–0.002 / query; $0.01 / AI-summary | Pay-as-you-go, $50 min deposit, no monthly fee/waste |
| SerpApi (alternative) | WS1c | $75/mo = $0.015/search (5k cap, no rollover) | ~10–25× DataForSEO for bursty use → rejected |
| Vertex Gemini grounding | WS1b | $35/1k (Gemini 2.5) · $14/1k (Gemini 3) | 1,500 free/day on 2.5 covers early scale |
| Perplexity Sonar | WS6 | $1/1M tokens + $5–14/1k search fee | ~$0.01/call; returns citations (richest signal) |
| OpenAI web search | WS6 | $10/1k calls + search tokens | ~$0.02–0.03/call |
| Anthropic web search | WS6 | $10/1k searches + tokens | ~$0.02–0.03/call |
| Jina Reader | WS1d | 10M tokens free, then $0.02/1M | Effectively free at our scale |
| Apify | WS4, WS6-AIO | Free $5/mo → $39/mo Starter | Shared platform cost, not per-client |
| WordPress publish | WS5 | $0 (REST API) | — |
| Scheduler | WS6 | $0 (GH Actions / Supabase Cron) | — |

**Per active client / month** (reference profile: 8 blogs, 2 keyword runs, continuous GSC, ~150 SERP pulls):

| Phase | Adds | $/client/mo |
|---|---|---|
| P0 — GSC operator | GSC (free) | ~$0 |
| P1 — grounding + buy-intent + SERP/volume | DataForSEO + grounding | ~$1–3 |
| P2 — craft + AEO technical | token overhead only | ~$0 |
| P3 — WordPress publish | — | $0 |
| P4 — visibility scanning (16 prompts × 4 surfaces) | Perplexity/OpenAI/Anthropic/Apify | weekly ~$3–5 · daily ~$25–40 |

**Fully loaded: ~$4–8/client/mo (weekly scans) → ~$28–45 (daily).** Plus one shared flat cost — Apify ~$39/mo — only if AI-Overviews scraping or the mention-finder runs. DataForSEO's $50 is a one-time float.

**The three decisions that move the number:**
1. **Scan cadence + surface count (WS6)** — the only real lever. Rec: **weekly, Perplexity-only to start** (~$1/client), widen once signal proves out.
2. **O2 confirmed — DataForSEO over SerpApi** (~10–25× cheaper for bursty per-client use, no monthly waste).
3. **Grounding rides the free tier** (1,500/day, Gemini 2.5); only a line item past ~2,000 client-months → revisit Gemini 3 then.

**Implication:** P0→P3 is <$5/client/mo all-in — the build call there is quality/effort, not cost. Cost only becomes real at P4, and is controllable to ~$1/client by starting Perplexity-only weekly.

---

*End of draft. Review inline; flag any workstream to cut, resequence, or expand before we turn P0 into an implementation plan.*
