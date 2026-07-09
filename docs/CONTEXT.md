# KEPLER OS — Project Context & Handoff

Living context doc for continuing work (esp. the upcoming **UI/UX revamp**) in a fresh session.
The new session auto-loads `MEMORY.md` from this project's memory dir — this doc adds the fuller picture.

---

## 1. What this is
**KEPLER OS** — an AI marketing platform. A user creates a **workspace** (a brand), the app builds **Brand Intelligence**, then generates marketing assets across modules (SEO/content, ads, outreach, social).

**Stack**
- Frontend: **React + Vite 8** (automatic JSX runtime — do **NOT** `import React`, eslint flags it), `lucide-react` icons.
- Backend: **Supabase** (Postgres + RLS + Auth + Storage + Edge Functions).
- AI: **Vertex AI, Gemini 2.5 Flash**, reached only through a Supabase edge function proxy.
- Project ref `risoupsjfwnpawjltywh`. Dev server runs on **http://localhost:5174**.

**Commands:** `npm run dev`, `npm run build`, `npx eslint .`, `supabase db push`, `supabase functions deploy ai-proxy`.

---

## 2. Cross-cutting systems — REUSE, don't rebuild
| System | Where | Notes |
|---|---|---|
| AI transport | `src/services/aiClient.js` `callAI()` → edge `supabase/functions/ai-proxy/index.ts` → Vertex | JSON parse/repair/**truncation-retry** centralized here. Never add per-module JSON handling. |
| Brand context feeder | `src/services/brandContextService.js` `getBrandContextForGeneration(workspaceId,{module,depth})` | Every generation module consumes this (`depth: 'profile'` or `'full'`). |
| Persuasion layer | `src/lib/persuasionLayer.js` | Shared copy-persuasion + anti-fabrication fragment. |
| Humanizer | `src/services/humanizeService.js` | De-AI finishing pass; safe fallback to original. |
| AEO scorer | `src/services/aeoScoreService.js` | One consolidated citability scorer (mechanical signals + judgment). |
| Feedback / learning loop | `generation_feedback` table + `src/services/feedbackService.js` + `src/components/ui/RatingControl.jsx` | Ratings <3 capture an improvement note; `getGuidance(module)` injects prior notes into the next prompt. Wired into blog/ads/outreach/social. |
| Content persistence | `content_items` table + `src/services/contentService.js` | Types: `seo` \| `social` \| `ads` \| `outreach`. |
| Technical SEO | `src/lib/technicalSeo.js` | Deterministic sitemap.xml / robots.txt / slugify. |

**Ethos:** every generator is anti-fabrication (never invent stats/customers/scarcity) and uses personalization `{{tokens}}` where data is missing.

---

## 3. Modules (all built, function-first)
Pages live in `src/pages/workspace-modules/*.jsx` (+ matching `.css`); routing in `src/pages/Workspace.jsx`, nav in `src/components/layout/Sidebar.jsx`.

- **Brand Intelligence** (`BrandIntelligence.jsx`) — overview/business details/competitors/ICP/files; PDF text extraction (pdfjs); staged population; competitor + ICP discovery.
- **SEO & AEO** (`SeoAeo.jsx`) — keyword research → content pipeline board (Queue/Generating/Completed) → blog pipeline (outline→draft→humanize→review→AEO score) → **Technical SEO** panel (sitemap/robots).
- **Ad Campaigns** (`AdCampaigns.jsx`) — 8-angle generator + competitor differentiation + code-side char validation + **saved campaigns** (reopen).
- **Outreach** (`Outreach.jsx`) — cold sequences + lifecycle flows, personalization tokens, compliance notes, **saved sequences**.
- **Social Media** (`SocialMedia.jsx`) — **calendar planner + design generator**; one monthly "Run calendar" → all posts; **voice segregation** (company/founder/mix); on-brand **HTML carousel** (`src/components/social/CarouselPreview.jsx`).

Home: `src/pages/Home.jsx`.

---

## 4. Data model / migrations (001–011, synced local↔remote)
Tables: `workspaces`, `workspace_members`, `user_profiles`, `brand_profiles`, `competitors`, `personas`, `workspace_files`, `ai_proxy_rate_limits` (007, locked via REVOKE + SECURITY DEFINER), `content_items` (010), `generation_feedback` (011).
RLS everywhere via `public.is_workspace_member(ws_id)`. Workspace creation uses a **bootstrap membership policy** (first member self-inserts as owner) — verified correct.

**Edge/secrets:** `VERTEX_SERVICE_ACCOUNT` (store **base64** via `--env-file`, or it corrupts), `VERTEX_AI_LOCATION=us-central1`, `VERTEX_AI_MODEL_ID=gemini-2.5-flash`. `supabase/config.toml` → `verify_jwt = true`. Edge enforces CORS + auth + rate limit + model allowlist + size guards. `src/lib/env.js` forbids secrets in the client bundle.

---

## 5. UI conventions (READ before the revamp)
- Global styles: `src/styles/module-kepler.css`; per-module CSS files.
- Reusable UI: `src/components/ui/` — `Panel`/`PanelHeader`, `ContentCard`, `Tabs`, `Modal`, `RatingControl`, `AnalyticsStrip`, `StatusPill`, `WorkspaceCard`.
- Common classes: `kepler-tile`, `btn`/`btn-primary`/`btn-secondary`/`btn-destructive`/`btn-ghost`, `intel-input`/`intel-textarea`, `platform-pills`+`platform-pill`, `label-text`, `module-panel`, `brand-intel-module__error` / `__source-label` / `__empty`.
- `SetupRequired` gates modules on prerequisites (brand profile / ICPs).
- Automatic JSX runtime — omit `import React`.

---

## 6. UI/UX revamp — START HERE (known issues & scope)
- **Homepage** (`Home.jsx`): hero **"Run intelligence" button is dead** (no handler) — wire or remove. Workspace Summary panel now shows a single stat (thin) — redesign. Recent Activity is minimal. Delete-workspace is a plain `window.confirm` + button under each card — make it a nicer affordance/modal.
- **Provenance labels** were removed (component `ProvenanceLabel` is a no-op; `fieldProvenance` data + protection logic retained). Don't re-add labels.
- **Consistency pass** wanted across modules — they were built function-first (spacing, empty states, loading states, mobile).
- **Carousel** design is HTML-from-color-identity; future: mix with **Fal.ai** image gen (a proper workflow was deferred).
- **Lint debt:** ~56 non-runtime eslint issues (mostly `no-unused-vars`) — optional cleanup; none are bugs/vulnerabilities.

---

## 7. Deferred / roadmap (not built yet)
- **Model upgrade** (e.g. Gemini 3.x) → tighter generation; blog "tightening" rides this.
- **Connectors** (currently integration-light): Gmail/LinkedIn/Meta **posting/sending**; **Search Console/Ahrefs** for real keyword volumes; **Meta Ad Library / Google Ads Transparency** for real competitor creatives; **Fal.ai** image gen for carousels. (A Gmail MCP connector has appeared in-session before.)
- **Analytics module** (GA4 / PostHog) — deferred.
- **Brand-context enrichment**: add differentiators, switching dynamics, verbatim customer language, per-competitor "how they fall short" to `getBrandContextForGeneration` — sharpens ads/outreach/social together.

---

## 8. Working style that's worked here
Verify before changing (read the actual file/RLS/migration); after each change run `npx eslint <file>` + `npm run build`; keep changes lint-clean; frontend edits are live via HMR; backend needs `db push` / `functions deploy`. The task list + `MEMORY.md` track progress across sessions.
