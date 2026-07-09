import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, ArrowLeft } from '../../lib/icons';
import { campaignService } from '../../services/campaignService';
import { workspacePath } from '../../constants/routes';
import './CampaignStepBanner.css';

/**
 * Shown inside a specialist module when it was opened to generate a campaign step
 * (via ?campaign=&step= deep link). Orients the user and links back to the
 * campaign; the generated asset tags itself with the campaign automatically.
 */
const CampaignStepBanner = ({ workspaceId, campaignId, stepId, brief }) => {
    const navigate = useNavigate();
    const [campaign, setCampaign] = useState(null);

    useEffect(() => {
        if (!workspaceId || !campaignId) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const c = await campaignService.getCampaign(workspaceId, campaignId);
                if (!cancelled) setCampaign(c);
            } catch { /* non-fatal */ }
        })();
        return () => { cancelled = true; };
    }, [workspaceId, campaignId]);

    if (!campaignId) return null;
    const step = campaign?.plan?.steps?.find((s) => s.id === stepId);

    return (
        <div className="campaign-step-banner">
            <span className="campaign-step-banner__icon"><Target size={16} strokeWidth={1.8} /></span>
            <span className="campaign-step-banner__body">
                <span className="campaign-step-banner__label">
                    Campaign step{campaign?.title ? ` · ${campaign.title}` : ''}
                </span>
                <span className="campaign-step-banner__step">{step?.title || brief || 'Generate this step - it links back automatically.'}</span>
            </span>
            <button
                type="button"
                className="campaign-step-banner__back"
                onClick={() => navigate(`${workspacePath(workspaceId, 'campaigns')}?campaign=${campaignId}`)}
            >
                <ArrowLeft size={14} strokeWidth={1.8} /> Back to campaign
            </button>
        </div>
    );
};

export default CampaignStepBanner;
