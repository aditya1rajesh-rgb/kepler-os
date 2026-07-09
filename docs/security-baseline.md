# Security Baseline — Kepler OS (React + Vite + Supabase)

This document describes the security model and operational guardrails for the live-only runtime.

## Auth model

- **Identity:** Supabase Auth (email/password). Session managed by `@supabase/supabase-js` in the browser.
- **Profile:** `public.user_profiles` row created on signup via `handle_new_user()` trigger (SECURITY DEFINER, least-privilege `search_path`).
- **Workspace access:** Enforced at three layers:
  1. **RLS** on all workspace-scoped tables
  2. **Service-layer** membership checks (`workspaceService.assertMembership`, UUID validation)
  3. **Route guards** (`ProtectedRoute`, `WorkspaceMemberRoute`)

Users may only read/write rows for workspaces where they appear in `workspace_members`.

## Key handling rules

| Key | Where | Rule |
|-----|-------|------|
| `VITE_SUPABASE_URL` | Frontend (Vite) | Required at boot; placeholder values rejected |
| `VITE_SUPABASE_ANON_KEY` | Frontend (Vite) | Required at boot; public by design |
| Service role key | **Never** in frontend | Server-side / Supabase dashboard / CI secrets only |

- Boot validation lives in `src/lib/env.js`. Missing or forbidden keys show `ConfigError` — the app does **not** fall back to demo mode.
- `validateClientEnv()` rejects `VITE_SUPABASE_SERVICE_ROLE_KEY` and similar privileged vars in the client bundle.

## Storage policy rules

- Bucket: `workspace-files` (private)
- Path convention: `{workspace_id}/{file_id}/{filename}`
- Policies (migration `002_rls_hardening.sql`): SELECT/INSERT/UPDATE/DELETE require `is_workspace_member(first_path_segment)`
- Allowed MIME types: PDF, plain text, CSV, PNG, JPEG, WebP
- Max file size: 50 MB (bucket setting)

## RLS expectations

All tables in `public` that hold tenant data have RLS **enabled**:

| Table | Access rule |
|-------|-------------|
| `user_profiles` | Own row only (SELECT/UPDATE/INSERT own `id`) |
| `workspace_members` | See own memberships; insert only as first member (bootstrap) or when invited by owner |
| `workspaces` | SELECT/UPDATE via membership; DELETE by owners only |
| `brand_profiles`, `competitors`, `personas`, `workspace_files` | CRUD via `is_workspace_member(workspace_id)` |

Helper functions: `is_workspace_member(uuid)`, `is_workspace_owner(uuid)` — granted to `authenticated` only.

## Client state (localStorage)

- **Stored:** `kepler:active_workspace_id` (UUID only, non-sensitive UI preference)
- **Not stored:** tokens (Supabase handles session storage), profile data, secrets
- **Sign-out:** `clientState.clear()` + Supabase `signOut()` in `AuthContext`

## Input validation

- `src/lib/validation.js` — sanitization, UUID checks, workspace/auth form validation
- Services reject non-UUID workspace IDs before querying
- User-facing errors via `src/lib/errors.js` (`toUserMessage`) — no stack traces or raw PostgREST errors in UI

## Local development rules

1. Copy `.env.example` → `.env.local` with real Supabase project values
2. Apply migrations in order: `001_core_schema.sql`, then `002_rls_hardening.sql`
3. Do not commit `.env.local` or any file containing keys
4. Use Supabase local stack or a dedicated dev project — never production keys in shared branches

## Production deployment checklist

### Supabase project

- [ ] Apply both SQL migrations; verify RLS enabled on all tenant tables
- [ ] Confirm `handle_new_user` trigger is active
- [ ] Create/verify `workspace-files` bucket (private)
- [ ] Run RLS verification query: attempt cross-tenant read as test user (should return zero rows)

### Auth provider

- [ ] Set Site URL and redirect URLs to production domain(s)
- [ ] Decide email verification policy (recommended: **required** for production)
- [ ] Configure password strength / rate limiting in Supabase Auth settings
- [ ] Review OAuth providers if enabled (not required for email-only)

### Frontend build

- [ ] Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in hosting env (not in repo)
- [ ] Confirm no service-role vars in build output (`grep -r service_role dist/` should be empty)
- [ ] Enable HTTPS only; set strict CSP headers at CDN/hosting layer

### Operations

- [ ] Enable Supabase log drain or external monitoring for auth failures and RLS denials
- [ ] Set up error tracking (Sentry, etc.) with PII scrubbing
- [ ] Document incident response for key rotation
- [ ] Backup policy for Postgres and storage

## Remaining decisions (product / ops)

These require explicit choices before production:

1. **Email verification** — enforce in Supabase Auth vs allow immediate access
2. **Multi-user invites** — owner invite flow UI not yet built; RLS supports owner-invited inserts
3. **File upload** — storage policies exist; client upload implementation is stubbed
4. **AI workflow secrets** — any LLM API keys must stay server-side (Edge Functions / backend), never in Vite env
5. **Audit logging** — consider `pg_audit` or application-level audit table for compliance

## Related files

- `src/lib/env.js` — client env validation
- `src/lib/clientState.js` — non-sensitive persisted UI state
- `src/lib/validation.js` — input validation
- `src/lib/errors.js` — safe error surfaces
- `src/components/auth/WorkspaceMemberRoute.jsx` — route-level membership guard
- `supabase/migrations/001_core_schema.sql` — base schema + initial RLS
- `supabase/migrations/002_rls_hardening.sql` — hardened policies + storage
