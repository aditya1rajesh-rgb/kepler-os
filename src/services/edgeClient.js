import { supabase } from '../lib/supabase';

/** Thrown when there is no signed-in user to authenticate an edge request. */
export class EdgeAuthError extends Error {
    constructor(message = 'You must be signed in.') {
        super(message);
        this.name = 'EdgeAuthError';
    }
}

const getConfig = () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
    if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL is not set');
    if (!anonKey) throw new Error('VITE_SUPABASE_ANON_KEY is not set');
    return { baseUrl: supabaseUrl.replace(/\/$/, ''), anonKey };
};

const buildHeaders = async (anonKey) => {
    const { data, error } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    if (error || !accessToken) throw new EdgeAuthError();
    return {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
    };
};

/**
 * POST to a Supabase edge function with the caller's session auth (mirrors the
 * aiClient proxy pattern). Shared by connector services (Search Console, …).
 * @param {string} fnName edge function name (e.g. 'search-console')
 * @param {object} body JSON body
 * @param {{timeoutMs?:number}} [opts]
 * @returns {Promise<any>} parsed JSON. Throws EdgeAuthError if unauthenticated,
 *   or Error with the function's error message on a non-2xx response.
 */
export const callEdgeFunction = async (fnName, body = {}, { timeoutMs = 30000 } = {}) => {
    const { baseUrl, anonKey } = getConfig();
    const headers = await buildHeaders(anonKey);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
        res = await fetch(`${baseUrl}/functions/v1/${fnName}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }
    let json = null;
    try {
        json = await res.json();
    } catch {
        /* non-JSON response */
    }
    if (!res.ok) {
        const msg = json?.error?.message || json?.error || `Request failed (${res.status})`;
        throw new Error(msg);
    }
    return json;
};
