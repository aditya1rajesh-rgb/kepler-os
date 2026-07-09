# Kickoff — Deploy KEPLER OS to Staging

> Paste this whole file to start the deployment chat.

---

You're taking over **deployment** of **KEPLER OS** — a React 19 + Vite 8 single-page app backed by **Supabase** (Postgres + Auth + Deno Edge Functions; all AI calls go through a `ai-proxy` edge function to Google Vertex/Gemini). **Goal:** stand up a **staging URL** the team can test, with **auto-deploy on push** so changes keep shipping.

**Read first — the complete runbook:** `docs/STAGING-DEPLOYMENT.md`
(stack, build, env-var + edge-secret matrix, migrations, edge-function deploys, OAuth reconfiguration for the staging domain, CI, and a staged smoke-test checklist).

**First moves:**
1. **`git init` + push to GitHub** — the project isn't versioned yet; nothing deploys without this. `.gitignore` already excludes `.env*`.
2. **Decide:** a separate vs shared Supabase project for staging, and the host — **Vercel / Netlify / Cloudflare Pages**. SPA configs are already in the repo: `vercel.json`, `netlify.toml`, `public/_redirects` (Node pinned via `.nvmrc` = 22).
3. **Backend:** `supabase link` → `supabase db push` (migrations `001`–`017`; note there's **no `016`**, intentional) → `supabase functions deploy ai-proxy connector-proxy oauth-proxy` (`search-console` is deprecated — skip). Set client env + edge secrets per the runbook.
4. **CI:** the repo ships `.github/workflows/ci.yml` (build gate) and `.github/workflows/staging-backend.yml` (auto-deploys migrations + functions on push to `staging`; needs repo secrets `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`).
5. **Verify** with the smoke-test checklist (runbook §10).

**Constraints:** the app owner performs all cloud/account/secret steps and holds credentials — you write code + config only. Never set `VITE_SUPABASE_SERVICE_ROLE_KEY` or `VITE_*_API_KEY` on the client (the app refuses to boot). The app works **AI-only with zero connectors**, so the team can test immediately after boot; connectors are optional upside.
