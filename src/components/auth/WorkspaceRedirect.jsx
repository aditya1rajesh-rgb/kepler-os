import React from 'react';
import { Navigate } from 'react-router-dom';
import { workspacePath } from '../../constants/routes';
import { workspaceService } from '../../services/workspaceService';
import { useWorkspace } from '../../context/WorkspaceContext';
import AuthLoading from './AuthLoading';

const WorkspaceRedirect = () => {
    const { workspaces, loading } = useWorkspace();

    if (loading) {
        return <AuthLoading />;
    }

    if (workspaces.length === 0) {
        return <Navigate to="/onboarding" replace />;
    }

    const workspaceId =
        workspaceService.getActiveWorkspaceId() &&
        workspaces.some((ws) => String(ws.id) === workspaceService.getActiveWorkspaceId())
            ? workspaceService.getActiveWorkspaceId()
            : workspaces[0].id;

    if (!workspaceId) {
        return <Navigate to="/onboarding" replace />;
    }

    return <Navigate to={workspacePath(workspaceId)} replace />;
};

export default WorkspaceRedirect;
