-- 029_prospect_enrichment
--
-- Apollo email/phone enrichment for prospects. Search returns no emails/phones
-- (a separate, credit-based Apollo call reveals them), so these fill in when the
-- user enriches a list. `email` already exists (015); add `phone` + a timestamp of
-- the last successful reveal. Enrichment writes are done client-side via
-- prospectsService.updateEnrichment after the connector-proxy `enrich` action
-- returns; no RLS change (inherits the prospects policies).
--
-- Safe to run repeatedly.

ALTER TABLE public.prospects
    ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';

ALTER TABLE public.prospects
    ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
