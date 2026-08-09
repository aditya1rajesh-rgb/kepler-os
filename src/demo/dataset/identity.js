/**
 * The demo operator and workspace identity.
 *
 * Priya Menon is Ken42's (fictional) head of growth — the person "running" this
 * workspace. Everything in the demo dataset is attributed to her.
 */
import { id } from '../ids';
import { daysAgo } from './time';

export const DEMO_USER_ID = id('user-priya');
export const DEMO_WORKSPACE_ID = id('workspace-ken42');

export const DEMO_USER = {
    id: DEMO_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'priya@ken42.com',
    email_confirmed_at: daysAgo(96),
    phone: '',
    confirmed_at: daysAgo(96),
    last_sign_in_at: daysAgo(0.02),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { display_name: 'Priya Menon' },
    identities: [],
    created_at: daysAgo(96),
    updated_at: daysAgo(0.02),
};

export const DEMO_SESSION = {
    access_token: 'demo-access-token',
    refresh_token: 'demo-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: DEMO_USER,
};
