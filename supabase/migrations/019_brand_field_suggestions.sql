-- 019_brand_field_suggestions
--
-- Living brand model (V2 Phase 3): allow 'field' suggestions alongside
-- competitor/icp, so learned brand-model updates (mined from consistently
-- high-rated generation feedback) flow through the SAME reviewable
-- accept/dismiss flow as competitor/ICP suggestions — the brand core never
-- mutates silently.
--
-- 'field' payload shape:
--   { fieldPath: 'tone' | 'businessDetails.keyMessages' | 'businessDetails.differentiators',
--     action: 'add' | 'revise', proposedValue, rationale, evidence: [string] }
--
-- Safe to run repeatedly.

ALTER TABLE public.brand_suggestions
    DROP CONSTRAINT IF EXISTS brand_suggestions_suggestion_type_check;

ALTER TABLE public.brand_suggestions
    ADD CONSTRAINT brand_suggestions_suggestion_type_check
    CHECK (suggestion_type IN ('competitor', 'icp', 'field'));

NOTIFY pgrst, 'reload schema';
