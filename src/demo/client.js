/**
 * A drop-in stand-in for the browser Supabase client, used only in the demo build.
 *
 * `from()` goes to the in-memory store; `auth` keeps a fake but well-shaped session
 * for the demo user (Priya at Ken42) so every authed screen renders; `storage`
 * keeps uploaded blobs in a Map for the length of the session.
 */
import { getStore } from './store';
import { DEMO_USER, DEMO_SESSION } from './dataset/identity';
import { DEMO_LATENCY_MS, sleep } from './flag';

let currentSession = DEMO_SESSION;
const listeners = new Set();

const emit = (event, session) => {
    for (const listener of listeners) {
        try {
            listener(event, session);
        } catch (error) {
            console.error('[demo] auth listener failed', error);
        }
    }
};

const ok = (data) => ({ data, error: null });

const demoAuth = {
    getSession: async () => {
        if (DEMO_LATENCY_MS > 0) await sleep(Math.min(DEMO_LATENCY_MS, 40));
        return ok({ session: currentSession });
    },

    getUser: async () => ok({ user: currentSession?.user ?? null }),

    onAuthStateChange: (callback) => {
        listeners.add(callback);
        // Supabase emits the initial session asynchronously; mirror that so the
        // AuthProvider's loading state resolves the same way it does in production.
        Promise.resolve().then(() => callback('INITIAL_SESSION', currentSession));
        return {
            data: {
                subscription: {
                    unsubscribe: () => listeners.delete(callback),
                },
            },
        };
    },

    // Any credentials sign you into the demo workspace — there are no accounts here.
    signInWithPassword: async ({ email }) => {
        if (DEMO_LATENCY_MS > 0) await sleep(400);
        currentSession = {
            ...DEMO_SESSION,
            user: { ...DEMO_USER, email: email?.trim() || DEMO_USER.email },
        };
        emit('SIGNED_IN', currentSession);
        return ok({ session: currentSession, user: currentSession.user });
    },

    signUp: async ({ email }) => {
        if (DEMO_LATENCY_MS > 0) await sleep(400);
        currentSession = {
            ...DEMO_SESSION,
            user: { ...DEMO_USER, email: email?.trim() || DEMO_USER.email },
        };
        emit('SIGNED_IN', currentSession);
        return ok({ session: currentSession, user: currentSession.user });
    },

    resend: async () => ok({}),

    signOut: async () => {
        currentSession = null;
        emit('SIGNED_OUT', null);
        return { error: null };
    },
};

const buckets = new Map();

const bucketOf = (name) => {
    if (!buckets.has(name)) buckets.set(name, new Map());
    return buckets.get(name);
};

const demoStorage = {
    from: (bucket) => ({
        upload: async (path, file) => {
            bucketOf(bucket).set(path, file);
            return ok({ path });
        },
        download: async (path) => {
            const file = bucketOf(bucket).get(path);
            if (!file) {
                return {
                    data: null,
                    error: { message: 'This demo file has no stored contents — its extracted text is already on the record.' },
                };
            }
            return ok(file);
        },
        remove: async (paths = []) => {
            for (const path of paths) bucketOf(bucket).delete(path);
            return ok(paths.map((path) => ({ name: path })));
        },
        createSignedUrl: async (path) => ok({ signedUrl: `blob:demo/${bucket}/${path}` }),
    }),
};

export const demoClient = {
    from: (table) => getStore().from(table),
    auth: demoAuth,
    storage: demoStorage,
    // The app never opens realtime channels or calls RPCs; fail loudly if that changes.
    channel: () => {
        throw new Error('[demo] realtime channels are not available in the demo build');
    },
    rpc: (name) => {
        throw new Error(`[demo] rpc("${name}") is not available in the demo build`);
    },
};

