-- KEPLER OS — Audience & ICP population
-- Adds structured detail storage + provenance to confirmed personas.
-- Suggested ICPs continue to live in public.brand_suggestions (suggestion_type='icp').

-- ── personas extensions ───────────────────────────────────────────────────────
-- Extended ICP fields (segment, company type, geography, triggers, blockers,
-- buying context, messaging hooks, use cases) kept in JSONB for downstream
-- ads/outreach consumption without widening the relational schema.
ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Provenance for confirmed personas: 'manual' | 'website' | 'file' | 'combined' | 'ai'.
ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS source_origin TEXT NOT NULL DEFAULT 'manual';

-- Reload PostgREST schema cache so the API sees the new columns immediately.
NOTIFY pgrst, 'reload schema';
