-- 024_abm_research
--
-- ABM (account-based) research: the analyst chat researches a target company
-- (grounded), classifies it against the workspace's own ICP, then pulls + validates
-- contacts. Two tables:
--   abm_accounts  — one researched company (firmographics + ICP-fit classification)
--   abm_contacts  — the target personas/people for an account (fit-scored)
--
-- Contacts are top-of-funnel research output, NOT outreach recipients: to enter a
-- sequence a contact is projected into `prospects` (the recipient spine) via
-- save-to-prospect-list, and abm_contacts.prospect_id records that link.
--
-- Firmographics (size/revenue) may be LLM-estimated; emails/phones are only ever
-- real (blank + a 'needs-enrichment' flag when unverified — never fabricated).
--
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS public.abm_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL DEFAULT '',
    domain TEXT NOT NULL DEFAULT '',
    -- Analyst-labelled size band, e.g. 'enterprise' | 'mid-market' | 'smb'.
    tier TEXT NOT NULL DEFAULT '',
    -- ICP fit vs the workspace's own ICP ('' until classified).
    icp_fit TEXT NOT NULL DEFAULT '' CHECK (icp_fit IN ('', 'high', 'medium', 'low')),
    employee_size TEXT NOT NULL DEFAULT '',
    revenue TEXT NOT NULL DEFAULT '',
    -- Tech-stack / "digital engine" signals: ["Snowflake", "500+ engineers", ...].
    tech_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- The "why": grounded rationale for the tier + fit call.
    why_grounding TEXT NOT NULL DEFAULT '',
    recommended_channel TEXT NOT NULL DEFAULT '',
    -- Grounding citations backing the research: [{ "title": ..., "url": ... }].
    sources JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'researched' CHECK (status IN ('researched', 'saved', 'archived')),
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.abm_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.abm_accounts(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    seniority_tier TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    linkedin_url TEXT NOT NULL DEFAULT '',
    -- 0-100 fit score assigned by the validation pass.
    fit_score INT NOT NULL DEFAULT 0,
    fit_reasoning TEXT NOT NULL DEFAULT '',
    recommended_channel TEXT NOT NULL DEFAULT '',
    icp_relevance TEXT NOT NULL DEFAULT '',
    -- 'apollo' (real, pulled) | 'research' (analyst-surfaced, best-effort).
    source TEXT NOT NULL DEFAULT 'research' CHECK (source IN ('apollo', 'research')),
    external_id TEXT NOT NULL DEFAULT '',
    confidence TEXT NOT NULL DEFAULT '' CHECK (confidence IN ('', 'high', 'medium', 'low')),
    -- Validation flags: ["needs-enrichment", "title-mismatch", ...].
    flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Set once projected into the prospect list (nullable link, not required).
    prospect_id UUID REFERENCES public.prospects(id) ON DELETE SET NULL,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS abm_accounts_workspace_idx
    ON public.abm_accounts (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS abm_contacts_workspace_idx
    ON public.abm_contacts (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS abm_contacts_account_idx
    ON public.abm_contacts (workspace_id, account_id);

ALTER TABLE public.abm_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abm_contacts ENABLE ROW LEVEL SECURITY;

-- Workspace-scoped access via the shared membership helper (matches other tables).
DROP POLICY IF EXISTS "abm_accounts_workspace_member" ON public.abm_accounts;
CREATE POLICY "abm_accounts_workspace_member" ON public.abm_accounts
    FOR ALL
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "abm_contacts_workspace_member" ON public.abm_contacts;
CREATE POLICY "abm_contacts_workspace_member" ON public.abm_contacts
    FOR ALL
    USING (public.is_workspace_member(workspace_id))
    WITH CHECK (public.is_workspace_member(workspace_id));

DROP TRIGGER IF EXISTS abm_accounts_updated_at ON public.abm_accounts;
CREATE TRIGGER abm_accounts_updated_at
    BEFORE UPDATE ON public.abm_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS abm_contacts_updated_at ON public.abm_contacts;
CREATE TRIGGER abm_contacts_updated_at
    BEFORE UPDATE ON public.abm_contacts
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
