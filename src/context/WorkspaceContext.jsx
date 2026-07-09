import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { workspaceService } from '../services/workspaceService';
import { onboardingTrace } from '../lib/onboardingTrace';

const WorkspaceContext = createContext(null);

export const WorkspaceProvider = ({ children }) => {
    const { session, loading: authLoading } = useAuth();
    const [workspaces, setWorkspaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const refreshWorkspaces = useCallback(async () => {
        if (authLoading) {
            return;
        }

        if (!session) {
            setWorkspaces([]);
            setLoading(false);
            setError(null);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            onboardingTrace('WorkspaceContext:refreshWorkspaces:start');
            await workspaceService.syncActiveWorkspaceFromProfile();
            const data = await workspaceService.getWorkspaces();
            setWorkspaces(data);
            onboardingTrace('WorkspaceContext:refreshWorkspaces:end', { count: data.length });
        } catch (err) {
            console.error('Failed to load workspaces:', err);
            onboardingTrace('WorkspaceContext:refreshWorkspaces:error', err);
            setWorkspaces([]);
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [authLoading, session]);

    useEffect(() => {
        refreshWorkspaces();
    }, [refreshWorkspaces]);

    const getWorkspaceById = useCallback(
        (id) => workspaces.find((ws) => String(ws.id) === String(id)) ?? null,
        [workspaces]
    );

    const value = useMemo(
        () => ({
            workspaces,
            loading,
            error,
            refreshWorkspaces,
            getWorkspaceById,
        }),
        [workspaces, loading, error, refreshWorkspaces, getWorkspaceById]
    );

    return (
        <WorkspaceContext.Provider value={value}>
            {children}
        </WorkspaceContext.Provider>
    );
};

export const useWorkspace = () => {
    const context = useContext(WorkspaceContext);
    if (!context) {
        throw new Error('useWorkspace must be used within WorkspaceProvider');
    }
    return context;
};
