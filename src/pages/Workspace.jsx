import { useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import Tabs from '../components/ui/Tabs';
import Panel from '../components/ui/Panel';
import ErrorBoundary from '../components/common/ErrorBoundary';
import { DEFAULT_MODULE_ID, isValidModuleId, workspacePath } from '../constants/routes';
import { workspaceService } from '../services/workspaceService';
import { useActivation } from '../context/ActivationContext';
import { isModuleLocked, MODULE_GATES, nextStepModuleId } from '../lib/activation';
import './Workspace.css';

import Overview from './workspace-modules/Overview';
import Campaigns from './workspace-modules/Campaigns';
import Library from './workspace-modules/Library';
import BrandIntelligence from './workspace-modules/BrandIntelligence';
import SeoAeo from './workspace-modules/SeoAeo';
import AdCampaigns from './workspace-modules/AdCampaigns';
import Outreach from './workspace-modules/Outreach';
import Measurement from './workspace-modules/Measurement';
import SocialMedia from './workspace-modules/SocialMedia';

const Workspace = () => {
    const { workspaceId, moduleId } = useParams();
    const navigate = useNavigate();
    const activeModule = moduleId || DEFAULT_MODULE_ID;
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
            .then((workspace) => {
                if (mounted) {
                    setWorkspaceData(workspace);
                }
            })
            .finally(() => {
                if (mounted) {
                    setLoading(false);
                }
            });

        return () => {
            mounted = false;
        };
    }, [workspaceId]);

    const { readiness, activation, brand } = useActivation();
    const brandLogoSvg = brand?.colorIdentity?.logoSvg;
    const brandLogoSrc = brandLogoSvg
        ? `data:image/svg+xml;utf8,${encodeURIComponent(brandLogoSvg)}`
        : null;
    const nextModuleId = nextStepModuleId(activation);

    const modules = [
        { id: 'overview', label: 'Overview' },
        { id: 'measurement', label: 'Measurement' },
        { id: 'brand-intelligence', label: 'Brand Intelligence' },
        { id: 'campaigns', label: 'Campaigns' },
        { id: 'seo-aeo', label: 'SEO & AEO' },
        { id: 'ad-campaigns', label: 'Ad Campaigns' },
        { id: 'outreach', label: 'Outreach' },
        { id: 'social-media', label: 'Social Media' },
        { id: 'library', label: 'Library' },
    ].map((module) => {
        const locked = isModuleLocked(module.id, readiness);
        return {
            ...module,
            locked,
            isNext: module.id === nextModuleId,
            title: locked ? MODULE_GATES[module.id]?.unmetLabel : undefined,
        };
    });

    if (!isValidModuleId(activeModule)) {
        return <Navigate to={workspacePath(workspaceId)} replace />;
    }

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

    const activeModuleLabel =
        modules.find((module) => module.id === activeModule)?.label ?? 'Module';

    const handleTabChange = (tabId) => {
        navigate(workspacePath(workspaceId, tabId));
    };

    const renderModule = () => {
        switch (activeModule) {
            case 'overview':
                return <Overview workspaceId={workspaceId} workspace={workspaceData} />;
            case 'measurement':
                return <Measurement workspaceId={workspaceId} />;
            case 'campaigns':
                return <Campaigns workspaceId={workspaceId} />;
            case 'brand-intelligence':
                return <BrandIntelligence workspaceId={workspaceId} workspace={workspaceData} />;
            case 'seo-aeo': return <SeoAeo workspaceId={workspaceId} />;
            case 'ad-campaigns': return <AdCampaigns workspaceId={workspaceId} />;
            case 'outreach': return <Outreach workspaceId={workspaceId} />;
            // Prospecting moved under Outreach; redirect old top-level links.
            case 'prospecting': return <Navigate to={workspacePath(workspaceId, 'outreach', 'prospecting')} replace />;
            case 'social-media': return <SocialMedia workspaceId={workspaceId} />;
            case 'library': return <Library workspaceId={workspaceId} />;
            default:
                return <Overview workspaceId={workspaceId} workspace={workspaceData} />;
        }
    };

    return (
        <div className="workspace">
            <div className="workspace__inner">
                <header className="workspace-hero">
                    <div className="workspace-hero__cluster">
                        <div
                            className={`workspace-hero__logo ${brandLogoSrc ? 'workspace-hero__logo--img' : ''}`}
                            style={brandLogoSrc ? undefined : { backgroundColor: workspaceData.logoColor || '#7546e8' }}
                        >
                            {brandLogoSrc
                                ? <img src={brandLogoSrc} alt={workspaceData.name} className="workspace-hero__logo-img" />
                                : workspaceData.name.charAt(0)}
                        </div>
                        <div className="workspace-hero__text">
                            <p className="workspace-hero__eyebrow">Active workspace</p>
                            <h1 className="workspace-hero__title font-display">
                                {workspaceData.name}
                            </h1>
                            <span className="workspace-hero__url">{workspaceData.url}</span>
                        </div>
                    </div>
                    <span className="workspace-hero__badge">
                        BI: {workspaceData.brandIntelStatus ?? 0}%
                    </span>
                </header>

                <div className="workspace-section-heading">
                    <h2 className="workspace-section-heading__title font-section">
                        {activeModuleLabel}
                    </h2>
                    <span className="workspace-section-heading__line" />
                </div>

                <Panel className="workspace-module-panel">
                    <Tabs
                        tabs={modules}
                        activeTab={activeModule}
                        onTabChange={handleTabChange}
                        variant="kepler"
                    />

                    <div className="workspace-module-content">
                        <ErrorBoundary>
                            {renderModule()}
                        </ErrorBoundary>
                    </div>
                </Panel>
            </div>
        </div>
    );
};

export default Workspace;
