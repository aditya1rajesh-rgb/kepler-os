# KEPLER OS — Staging Deployment Context

> Hand this to a fresh chat (or your DevOps) to stand up a **staging URL** for team testing, with the ability to **keep pushing changes** after. Everything below reflects the actual app as built.

---

## 0. Goal & the short answer

- Deploy the app to a **staging link** the team can test.
- **Can you keep pushing changes once it's on staging? Yes.** Standard setup: a Git repo wired to a static host that **auto-rebuilds on every push** (frontend), plus the Supabase CLI or a GitHub Action for **edge functions + DB migrations**. Details in §8.
- ⚠️ **This project is not a Git repo yet** (`git init` + push to GitHub is step one — §3).

---

## 1. Stack (what you're deploying)

- **Frontend:** React 19 + Vite 8, plain CSS (no Tailwind), Solar Icons (`@solar-icons/react`), Google Fonts via CSS `@import`. Builds to a **static SPA** (`dist/`).
- **Backend:** **Supabase** — Postgres + Auth + Edge Functions (Deno). No separate server.
- **AI:** all model calls go through the `ai-proxy` edge function → **Google Vertex AI (Gemini)**. No API keys in the browser.
- **Node:** use **Node 22 LTS** (Vite 8 needs Node ≥ 20.19 / ≥ 22.12). Build: `npm ci && npm run build` → `dist/`.
- **Routing:** client-side (React Router) → the host must **rewrite all routes to `/index.html`**.

## 2. What deploys where

| Piece | Target | How |
|---|---|---|
| Frontend (`dist/`) | Static host — **Vercel / Netlify / Cloudflare Pages** | Git auto-deploy on push |
| Database schema | Supabase Postgres | `supabase db push` (migrations `001`–`017`) |
| Edge functions | Supabase Edge Functions | `supabase functions deploy <name>` |
| Auth | Supabase Auth | dashboard URL config |

---

## 3. Step 1 — Git repo

The project isn't versioned yet.
```bash
cd /Users/apple/ai-marketing-platform
git init && git add -A && git commit -m "Initial commit"
# create a GitHub repo, then:
git branch -M main
git remote add origin git@github.com:<org>/kepler-os.git
git push -u origin main
git checkout -b staging && git push -u origin staging   # staging branch = staging deploys
```
Ensure `.gitignore` excludes `node_modules`, `dist`, `.env*`.

## 4. Step 2 — Supabase project (staging)

Two options:
- **(A) Separate staging Supabase project (recommended)** — isolates test data from prod. You re-run migrations, secrets, and reconnect connectors on it.
- **(B) Reuse the existing Supabase project** — fastest; but staging + prod share DB/Auth/data. Fine for a quick internal test, not for real staging.

On the chosen project:
```bash
supabase link --project-ref <ref>
supabase db push                     # applies migrations 001–017 (NOTE: no 016 — intentional)
supabase functions deploy ai-proxy
supabase functions deploy connector-proxy
supabase functions deploy oauth-proxy
# search-console is DEPRECATED (superseded by oauth-proxy) — do not deploy.
```
Then set secrets (§6) and Auth URLs (§7).

## 5. Step 3 — Frontend host (Vercel example)

- **Framework preset:** Vite. **Build:** `npm run build`. **Output dir:** `dist`.
- **SPA rewrite** — add `vercel.json` at repo root:
  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  ```
  (Netlify equivalent — `public/_redirects`: `/*  /index.html  200`)
- Connect the GitHub repo. Map the **`staging` branch** to a staging deployment/URL (Vercel: a separate Project pointed at `staging`, or branch deploys).
- Set the client env vars (§6) in the host's project settings.

---

## 6. Environment variables

### Client (`VITE_*`, set in the frontend host)
**Required — app refuses to boot without these:**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**Recommended:**
- `VITE_APP_URL` = the staging URL (e.g. `https://staging.kepler.app`)
- `VITE_AI_MODEL` = the model id (must match `VERTEX_AI_MODEL_ID`)

**OAuth connectors (only if enabling GSC / GA4 / Meta on staging):**
- `VITE_GOOGLE_OAUTH_CLIENT_ID`, `VITE_GOOGLE_OAUTH_REDIRECT_URI` = `https://<staging>/integrations/oauth/callback`
- `VITE_META_OAUTH_CLIENT_ID`, `VITE_META_OAUTH_REDIRECT_URI` = `https://<staging>/integrations/oauth/callback`

**NEVER set on the client (the app refuses to boot if present):**
`VITE_SUPABASE_SERVICE_ROLE_KEY`, `VITE_OPENROUTER_API_KEY`, `VITE_VERTEX_SERVICE_ACCOUNT`.

### Edge-function secrets (`supabase secrets set …`)
**Auto-injected by Supabase — do NOT set:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

**AI (required for any generation — `ai-proxy`):**
- `VERTEX_SERVICE_ACCOUNT` — the service-account JSON, **base64-encoded** ⚠️ (see note below)
- `VERTEX_AI_LOCATION`, `VERTEX_AI_MODEL_ID`

**CORS (required so the staging domain is allowed by the edge functions):**
- `ALLOWED_ORIGINS` = `https://<staging>` (comma-separated list)
- `APP_URL` = `https://<staging>`

**Google connectors (only if used):** `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` (= staging callback).
**Meta connectors (only if used):** `META_OAUTH_CLIENT_ID`, `META_OAUTH_CLIENT_SECRET`, `META_OAUTH_REDIRECT_URI`.
**Google Ads (gated, only if used):** `GOOGLE_ADS_DEVELOPER_TOKEN`.
**API-key connectors (HubSpot / Apollo / Zoho):** NO platform secret — users paste their own credential in the app.

> ⚠️ **`VERTEX_SERVICE_ACCOUNT` gotcha:** set it as **base64** via an env-file, not inline, or newlines in the private key corrupt it. e.g. `supabase secrets set --env-file ./staging.secrets.env` where the file has `VERTEX_SERVICE_ACCOUNT=<base64 of sa.json>`.

## 7. Auth + OAuth reconfiguration for the staging domain (critical)

- **Supabase Auth → URL Configuration:** set **Site URL** = `https://<staging>`, and add to **Redirect URLs**: `https://<staging>/**` (covers the app + `/integrations/oauth/callback`).
- The registered OAuth redirect URIs are currently **localhost**. For staging:
  - **Google Cloud OAuth client** → add Authorized redirect URI `https://<staging>/integrations/oauth/callback` and JS origin `https://<staging>`.
  - **Meta app** → add the same under Valid OAuth Redirect URIs.
  - Update the matching `VITE_*_REDIRECT_URI` (client) and `*_REDIRECT_URI` (edge secret).
  - **Google consent screen** is unverified → add each staging tester as a **test user**, or submit for verification (see `connector` notes).

## 8. Keeping the ability to push changes

- **Frontend:** push to `staging` → host auto-rebuilds. (`main` → production later.) This is automatic once the repo is connected.
- **Edge functions + migrations are NOT auto-deployed by the frontend host.** Two ways:
  1. Manual after changes: `supabase functions deploy <name>` and/or `supabase db push`.
  2. **GitHub Action** (recommended) — deploy functions + push migrations on every push to `staging`:
     ```yaml
     name: supabase-staging
     on: { push: { branches: [staging] } }
     jobs:
       deploy:
         runs-on: ubuntu-latest
         steps:
           - uses: actions/checkout@v4
           - uses: supabase/setup-cli@v1
           - run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
             env: { SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }} }
           - run: supabase db push
             env: { SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }} }
           - run: supabase functions deploy ai-proxy connector-proxy oauth-proxy
             env: { SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }} }
     ```
     Add repo secrets `SUPABASE_ACCESS_TOKEN` (from Supabase account) + `SUPABASE_PROJECT_REF`.

So: **frontend edits ship on push automatically; backend edits ship via the Action (or one CLI command).**

## 9. Migrations reference (what `db push` applies)

`001`–`015`, `017` (there is **no `016`** — intentional; a planned column was dropped). Key ones: `013`/`014` connector storage (RLS + hidden secret columns), `015` prospects, `017` campaign_metrics (measurement). All idempotent.

## 10. Smoke test on staging (in order)

1. App **boots** (Supabase client env present).
2. **Sign up / log in** (Auth redirect allowlist correct).
3. Create a workspace → **Brand Intelligence** → generate an asset → proves **ai-proxy + Vertex + CORS + secrets**.
4. **Profile → Connectors** loads; connect an **api-key** connector (HubSpot/Apollo/Zoho) → proves `connector-proxy`.
5. (If OAuth configured) connect **GSC / GA4** → proves `oauth-proxy` + redirect config.
6. **Measurement** page loads (confirms `campaign_metrics` migration applied).

## 11. Who does what

- **You / DevOps:** create the hosting + Supabase projects, set env vars & secrets, register/verify OAuth apps, run `supabase db push` / `functions deploy` (or wire the Action).
- **The build assistant:** writes code only — does not create accounts, enter credentials/secrets, or deploy to your remote.

## 12. Current app surface (context for testers)

Modules: Overview (cockpit + GA4 widget), **Measurement** (attribution), Brand Intelligence, Campaigns, SEO & AEO, Ad Campaigns (+ Meta Ad Library competitor read), Outreach (+ Zoho pull/push), **Prospecting** (Apollo → Zoho leads), Social Media, Library.
Connectors: GSC, GA4, HubSpot, Apollo, Zoho, Meta Ad Library live; Google Ads + Meta Ads connect-only (gated on dev-token / App Review).
Everything works **AI-only with no connectors**; connectors are pure upside.
