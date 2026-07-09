import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authService, getUserDisplayName, getUserInitials } from '../services/authService';
import { workspaceService } from '../services/workspaceService';
import { clientState } from '../lib/clientState';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [session, setSession] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    const loadProfile = useCallback(async () => {
        try {
            const data = await workspaceService.getUserProfile();
            setProfile(data);
        } catch {
            setProfile(null);
        }
    }, []);

    useEffect(() => {
        let mounted = true;

        authService.getSession().then(({ data }) => {
            if (!mounted) return;
            setSession(data.session ?? null);
            setLoading(false);
        });

        const unsubscribe = authService.onAuthStateChange((_event, nextSession) => {
            if (!mounted) return;
            // Supabase re-emits SIGNED_IN / TOKEN_REFRESHED when a tab or window
            // regains focus. Keep the SAME session object when the user is
            // unchanged so React bails out of the update — otherwise the re-render
            // cascade resets in-progress module state (a generated-but-unsaved
            // sequence, prospect search results, etc.). The Supabase client holds
            // the refreshed token internally, so API calls still use the fresh
            // token regardless of what this React state reference holds.
            setSession((prev) => {
                const nextUserId = nextSession?.user?.id ?? null;
                const prevUserId = prev?.user?.id ?? null;
                if (nextUserId && nextUserId === prevUserId) return prev;
                return nextSession ?? null;
            });
            setLoading(false);
            if (!nextSession) {
                setProfile(null);
                clientState.clear();
            }
        });

        return () => {
            mounted = false;
            unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (session) {
            loadProfile();
        } else {
            setProfile(null);
        }
    }, [session, loadProfile]);

    const user = session?.user ?? null;
    const displayName = getUserDisplayName(user, profile);
    const initials = getUserInitials(displayName);

    const signOut = useCallback(async () => {
        await authService.signOut();
        setProfile(null);
    }, []);

    const value = useMemo(
        () => ({
            session,
            user,
            profile,
            displayName,
            initials,
            loading,
            signOut,
            refreshProfile: loadProfile,
        }),
        [session, user, profile, displayName, initials, loading, signOut, loadProfile]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};
