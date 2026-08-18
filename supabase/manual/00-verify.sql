-- ═══════════════════════════════════════════════════════════════════════════
-- KEPLER · verification. Run this FIRST, on its own, and read the three results.
--
-- The app's database (dtqmgpznbomafrzptfca) still reports public.goals as
-- missing, so the SQL is not reaching it. This tells us which of the two causes
-- it is, rather than guessing again.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1 · WHICH DATABASE AM I IN?
--     Compare this against the project ref in your browser's address bar:
--     supabase.com/dashboard/project/<REF>/sql   ← this REF must be
--     dtqmgpznbomafrzptfca
--     If it is not, you are applying the SQL to a different project, which
--     explains everything - the statements succeed, just somewhere else.
SELECT
    current_database()                      AS database,
    current_user                            AS connected_as,
    inet_server_addr()::text                AS server_ip;

-- 2 · DOES THE GOALS TABLE EXIST HERE?
--     'MISSING' means 01-goals.sql has not successfully run in THIS database.
SELECT
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'goals'
    ) THEN 'EXISTS' ELSE 'MISSING' END      AS goals_table;

-- 3 · WHAT IS IN public?
--     Expect workspaces, campaigns, sequences, prospects, content_items,
--     workspace_events. If you see NONE of those, this is the wrong database.
SELECT string_agg(table_name, ', ' ORDER BY table_name) AS public_tables
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
