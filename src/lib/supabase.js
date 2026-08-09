import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './env';
import { DEMO_MODE } from '../demo/flag';
import { demoClient } from '../demo/client';

/**
 * Browser Supabase client - anon key only.
 * Lazy-init so missing env can still render ConfigError at boot.
 * See docs/security-baseline.md for key handling and RLS expectations.
 *
 * In the demo build (VITE_DEMO_MODE=true) this resolves to the in-memory demo
 * client instead — no network, no project. See src/demo/README.md.
 */
let client = null;

const getClient = () => {
    if (!client) {
        if (DEMO_MODE) {
            client = demoClient;
            return client;
        }
        const { url, anonKey } = getSupabaseConfig();
        client = createClient(url, anonKey, {
            auth: {
                // Persist user auth across reloads for standard email/password sessions.
                persistSession: true,
                // Keep access tokens fresh during active browser sessions.
                autoRefreshToken: true,
                // This app does not implement frontend OAuth callback/hash handling.
                detectSessionInUrl: false,
            },
        });
    }
    return client;
};

export const supabase = new Proxy(
    {},
    {
        get(_target, prop) {
            const value = getClient()[prop];
            return typeof value === 'function' ? value.bind(getClient()) : value;
        },
    }
);
