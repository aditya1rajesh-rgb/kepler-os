# Kickoff — Security / Vulnerability Review of KEPLER OS

> Paste this whole file to start the security-review chat.

---

You're running a **security / vulnerability review** of **KEPLER OS** — a **multi-tenant** marketing app (React SPA + Supabase Postgres / Auth / Deno Edge Functions) that stores third-party **OAuth tokens and CRM credentials**. **Tenant isolation and secret handling are the crown jewels.**

**Read first — full context + checklist:** `docs/SECURITY-REVIEW.md`
(trust boundaries, the auth / RLS / column-privilege model, secrets inventory, a 13-point attack-surface checklist, and the exact files to inspect). Then read `docs/security-baseline.md`.

**Run:** the **`/security-review`** skill (primary) and **`/code-review`**, plus `npm audit`, a secret scan (e.g. gitleaks) over the repo **and** the built `dist/`, and RLS tests using a low-privilege test JWT.

**Prioritize (highest first):**
1. **Tenant isolation / IDOR** — can one workspace read/write another's data? Test RLS directly (PostgREST with user A's JWT vs workspace B) and every edge-function action with a foreign `workspaceId` (expect `403` via the membership check).
2. **Secret-column leakage** — as `authenticated`, `select refresh_token, credentials from workspace_integrations` must be **denied** (column privileges).
3. **Deployed-config checks** (review the *running* env, not just code): `ALLOW_LOCAL_UNAUTH` and `AI_PROXY_DEBUG` must be **off**; CORS `ALLOWED_ORIGINS`/`APP_URL` = the staging/prod origin only (**never `*`**); no secrets present in `dist/`.

**Report:** findings ranked by severity, each with `file:line`, a concrete failure scenario (inputs → wrong outcome), and a fix.

**Note:** the assistant that built this cannot create accounts, hold credentials, or deploy — so cloud/secret/CORS/Auth-URL configuration is done by the owner and must be reviewed as *deployed state*, not inferred from code alone.
