# KEPLER OS — Session Handoff (2026-07-03)

## Where we are in one line
The "studio → marketing team" evolution is well underway: campaign spine + conversational strategist + calendar (Phases A+B) shipped; a Profile/settings hub with a **self-service connector framework** (Phase D) shipped and **just deployed live** (Google Search Console + a generic API-key path proven with HubSpot). Immediate next action: **test the HubSpot connect flow in the UI**, then pick the next epic (Teams, or wiring a connector into a module).

## Project basics
- **Stack:** React + Vite 8, plain CSS (no Tailwind), lucide-react, Supabase (Postgres + Auth + Edge Functions, Deno), Gemini via the `ai-proxy` edge function. Dev: `npm run dev` (HMR).
- **Verify every change:** `npx eslint <files>` + `npm run build` (build is the real gate). Edge functions are Deno — NOT covered by eslint/vite; verify them by review + deploy.
- **I work blind on visuals + the app is behind Supabase auth** — so authenticated screens can't be self-screenshotted. Verification pattern used all session: build + lint + node unit-checks of pure functions + Preview MCP (login/pre-auth boots + `fetch('/src/…')` module-transform checks + console-error checks). The user screenshots authed screens.
- **Memory is the source of truth** — read these first: `team-model-roadmap` (the big picture + every phase's build detail), `ui-design-system` (v3 visual system), `product-scope-skills`, `ai-json-robustness`, `feedback-learning-loop`. The approved plan for the last epic is at `~/.claude/plans/gentle-humming-comet.md`.

## Built this session (all build-green, lint-clean)
- **Visual swoop:** accent tokenization (legacy `#6666ff`→Majorelle `#7546e8` across 22 CSS files), label letter-spacing normalized, login/onboarding aligned to the sidebar logo + full-black canvas (removed `AmbientBackground`), workspace + Home-list avatars render the brand SVG logo when set.
- **Phase A — campaign spine:** `campaign` is now a first-class object. Migration `012_campaigns.sql`; `src/lib/campaignPlan.js` (shared plan contract + `normalizePlan`, `offsetDays` cadence incl. negatives for event anchoring); `campaignService`, `strategyService` (one-shot goal→plan; event-anchored mode); `Campaigns.jsx` module (list + manager desk); steps deep-link into the 4 specialist generators pre-briefed and tag their content_item back (`campaign_id`/`campaign_step_id`); cockpit "Active campaigns" widget.
- **Phase A2 — conversational front door:** `campaignIntakeService` (single-turn `callAI`, transcript serialized, discriminated-union question|plan, anti-theater + `MAX_QUESTIONS=4`); `src/components/campaign-intake/` chat UI. Emits the same CampaignPlan.
- **Phase B — cadence & calendar:** `src/lib/calendarGrid.js` (shared; SocialMedia refactored onto it); step scheduling + auto-schedule (honors `offsetDays`, parallel-capable); Plan/Calendar toggle + calendar view in the manager; cockpit "Due this week". **Event-anchored campaigns** ("Plan around an event" → steps scheduled around the date).
- **Profile hub:** route `/profile` (Header account menu → "Profile & settings"). Account name (edits `user_profiles.display_name` → feeds Home greeting) + per-workspace **Connectors** grid driven by `src/lib/connectors.js`.
- **Phase D — Google Search Console (OAuth connector):** migration `013_workspace_integrations.sql` (RLS + **column privileges** hide `refresh_token`), edge fn `search-console`, `integrationService`, `edgeClient`, OAuth callback `GoogleOAuthCallback.jsx`, SEO "Search Console" data-source panel (pull queries → add to pipeline w/ real metrics; merges GSC metrics into AI keywords).
- **Self-service connector framework (Phase D generalization):** migration `014_connector_credentials.sql` (generic hidden `credentials` JSONB; dropped provider CHECK — registry governs providers); registry `authType: 'oauth'|'apiKey'` + `fields`; generic edge fn `connector-proxy` (`connect`=validate+store, `test`, `disconnect`; `PROVIDER_ADAPTERS` map, **HubSpot adapter live**); Profile authType-generic UI + API-key connect modal. **Connecting is now UI-only, zero backend change per connection.**

## Live deployment state (as of handoff)
- **Migrations applied through 014** (`supabase db push` done).
- **Edge functions deployed:** `ai-proxy` (original), `connector-proxy` (just deployed, fixed to read auto-injected `SUPABASE_SERVICE_ROLE_KEY`).
- **NOT deployed / optional:** `search-console` (GSC) — needs `supabase functions deploy search-console` + secrets `GSC_CLIENT_ID/GSC_CLIENT_SECRET/GSC_REDIRECT_URI` + client env `VITE_GOOGLE_OAUTH_CLIENT_ID/VITE_GOOGLE_OAUTH_REDIRECT_URI`, and a Google Cloud OAuth app. GSC also has the SUPABASE_SERVICE_ROLE_KEY fix now — redeploy it when doing GSC.
- **Secrets:** `SUPABASE_SERVICE_ROLE_KEY` is auto-injected (do NOT try to `secrets set` a `SUPABASE_`-prefixed name — reserved). API-key connectors need NO platform secret.

## IMMEDIATE NEXT ACTION
Test the self-service proof: **Profile & settings → Connectors → (workspace tab) → HubSpot → Connect** → paste a HubSpot Private App token → should validate live and show **Connected** (bad token = clean inline error, nothing stored). If it works, the framework is proven end-to-end.

## Then, choose the next epic
1. **Teams (agencies)** — decided, scoped, not built. Design: `teams` + `team_members` + `workspaces.team_id` + `user_profiles.active_team_id`; make `public.is_workspace_member(ws_id)` ALSO true for the workspace's team members → **all data + connectors become team-shared via one function change**. Join via **invite link/code** (owner generates code, teammate redeems in-app; no email infra). Individual-vs-team = profile switch. Needs its own plan.
2. **Connector consumption** — wire an active connector into its module (HubSpot → Outreach contacts; GSC→SEO is already done). Per-connector follow-on.
3. **Next connector adapter** — Zoho/Apollo (api-key: 1 adapter in `connector-proxy` + flip `status:'available'` in the registry) or an OAuth one (Meta Ad Library, GA4).
4. **Phase C (roster expansion)** — deferred earlier; new specialist modules (PR / lead-magnets / referrals / community). Each needs a new `content_items.type` (migration widens the type CHECK) + service + module + registry wiring.
5. **Phase E (measurement loop)** — analytics/attribution; the heaviest, later bet.

## Gotchas / conventions
- **Accepted lint debt (build stays green):** `react-hooks/set-state-in-effect` (load-on-mount) and `react-refresh/only-export-components` (context+hook in one file, e.g. AuthContext/ActivationContext) + a couple pre-existing `no-unused-vars`/`no-useless-assignment`. Don't chase these; DON'T add new kinds. To avoid set-state-in-effect: load in a cancellable async IIFE and setState only after the `await` (see any module's mount effect); for form seed-values, key the component on the loaded value instead of syncing via effect.
- **No `import React`** in new files (automatic JSX runtime) — it trips `no-unused-vars`.
- **Edge functions are Deno**, live in `supabase/functions/*/index.ts`, need `[functions.<name>] verify_jwt = true` in `supabase/config.toml`, and a `supabase functions deploy <name>` to go live. They read secrets via `Deno.env.get`. Auth pattern: `getUser(token)` for identity + a service-role client for privileged reads/writes; membership via `workspace_members`.
- **Credential security model** (reuse for any secret): store server-side in `workspace_integrations` (`refresh_token` for OAuth, `credentials` JSONB for api-key), RLS `is_workspace_member`, and **column privileges** REVOKE+GRANT-SELECT that exclude the secret columns so the client can read status but never the secret; the edge fn (service role) reads them.
- **Migrations are idempotent** (`IF NOT EXISTS`, `DROP…IF EXISTS`); `supabase db push` applies all pending in order. The user runs them (their remote DB) — never auto-run.
- **Dev server HMR gotcha:** a sequence of incremental edits (e.g. add an import before removing a duplicate) can leave the Vite DEV server stuck on a failed transform even though `vite build` is green. Fix = restart the dev/preview server (fresh transform). Verify current source via `fetch('/src/…')` returning 200 without "SyntaxError/already declared".
- **Interactive-shell paste gotcha:** don't hand the user command blocks with `#` comment lines containing apostrophes — interactive shells don't treat `#` as a comment and the `'` opens a `quote>` prompt. Give comment-free commands.
- **Prohibited for the assistant:** creating accounts, entering passwords/API keys/OAuth on the user's behalf, deploying/db-push to their remote (the USER runs supabase CLI + provides all credentials). Assistant builds the code; user does cloud setup.

## Key files map
- Campaigns: `src/pages/workspace-modules/Campaigns.jsx` (+css), `src/lib/campaignPlan.js`, `src/services/{campaignService,strategyService,campaignIntakeService}.js`, `src/components/campaign-intake/*`, `src/components/campaigns/CampaignStepBanner.jsx`, `src/lib/calendarGrid.js`.
- Connectors: `src/lib/connectors.js` (registry — source of truth), `src/services/{integrationService,edgeClient}.js`, `src/pages/ProfilePage.jsx` (+css), `src/pages/GoogleOAuthCallback.jsx`, `supabase/functions/{search-console,connector-proxy}/index.ts`, migrations `013`/`014`.
- Cockpit/shell: `src/pages/workspace-modules/Overview.jsx`, `src/context/ActivationContext.jsx`, `src/pages/Workspace.jsx`, `src/constants/routes.js`, `src/components/layout/{Sidebar,Header}.jsx`.
- Design system keystone: `src/index.css` `:root`, `src/styles/{dashboard,kepler-materials,module-kepler}.css`.
