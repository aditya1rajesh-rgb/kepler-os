/**
 * Client environment validation (Vite - browser-safe vars only).
 *
 * Required:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *
 * Never expose service-role or other privileged keys in Vite env.
 */
import { DEMO_MODE } from '../demo/flag';

const PLACEHOLDER_URL = 'placeholder';
const PLACEHOLDER_KEY = 'placeholder-key';

const FORBIDDEN_CLIENT_VARS = [
    'VITE_SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'VITE_OPENROUTER_API_KEY',
];

export const validateClientEnv = () => {
    // The demo build has no backend to point at, so Supabase config is not required
    // (and must not be present) — see src/demo/README.md.
    if (DEMO_MODE) return { valid: true, missing: [], forbidden: [] };

    const missing = [];
    const forbidden = FORBIDDEN_CLIENT_VARS.filter((key) => Boolean(import.meta.env[key]));

    const url = import.meta.env.VITE_SUPABASE_URL?.trim();
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

    if (!url || url.includes(PLACEHOLDER_URL)) {
        missing.push('VITE_SUPABASE_URL');
    }
    if (!anonKey || anonKey === PLACEHOLDER_KEY) {
        missing.push('VITE_SUPABASE_ANON_KEY');
    }

    return {
        valid: missing.length === 0 && forbidden.length === 0,
        missing,
        forbidden,
    };
};

export const getSupabaseConfig = () => {
    const result = validateClientEnv();
    if (!result.valid) {
        throw new Error(
            `Invalid client configuration: missing [${result.missing.join(', ')}]` +
            (result.forbidden.length ? `; forbidden [${result.forbidden.join(', ')}]` : '')
        );
    }

    return {
        url: import.meta.env.VITE_SUPABASE_URL.trim(),
        anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY.trim(),
    };
};
