import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import { isUuid } from '../../lib/validation';
import { workspaceService } from '../../services/workspaceService';
import { onboardingTrace } from '../../lib/onboardingTrace';
import AuthLoading from './AuthLoading';

const WorkspaceMemberRoute = ({ children }) => {
    const { workspaceId } = useParams();
    const { workspaces, loading } = useWorkspace();

    if (loading) {
        return <AuthLoading />;
    }

    if (!isUuid(workspaceId)) {
        onboardingTrace('WorkspaceMemberRoute:reject', { reason: 'invalid-id', workspaceId });
        return <Navigate to="/" replace />;
    }

    const isMember = workspaces.some((ws) => String(ws.id) === String(workspaceId));
    const isActiveWorkspace =
        String(workspaceService.getActiveWorkspaceId()) === String(workspaceId);

    if (!isMember && !isActiveWorkspace) {
        onboardingTrace('WorkspaceMemberRoute:reject', {
            reason: 'not-member',
            workspaceId,
            isMember,
            isActiveWorkspace,
            workspaceCount: workspaces.length,
        });
        return <Navigate to="/" replace />;
    }

    onboardingTrace('WorkspaceMemberRoute:allow', { workspaceId, isMember, isActiveWorkspace });
    return children;
};

export default WorkspaceMemberRoute;
