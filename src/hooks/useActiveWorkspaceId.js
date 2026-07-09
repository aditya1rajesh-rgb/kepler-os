import { useParams, useLocation } from 'react-router-dom';
import { useWorkspace } from '../context/WorkspaceContext';
import { workspaceService } from '../services/workspaceService';
import { isUuid } from '../lib/validation';

/**
 * Active workspace id from URL, then DB-backed cache, then first owned workspace.
 */
export const useActiveWorkspaceId = () => {
    const { workspaceId } = useParams();
    const location = useLocation();
    const { workspaces } = useWorkspace();

    if (workspaceId && isUuid(workspaceId)) {
        return String(workspaceId);
    }

    const match = location.pathname.match(/\/workspace\/([^/]+)/);
    if (match?.[1] && isUuid(match[1])) {
        return match[1];
    }

    const stored = workspaceService.getActiveWorkspaceId();
    if (stored && isUuid(stored)) {
        const stillMember = workspaces.some((ws) => String(ws.id) === stored);
        if (stillMember) return stored;
    }

    return workspaces[0]?.id ? String(workspaces[0].id) : null;
};
