import { useEffect, useState } from 'react';
import { useParams, useLocation, Navigate } from 'react-router-dom';
import ErrorBoundary from '../components/common/ErrorBoundary';
import { workspacePath } from '../constants/routes';
import { resolveWorkspaceLocation } from '../constants/moduleRegistry';
import { workspaceService } from '../services/workspaceService';
import './Workspace.css';

import Dashboard from './workspace-modules/Dashboard';
import Campaigns from './workspace-modules/Campaigns';
import Library from './workspace-modules/Library';
import BrandIntelligence from './workspace-modules/BrandIntelligence';
import SeoAeo from './workspace-modules/SeoAeo';
import SocialMedia from './workspace-modules/SocialMedia';
import AdCampaigns from './workspace-modules/AdCampaigns';
import Outreach from './workspace-modules/Outreach';
import Measurement from './workspace-modules/Measurement';
import Integrations from './workspace-modules/Integrations';

const Workspace = () => {
    const { workspaceId, moduleId, subModuleId } = useParams();
    const location = useLocation();
    const [workspaceData, setWorkspaceData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (workspaceId) {
            workspaceService.setActiveWorkspaceId(workspaceId);
        }
    }, [workspaceId]);

    useEffect(() => {
        let mounted = true;
        workspaceService.getWorkspace(workspaceId)
            .then((workspace) => { if (mounted) setWorkspaceData(workspace); })
            .finally(() => { if (mounted) setLoading(false); });
        return () => { mounted = false; };
    }, [workspaceId]);

    // Resolve the raw URL to a canonical location (or a redirect) BEFORE any loading
    // guard, so bad/legacy URLs never flash a loading state.
    const resolved = resolveWorkspaceLocation({ moduleId, subModuleId, search: location.search });
    if (resolved.redirect) {
        const { moduleId: m, subModuleId: s, search } = resolved.redirect;
        return <Navigate to={workspacePath(workspaceId, m, s) + (search || '')} replace />;
    }

    const activeModule = resolved.moduleId;

    if (loading) {
        return (
            <div className="workspace">
                <div className="workspace__inner workspace__loading">Loading workspace…</div>
            </div>
        );
    }

    if (!workspaceData) {
        return <Navigate to="/" replace />;
    }

    const renderModule = () => {
        switch (activeModule) {
            case 'overview':
                return <Dashboard workspaceId={workspaceId} workspace={workspaceData} />;
            case 'measurement':
                return <Measurement workspaceId={workspaceId} />;
            case 'campaigns':
                return <Campaigns workspaceId={workspaceId} />;
            case 'brand-intelligence':
                return <BrandIntelligence workspaceId={workspaceId} workspace={workspaceData} />;
            case 'seo-aeo':
                return <SeoAeo workspaceId={workspaceId} />;
            case 'social-media':
                return <SocialMedia workspaceId={workspaceId} />;
            case 'ad-campaigns':
                return <AdCampaigns workspaceId={workspaceId} />;
            case 'outreach':
                return <Outreach workspaceId={workspaceId} />;
            case 'integrations':
                return <Integrations workspaceId={workspaceId} />;
            case 'library':
                return <Library workspaceId={workspaceId} />;
            default:
                return <Dashboard workspaceId={workspaceId} workspace={workspaceData} />;
        }
    };

    // The header (usePageTitle) is the single title source, so the content area holds
    // module content only.
    return (
        <div className="workspace">
            <div className="workspace__inner">
                <div className="workspace-module-content">
                    <ErrorBoundary>
                        {renderModule()}
                    </ErrorBoundary>
                </div>
            </div>
        </div>
    );
};

export default Workspace;
