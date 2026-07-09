-- KEPLER OS — AI proxy per-user rate limiting
-- Adds a minimal fixed-window counter + RPC used by the ai-proxy Edge Function.

CREATE TABLE IF NOT EXISTS public.ai_proxy_rate_limits (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    window_start TIMESTAMPTZ NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, window_start),
    CONSTRAINT ai_proxy_rate_limits_nonnegative CHECK (request_count >= 0)
);

-- Security model:
-- - direct table access is not exposed to anon/authenticated roles
-- - clients call the RPC only
REVOKE ALL ON TABLE public.ai_proxy_rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.ai_proxy_rate_limit_take(
    p_limit INTEGER DEFAULT 15,
    p_window_seconds INTEGER DEFAULT 60
)
RETURNS TABLE (
    allowed BOOLEAN,
    current_count INTEGER,
    retry_after_seconds INTEGER,
    window_started_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_now TIMESTAMPTZ := now();
    v_window_seconds INTEGER := GREATEST(COALESCE(p_window_seconds, 60), 1);
    v_limit INTEGER := GREATEST(COALESCE(p_limit, 15), 1);
    v_window_start TIMESTAMPTZ;
    v_count INTEGER;
    v_retry_after INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'auth_required';
    END IF;

    v_window_start := to_timestamp(
        floor(extract(epoch from v_now) / v_window_seconds) * v_window_seconds
    );

    INSERT INTO public.ai_proxy_rate_limits (user_id, window_start, request_count, updated_at)
    VALUES (v_user_id, v_window_start, 1, now())
    ON CONFLICT (user_id, window_start)
    DO UPDATE SET
        request_count = public.ai_proxy_rate_limits.request_count + 1,
        updated_at = now()
    RETURNING request_count INTO v_count;

    v_retry_after := GREATEST(
        ceil(extract(epoch from ((v_window_start + make_interval(secs => v_window_seconds)) - v_now)))::INTEGER,
        1
    );

    RETURN QUERY
    SELECT
        (v_count <= v_limit) AS allowed,
        v_count AS current_count,
        CASE WHEN v_count <= v_limit THEN 0 ELSE v_retry_after END AS retry_after_seconds,
        v_window_start AS window_started_at;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_proxy_rate_limit_take(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_proxy_rate_limit_take(INTEGER, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
