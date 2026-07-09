-- KEPLER OS — schema reconciliation (Phase 15B)
-- Fixes schema drift where live tables are missing columns defined in 001_core_schema.sql
-- (e.g. PGRST204 "Could not find the 'brand_colors' column of 'workspaces'").
--
-- Safe to run multiple times: every statement uses IF NOT EXISTS and provides
-- defaults so existing rows stay valid.
--
-- Apply in the Supabase SQL editor, then reload the API schema cache (last line).

-- ── workspaces ────────────────────────────────────────────────────────────────
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Untitled workspace';
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS url TEXT NOT NULL DEFAULT '';
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS tagline TEXT DEFAULT '';
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS industry TEXT DEFAULT 'Consumer Brand';
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS logo_color TEXT DEFAULT '#6666ff';
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS brand_colors JSONB NOT NULL DEFAULT '["#6666ff","#b9b8ff","#b9f0d7","#ffffff"]'::jsonb;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS last_active_module TEXT DEFAULT 'Brand Intelligence';
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS brand_intel_status INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ── user_profiles ─────────────────────────────────────────────────────────────
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS active_workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ── workspace_members ─────────────────────────────────────────────────────────
ALTER TABLE public.workspace_members ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE public.workspace_members ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ── brand_profiles ────────────────────────────────────────────────────────────
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS url TEXT DEFAULT '';
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS tagline TEXT DEFAULT '';
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS overview TEXT DEFAULT '';
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS colors JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS fonts JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS brand_values JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS aesthetic JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS tone JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.brand_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ── competitors ───────────────────────────────────────────────────────────────
ALTER TABLE public.competitors ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.competitors ADD COLUMN IF NOT EXISTS url TEXT DEFAULT '';
ALTER TABLE public.competitors ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.competitors ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE public.competitors ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ── personas ──────────────────────────────────────────────────────────────────
ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT '';
ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS titles JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS pain_points TEXT DEFAULT '';
ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS channels JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ── workspace_files ───────────────────────────────────────────────────────────
ALTER TABLE public.workspace_files ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.workspace_files ADD COLUMN IF NOT EXISTS size_bytes BIGINT;
ALTER TABLE public.workspace_files ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.workspace_files ADD COLUMN IF NOT EXISTS scope JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.workspace_files ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE public.workspace_files ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ── Reload PostgREST schema cache so the API sees new columns immediately ──────
NOTIFY pgrst, 'reload schema';
