# KEPLER OS — Security Review Context

> Hand this to a fresh chat to run a security / vulnerability review. Pair it with the `/security-review` and `/code-review` skills. The app is **multi-tenant** and handles third-party **OAuth tokens** + **CRM credentials**, so tenant isolation and secret handling are the crown jewels.

---

## 1. Trust boundaries

| Layer | Trust | Notes |
|---|---|---|
| **React SPA** (browser) | Untrusted | Ships only the public **anon key**. Assume all client input hostile. |
| **Supabase Edge Functions** (Deno) | Trust boundary | Verify JWT + workspace membership; hold the **service-role** key + all provider secrets. |
| **Postgres** (Supabase) | Enforced | **RLS** on every workspace table; **column privileges** hide secret columns. |
| **Third-party APIs** (Google/Meta/HubSpot/Apollo/Zoho) | External | Called **only server-side** from edge functions. |

## 2. AuthN / AuthZ model (verify this holds everywhere)

- **Supabase Auth (JWT).** Client signs in, sends `Authorization: Bearer <jwt>` to edge functions.
- Every edge function: `verify_jwt = true` (`supabase/config.toml`) → `getUser(token)` for identity → a **service-role** client for privileged reads/writes → **`is_workspace_member(workspaceId)`** (or a `workspace_members` lookup) **before any workspace action**. This is the IDOR guard — confirm no action path skips it.
- ⚠️ **`ALLOW_LOCAL_UNAUTH`** (in `ai-proxy`) is a **local smoke-test bypass** (`ALLOW_LOCAL_UNAUTH=true` + no bearer → unauth allowed). **Must be unset/false in staging + prod.** Same for `AI_PROXY_DEBUG`. **Verify these are not set in deployed envs.**

## 3. Data protection

- **RLS** — `supabase/migrations/002_rls_hardening.sql` + per-table policies using `public.is_workspace_member(workspace_id)`. All workspace-scoped tables (campaigns, content_items, workspace_integrations, prospects, campaign_metrics, …) are gated.
- **Column privileges** — `013_workspace_integrations.sql` / `014_connector_credentials.sql` `REVOKE` + `GRANT SELECT` **exclude the secret columns** (`refresh_token`, `credentials`) from `anon`/`authenticated`. The client can read connection **status/meta** but never the secret; only the service role (edge fn) reads secrets.
- **Client env guard** — `src/lib/env.js` refuses to boot if `VITE_SUPABASE_SERVICE_ROLE_KEY`, `VITE_OPENROUTER_API_KEY`, or `VITE_VERTEX_SERVICE_ACCOUNT` are present → prevents secret leakage into the bundle.

## 4. Secrets inventory (all server-side)

`VERTEX_SERVICE_ACCOUNT` (base64 JSON), `VERTEX_AI_LOCATION/MODEL_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `META_OAUTH_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, and **connector user credentials** (OAuth refresh tokens + api-key JSON) stored in `workspace_integrations` hidden columns. **None** should appear in `dist/`.

## 5. Attack surface — test checklist

1. **Tenant isolation / IDOR** — with user A's JWT, attempt to read/write workspace B's rows (direct PostgREST) and call each edge-function action with B's `workspaceId`. Expect RLS denial + `403` (membership check).
2. **Secret-column leakage** — as `authenticated`, `select refresh_token, credentials from workspace_integrations` → must be **denied** by column privileges.
3. **Edge-function authz** — unauth request → `401`; cross-tenant → `403`; confirm `ALLOW_LOCAL_UNAUTH` off.
4. **OAuth CSRF / state** — `oauth-proxy` `exchangeCode`; client `verifyState` uses a sessionStorage **nonce**. Verify state can't be forged/replayed and the nonce is single-use.
5. **Open redirect** — the callback route (`/integrations/oauth/callback`) — confirm post-auth navigation is not user-controlled.
6. **Input validation** — edge bodies: `workspaceId` UUID-checked; `provider`/`action` validated against fixed registry maps (no arbitrary dispatch).
7. **SSRF** — edge functions fetch **only fixed provider hosts** (audited: no user-supplied host is fetched server-side). Re-confirm after any change.
8. **XSS** — React auto-escapes; **no `dangerouslySetInnerHTML`** in the codebase (audited). Confirm no `innerHTML`/`eval`, and review rendering of AI-generated + connector-returned strings.
9. **Secrets in bundle** — grep `dist/` for key patterns; confirm the env guard.
10. **Dependencies** — `npm audit`; Deno imports are pinned (`esm.sh/@supabase/supabase-js@2`).
11. **CORS** — `ALLOWED_ORIGINS` / `APP_URL` allowlist in every edge fn; verify the deployed value is the staging/prod origin only (never `*`).
12. **Abuse / cost** — authed users can call `ai-proxy` without a per-user quota; consider rate limiting (AI spend abuse).
13. **New tables** — confirm RLS policies exist + are correct on `prospects` (015) and `campaign_metrics` (017).

## 6. Files / areas of interest

- **AuthN/Z:** `supabase/functions/*/index.ts` (look for `getUserId`, `isMember`, `verify_jwt`), `supabase/config.toml`.
- **RLS + privileges:** `supabase/migrations/002_rls_hardening.sql`, `013`, `014`, `015`, `017`.
- **Client env guard:** `src/lib/env.js`.
- **OAuth flow:** `src/services/integrationService.js` (`buildAuthUrl`/`verifyState`), `src/pages/GoogleOAuthCallback.jsx`, `supabase/functions/oauth-proxy/index.ts`.
- **Connector credential handling:** `supabase/functions/connector-proxy/index.ts` (stores/reads `credentials`), `oauth-proxy` (stores/reads `refresh_token`).

## 7. Tooling / skills to use

- **`/security-review`** — reviews the pending diff for vulnerabilities (primary).
- **`/code-review`** — correctness + security pass.
- `npm audit`; a secret scanner (e.g. gitleaks) over the repo + built `dist/`; SQL RLS tests using a low-privilege test JWT.
- Read the existing **`docs/security-baseline.md`** first (production checklist).

## 8. Known / accepted design notes (not necessarily bugs)

- Connector secrets live in Postgres hidden columns (RLS + column privileges), **not a dedicated vault** — acceptable given the model; flag if a higher assurance bar is required.
- **Zoho** stores a permanent refresh token; **Meta** stores a ~60-day long-lived token; **Google** stores a refresh token — all in `workspace_integrations.refresh_token` (hidden).
- No app-level rate limiting on edge functions (relies on Supabase platform limits).
- The assistant that built this **cannot** create accounts, hold credentials, or deploy — all cloud/secret setup is done by the owner, so review the *deployed* config (env/secrets/CORS/Auth URLs), not just the code.
