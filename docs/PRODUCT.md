# KEPLER OS — Product & Architecture Document

> **Full-scope map of the platform: what it is, how it's built, what it can do, and where it's going.**
> Last updated: July 2026 · Environment: Staging live at `kepler-os-two.vercel.app`

---

## 1. What KEPLER OS Is

KEPLER OS is an **AI-native marketing operating system**. A team creates a **workspace** per brand, KEPLER builds a structured **brand intelligence** model of that brand (from its website, uploaded documents, and guided input), and then every downstream module — SEO, ads, outreach, social, prospecting, campaigns — generates work that is **grounded in that brand model** rather than generic.

### The core design principle: dual architecture

> **Connectors are pure upside. The base quality never depends on them.**

Every module works **AI-only with zero connectors** — a team can sign up and produce real output immediately. When a workspace *connects* a data source (Search Console, GA4, Meta Ad Library, a CRM), that module's output gets **grounded in live data** instead of estimates. Connectors are an enhancement layer, never a dependency. This is enforced architecturally, not just by convention.

### One-line summary

> A multi-workspace marketing platform where a shared **brand intelligence core** feeds **nine specialist AI modules**, orchestrated by a **campaign spine**, measured through **UTM attribution**, and continuously improved by a **feedback learning loop** — all on a serverless Supabase + Vertex AI backend.

---

## 2. System Architecture

### 2.1 High-level shape

```
┌─────────────────────────────────────────────────────────────┐
│                     BROWSER (React 19 SPA)                    │
│  App shell · 9 modules · Brand core · Contexts (Auth/WS/…)   │
│         Vite build → static assets on Vercel (CDN)           │
└───────────────┬──────────────────────────┬──────────────────┘
                │ supabase-js (anon key)    │ Bearer JWT
                ▼                            ▼
┌───────────────────────────┐   ┌──────────────────────────────┐
│   SUPABASE POSTGRES        │   │   SUPABASE EDGE FUNCTIONS     │
│   • 15 tables, all RLS     │   │   (Deno, serverless)          │
│   • workspace-scoped       │   │                              │
│   • hidden secret columns  │   │  ai-proxy ───────► Vertex AI │
│   • RPC rate limiter       │   │                     (Gemini)  │
│   • Supabase Auth          │   │  connector-proxy ─► HubSpot / │
│   • Storage (files bucket) │   │                     Apollo /  │
│                            │   │                     Zoho       │
│                            │   │  oauth-proxy ─────► Google /  │
│                            │   │                     Meta       │
└───────────────────────────┘   └──────────────────────────────┘
```

- **Frontend:** React 19 + Vite 8, plain CSS (custom-property design system), Solar Icons, Google Fonts (Manrope). Builds to a static SPA.
- **Backend:** Supabase — Postgres + Auth + Deno Edge Functions. No separate server.
- **AI:** All model calls route through the `ai-proxy` edge function → **Google Vertex AI (Gemini)**. No API keys ever reach the browser.
- **Hosting:** Vercel (frontend, auto-deploy on push) + Supabase (DB/functions, auto-deploy via GitHub Actions).

### 2.2 Tech stack

| Layer | Choice |
|---|---|
| UI framework | React 19 |
| Build tool | Vite 8 (Node 22) |
| Routing | React Router 7 (client-side) |
| Styling | Vanilla CSS + custom-property token system (no Tailwind) |
| Type family | Manrope (single family, weight-driven hierarchy) |
| Icons | Solar Icons (`@solar-icons/react`), single re-export shim |
| Backend | Supabase (Postgres, Auth, Edge Functions, Storage) |
| Edge runtime | Deno (TypeScript) |
| AI | Google Vertex AI — Gemini (`gemini-3.5-flash` on staging) |
| Auth | Supabase Auth (email/password) |
| Hosting | Vercel (FE) + Supabase (BE) |
| CI/CD | GitHub Actions (build gate + backend auto-deploy) |

### 2.3 Two canonical request flows

**AI generation (every module):**
```
UI action → service (loads brand context + feedback guidance, builds prompt)
  → aiClient.callAI() → POST /functions/v1/ai-proxy (Bearer JWT)
    → ai-proxy: verify JWT → rate-limit (RPC) → mint Vertex token (service acct)
      → translate OpenAI-style messages → Vertex Gemini generateContent
    → normalize to { choices, usage, model }
  → aiClient: lenient JSON parse (+ repair, + 1 strict retry)
→ service normalizes/validates → optional save to content_items → UI renders + rating control
```

**Connector use (e.g., Zoho push):**
```
UI → integrationService → POST /functions/v1/connector-proxy (action: push)
  → verify JWT + workspace membership → read hidden credentials (service role)
    → adapter.push() → external API (Zoho upsert contact + dated tasks)
  → update last_sync_at / last_error → return result
```

---

## 3. Data Model

15 tables (migrations `001`–`015`, `017`; there is intentionally **no `016`**). **Every table is workspace-scoped and RLS-protected** via `is_workspace_member(workspace_id)` / `is_workspace_owner(workspace_id)` (SECURITY DEFINER helpers).

### 3.1 Tenancy & identity
| Table | Purpose | Notable columns / rules |
|---|---|---|
| `workspaces` | Tenant boundary — one per brand | `name`, `url`, `industry`, `brand_colors` (JSONB), `brand_intel_status`, `last_active_module` |
| `workspace_members` | User ↔ workspace mapping + roles | `role` ('owner'\|'member'); bootstrap gate prevents unauthorized first-member insertion |
| `user_profiles` | Per-user state | `display_name`, `active_workspace_id`, `onboarding_complete`; auto-created on signup via trigger |

### 3.2 Brand intelligence core
| Table | Purpose | Notable columns |
|---|---|---|
| `brand_profiles` | 1:1 with workspace — the brand identity | `tagline`, `overview`, JSONB `colors`/`fonts`/`brand_values`/`tone`/`aesthetic`, `color_identity`, `business_details`, `field_provenance` (per-field source tracking) |
| `competitors` | Confirmed + suggested competitors | `name`, `url`, `confirmed`, `notes` |
| `personas` | Audience ICPs | `role`, `titles`/`channels` (JSONB), `pain_points`, `details` (JSONB), `source_origin` ('manual'\|'website'\|'file'\|'ai'\|'combined') |
| `brand_suggestions` | AI suggestions pending review | `suggestion_type` ('competitor'\|'icp'), `payload`, `status` ('pending'\|'accepted'\|'dismissed') |
| `workspace_files` | Uploaded intelligence sources | `storage_path`, `mime_type`, `extracted_text`, `status`, `included_in_analysis`; files live in a **private** Storage bucket with path-scoped RLS |

### 3.3 Output & orchestration
| Table | Purpose | Notable columns |
|---|---|---|
| `content_items` | Unified queue for all generated assets | `type` ('seo'\|'social'\|'ads'\|'outreach'), `status` ('queue'\|'generating'\|'completed'\|'failed'), `payload` (JSONB), `campaign_id` + `campaign_step_id` |
| `campaigns` | First-class campaign object (the "spine") | `goal`, `campaign_type`, `status`, `plan` (JSONB: `{ goal, strategySummary, channelMix[], steps[] }`), `source` |

### 3.4 Connectors, feedback, measurement
| Table | Purpose | Notable columns / rules |
|---|---|---|
| `workspace_integrations` | Connector credential storage (1 per provider) | `provider`, `status`, `property_url`, `meta` (JSONB); **`refresh_token` + `credentials` columns are hidden from clients** — only the service role (edge functions) can read them |
| `generation_feedback` | Ratings on outputs (learning loop) | `module`, `rating` (1–5), `improvement` (text); low-rated notes feed the next generation |
| `prospects` | Top-of-funnel pipeline (Apollo → CRM) | `first_name`/`last_name`/`title`/`company`, `linkedin_url`, `external_id` (dedupe), `status` ('saved'\|'pushed'), `pushed_to` |
| `campaign_metrics` | Point-in-time attribution snapshots | `campaign_id` (NULL = unattributed), `provider` ('ga4'…), `metrics` (JSONB), `captured_at` |

Plus an internal `ai_proxy_rate_limits` table (per-user fixed-window counter, service-role only).

---

## 4. Security Architecture

Security is enforced at the data layer, not just the app layer.

- **Row-Level Security everywhere.** Every workspace-scoped table gates SELECT/INSERT/UPDATE/DELETE behind `is_workspace_member()`. Membership helpers are SECURITY DEFINER; a bootstrap gate stops self-join attacks on `workspace_members`.
- **Secrets are invisible to the browser.** `refresh_token` and `credentials` on `workspace_integrations` are removed from the `authenticated` role's column grants — clients can read connection *status* and *property*, never the tokens. Only edge functions (service role) touch secrets.
- **No secrets in the client bundle, ever.** The app refuses to boot if a forbidden `VITE_*` secret (service-role key, API keys, service-account JSON) is present.
- **Rate limiting in the database.** `ai-proxy` calls an atomic RPC (`ai_proxy_rate_limit_take`, 15 req / 60 s per user) → returns `429` with `Retry-After` on breach.
- **CORS allowlist.** Edge functions only emit `Access-Control-Allow-Origin` for allowlisted origins (`ALLOWED_ORIGINS` + `APP_URL`; localhost always allowed for dev).
- **File storage is path-scoped.** Objects live at `workspace_id/file_id/filename` in a private bucket; storage RLS extracts the workspace id from the path and checks membership. MIME allowlist enforced.
- **Vertex access via short-lived tokens.** `ai-proxy` signs an RS256 JWT with the service-account key, exchanges it for a 1-hour OAuth token (cached with a 60 s safety buffer), and never exposes it.

---

## 5. The AI Layer

### 5.1 `ai-proxy` (the single AI gateway)
Everything AI passes through one edge function:
- **Auth + rate limit** on every call (JWT verify → per-user RPC counter).
- **Single-model allowlist:** only the env-configured `VERTEX_AI_MODEL_ID` is accepted; other models return `403`. Cost ceilings: max 8,192 output tokens, 20 messages, ~60k content chars.
- **OpenAI→Vertex translation:** `messages[]` split into Vertex `contents[]` + top-level `systemInstruction`; `assistant`→`model`; JSON mode maps to `responseMimeType: application/json`; **thinking disabled** (`thinkingBudget: 0`) so small-budget calls (e.g., an 80-token tagline) spend everything on visible output.
- **Response normalized** to OpenAI shape `{ choices:[{message:{content}, finish_reason}], usage, model }`, with non-secret token accounting surfaced.

### 5.2 JSON robustness (centralized in `callAI` + the edge)
LLM JSON is fragile; KEPLER handles it in **one place** (never per-module):
1. Strip ```json fences → 2. extract the outermost JSON span from surrounding prose → 3. remove trailing commas → 4. **truncation repair** (walks string/stack state, closes dangling structures) → 5. if still failing, **one strict retry** with a "return minified JSON only" suffix and a larger budget.

### 5.3 Feedback learning loop (cross-cutting)
- Every generated asset shows a **1–5 star `RatingControl`**; ratings < 3 require an improvement note.
- Notes are saved to `generation_feedback` (module-scoped).
- On the next generation in that module, `feedbackService.getGuidance(module)` injects the last few improvement notes into the prompt ("address every past point…").
- **Pure prompt injection — no fine-tuning.** A `FeedbackInsight` surface shows the user which notes are shaping new output.

### 5.4 Anti-fabrication discipline
System prompts forbid inventing metrics/claims; the app validates **code-side**, not model-side: ad/email/social char limits enforced in code, banned-phrase detection for outreach, proof-point confidence flags in brand intelligence, and `{{firstName}}`-style personalization tokens left as placeholders rather than fabricated.

---

## 6. Connector Architecture

**Two generic proxies serve all connectors** — you never write a bespoke function per integration:

- **`oauth-proxy`** — redirect-grant OAuth for provider *families*. Google family (GSC, GA4, Google Ads) and Meta family (Meta Ad Library, Meta Ads). Handles code exchange, refresh-token minting (Google) / long-lived token storage (Meta), property discovery, and per-provider query adapters.
- **`connector-proxy`** — API-key + self-client adapters (HubSpot, Apollo, Zoho) with a uniform `validate / onConnect / push / fetch` adapter interface.

Adding a connector = **one registry entry** (`src/lib/connectors.js`, client) + **one adapter** (server). *(`search-console` was an early bespoke function, now deprecated in favor of `oauth-proxy`.)*

### Connector registry (8 live)
| Connector | Enhances | Auth | Notes |
|---|---|---|---|
| Google Search Console | SEO & AEO | OAuth | Real query/impression/click/position data |
| Google Analytics 4 | Overview & Measurement | OAuth | Traffic by channel + by-campaign attribution |
| Google Ads | Ad Campaigns | OAuth | **Gated:** data queries need a Google-approved developer token |
| Meta Ad Library | Ad Campaigns | OAuth | Competitor ad intelligence (live ads) |
| Meta Ads | Ad Campaigns | OAuth | **Gated:** `ads_read` needs Meta App Review in production |
| Zoho CRM | Outreach & Prospecting | OAuth (self-client) | Push contacts + dated tasks; pull for attribution |
| HubSpot | Outreach | API key | Contacts/lists/lifecycle |
| Apollo | Prospecting | API key | Net-new B2B people search |

API-key connectors need **no platform secret** — the user pastes their own credential, which is validated live against the real API on connect.

---

## 7. Capabilities — Module by Module

The app shell is auth-gated (Login → Onboarding → Workspace) with per-module **readiness gates** (most modules unlock after brand context + at least one ICP exist). Three React contexts hold state: **Auth** (session/profile), **Workspace** (list + active), and **Activation** (per-workspace readiness, content summary, recent activity, campaign snapshot, feedback rollup).

### 7.1 Brand Intelligence — the core
The foundation every other module reads from.
- Tabbed identity editor: Overview, Colors, Tone, Values, Aesthetics, Business Details, Competitors, ICPs.
- **Population engine:** scrapes the brand website + parses uploaded files, then runs **isolated per-section AI calls** (overview, tagline, tone, values/aesthetic, business details, color identity) — resilient to partial failure, each retryable.
- **Color identity** extraction (primary/secondary/accent/dark/light/text + typography direction).
- **Competitor discovery** (AI finds real competitors) and **ICP discovery** (suggests audience personas), both with confirm/edit flows.
- **Provenance:** each field tracks whether it came from manual input, the website, a file, or AI.

### 7.2 Overview / Cockpit
Command center: brand-completeness score, module readiness grid, recent content activity, campaign steps due this week, connector status, and an embedded **GA4 widget** (connect a property → last-28-day traffic by channel).

### 7.3 SEO & AEO
- **Keyword research pipeline** (8 internal phases: discover → expand → classify intent → score → geo-check → validate → filter → rank) producing 30–50 keywords with intent, tier, cluster, and GEO type.
- Metrics are marked *estimated* until **Search Console** is connected, at which point real query performance merges in.
- **Blog generation** (title, intro, H2 sections, CTA, meta description) with a **humanize** pass, plus **technical SEO** outputs (sitemap.xml, robots.txt, URL rules).

### 7.4 Ad Campaigns
- Config by campaign type + platform + ICP + budget/goal.
- **Meta Ad Library grounding:** pull live competitor ads, AI-analyze their tone/offers/CTAs, and feed a differentiation brief into generation.
- **8-angle variant engine** (pain, outcome, social proof, curiosity, comparison, identity, contrarian, urgency), platform-aware char limits validated in code, LinkedIn buying-committee targeting helper.

### 7.5 Outreach
- **Cold sequences** (skeleton-driven, multi-touch, per-channel) and **lifecycle flows** (welcome, onboarding, re-engagement, win-back, upgrade).
- Personalization tokens for unknowns, banned-phrase validation, per-channel length rules.
- **Zoho push:** create a contact + a dated task per sequence step, stamped with the campaign UTM for later attribution.

### 7.6 Prospecting
- **Apollo people search** by title/seniority/company-size/location (ICP-seeded), dedup against saved prospects.
- Save to a prospect list → **bulk push to Zoho** as contacts.

### 7.7 Social Media
- **Calendar planner** (weeks × posts/week × platforms) with a rotated angle pool (how-to, story, contrarian, list, case study, question, BTS, data, myth-bust, quick tip) — no repetition.
- Platform-specific specs, voice modulation (company / founder / team), and **on-brand carousel generation** (rendered from the workspace color identity).

### 7.8 Campaigns — the spine
- A campaign is a **goal + AI-generated strategy + ordered steps mapped to modules**.
- Plan view + calendar/timeline view; each step **deep-links into its module** with the brief pre-filled (`?campaign=…&step=…`), and every asset generated in a step carries the `campaign_id` for rollup.

### 7.9 Measurement
- Per-campaign **UTM identity** (campaign id embedded in `utm_campaign`), copyable links.
- **GA4 pull** (28-day traffic attributed by campaign) + **Zoho pull** (CRM records attributed via the stamped UTM).
- **Snapshots** into `campaign_metrics` for trend tracking; an unattributed bucket for organic/direct.

### 7.10 Library
Unified browser of every generated asset (SEO/Ads/Outreach/Social) with type filter, search, status, and deep-links back to the source module.

### Supporting screens
**Onboarding** (workspace → brand → files → launch), **Workspace hub** (module tabs with lock/next-step gating), **Profile & Connectors** (account + the 8-connector grid with real brand logos, connect/disconnect per workspace).

---

## 8. Design System

- **Premium dark** aesthetic: solid near-black canvas (`--bg #0a0a0c`); depth/gradient live only on cards.
- **Dual-purple accent:** Majorelle `#7546E8` (primary signal) + Persian Indigo `#2D1C7F` (deep anchor), lavender edges, one purple-gradient hero KPI per view.
- **Type:** **Manrope** single family, hierarchy by weight (H1 800 / H2 700 / body 400); Title Case headings; one `@import`, all routed through `--font-*` variables in `index.css :root` (the design keystone).
- **Motion:** CSS-first (staggered load reveal, count-up KPIs, hover-lift/glow, hero sheen), all under a `prefers-reduced-motion` guard.
- **Reusable UI kit:** `Panel`, `Modal`, `Tabs`, `EmptyState`, `RatingControl`, `CountUp`, `MiniBarChart`, upload zone, status pills — a coherent system so new surfaces inherit the look automatically.

---

## 9. Deployment & Operations

Standard modern pipeline, stood up on a staging environment:

- **Repo:** GitHub (private), `main` (future production) + `staging` (active working/deploy branch).
- **Frontend:** Vercel — auto-rebuilds on every push to `staging`; served at `kepler-os-two.vercel.app`.
- **Backend:** Supabase (separate Free staging project) — migrations + edge functions **auto-deploy via GitHub Actions** on pushes that touch `supabase/**`.
- **CI:** a build-gate workflow on every push/PR; a backend-deploy workflow keyed to `supabase/**`.
- **Secrets:** client `VITE_*` in Vercel; edge secrets (Vertex service account [base64], model/region, CORS origins) via `supabase secrets`; two GitHub repo secrets for the deploy action.
- **Self-service auth:** email/password with instant sign-up (email confirmation off for the private test group).

**Net:** push to `staging` → frontend and backend both ship automatically.

---

## 10. Future Mapping / Roadmap

Organized by theme. Everything below is either explicitly flagged in code (`coming soon`, `deferred`, `Phase 2`) or scoped in `docs/CONTEXT.md`.

### 10.1 Workspace Optimization Score  ⭐ *(flagship future metric)*
**Status:** UI placeholder on the Home content-output chart ("Workspace optimization scoring — coming soon"); backend not wired.
**Intent:** a per-workspace health/score metric combining **brand-profile completeness, output velocity, content performance, and connector coverage** — surfaced as a headline KPI and trend, turning the mocked content-output chart into a real signal. This is the marquee item on the roadmap.

### 10.2 Measurement & analytics depth
- **Core built:** UTM attribution, GA4 + Zoho pulls, `campaign_metrics` snapshots.
- **Deferred:** deeper analytics (PostHog-style event tracking, funnel visualization visitor→lead→customer, cohort analysis by source/device/geo, A/B test comparison of campaign variants).

### 10.3 Connectors expansion
- **Gated (built, awaiting approval):** Google Ads data (needs developer token), Meta Ads (needs App Review).
- **Deferred integrations:** Gmail / LinkedIn **sending & posting** (outreach and social are currently generate-only — no platform publishing yet), Ahrefs for real keyword volumes.
- Registry is forward-compatible: flip a connector `planned → available` + add one adapter.

### 10.4 Richer creative
- **Carousel image generation** via Fal.ai (today carousels are on-brand HTML/CSS from the color identity; image-gen is the enhancement).
- **Image-PDF / OCR** ingestion for design-heavy brand assets (text extraction works today; image-only PDFs are marked unsupported).

### 10.5 Deeper brand intelligence
Per-competitor **differentiation playbooks** (how the brand falls short, switching dynamics, willingness-to-pay), **voice-of-customer / verbatim language**, and strategic differentiator mapping — feeding sharper ads/outreach/social simultaneously.

### 10.6 Generation quality
- **Model upgrade** (Gemini 3.x line) for tighter, less-verbose output; the blog "tightening" step rides on this.
- Continued anti-slop tuning across modules.

### 10.7 UX / visual polish
- Home hero redesign (a hero action is currently inert), workspace-summary panel redesign.
- App-wide consistency pass (spacing, empty/loading states, mobile responsiveness).
- **Ambient background** (Phase 2 component built, not yet mounted in the shell).
- Optional re-enable of provenance labels in the UI (logic retained).

---

## 11. Appendix

### 11.1 Migrations
`001` core schema · `002` RLS hardening · `003` schema reconcile · `004` brand intelligence population · `005` ICP population · `006` file intelligence surface · `007` ai-proxy rate limit · `008` brand suggestions reconcile · `009` file upload broaden · `010` content items · `011` generation feedback · `012` campaigns · `013` workspace integrations · `014` connector credentials · `015` prospects · *(no 016 — intentional)* · `017` campaign metrics.

### 11.2 Edge functions
`ai-proxy` (Vertex gateway) · `connector-proxy` (API-key/self-client adapters) · `oauth-proxy` (OAuth families) · ~~`search-console`~~ (deprecated).

### 11.3 Environment & secrets (shape only — values live in the host/Supabase, never the repo)
- **Client (`VITE_*`):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (required); `VITE_AI_MODEL`, OAuth client IDs/redirects (optional). Forbidden: any service-role key / API key / service-account JSON.
- **Edge secrets:** `VERTEX_SERVICE_ACCOUNT` (base64), `VERTEX_AI_LOCATION`, `VERTEX_AI_MODEL_ID`, `ALLOWED_ORIGINS`, `APP_URL`; per-connector OAuth client secrets as connectors are enabled.

### 11.4 Glossary
- **Workspace** — a brand tenant; the unit of isolation and membership.
- **Brand intelligence** — the structured brand model (identity, colors, ICPs, competitors) all modules read from.
- **Connector** — an optional external data source; pure upside, never a dependency.
- **Campaign spine** — a campaign as an ordered plan of module-mapped steps.
- **Content item** — any generated asset in the unified queue.
- **Feedback loop** — ratings + improvement notes injected into future prompts (no fine-tuning).
- **Attribution** — per-campaign UTM identity matched back through GA4 + CRM into `campaign_metrics`.

---

*This document reflects the system as built and deployed to staging. It is a living document — update it as modules, connectors, and the roadmap evolve.*
