import { supabase } from '../lib/supabase';
import { clientState } from '../lib/clientState';
import { sanitizeDisplayName, sanitizeEmailLocalPart } from '../lib/validation';

export const authService = {
    getSession: () => supabase.auth.getSession(),

    onAuthStateChange: (callback) => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
        return () => subscription.unsubscribe();
    },

    signIn: (email, password) =>
        supabase.auth.signInWithPassword({ email, password }),

    signUp: (email, password, metadata = {}) =>
        supabase.auth.signUp({
            email,
            password,
            options: { data: metadata },
        }),

    resendConfirmation: (email) =>
        supabase.auth.resend({ type: 'signup', email }),

    signOut: async () => {
        clientState.clear();
        return supabase.auth.signOut();
    },
};

export const getUserDisplayName = (user, profile) => {
    const fromProfile = sanitizeDisplayName(profile?.display_name);
    if (fromProfile) return fromProfile;

    if (user?.email) {
        return sanitizeEmailLocalPart(user.email);
    }

    return 'User';
};

export const getUserInitials = (displayName) => {
    const name = sanitizeDisplayName(displayName) || 'User';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
};
