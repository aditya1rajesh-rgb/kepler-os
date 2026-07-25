import { useParams } from 'react-router-dom';
import SeoAeo from './SeoAeo';
import SocialMedia from './SocialMedia';
import AdCampaigns from './AdCampaigns';
import { getModule } from '../../constants/moduleRegistry';
import '../../styles/module-kepler.css';
import './Studio.css';

// Studio is the umbrella for the three creation tools (SEO & AEO, Social Media,
// Ad Creative). It's a shell keyed by the URL's :subModuleId — the left sidebar drives
// which screen is active; each child carries its own deep-link params.
const STUDIO = getModule('studio');

const Studio = ({ workspaceId }) => {
    const { subModuleId } = useParams();
    const active = STUDIO.children.some((c) => c.id === subModuleId) ? subModuleId : STUDIO.defaultChild;

    return (
        <div className="studio-shell">
            <div className="studio-shell__screen">
                {active === 'seo-aeo' && <SeoAeo workspaceId={workspaceId} />}
                {active === 'social-media' && <SocialMedia workspaceId={workspaceId} />}
                {active === 'ad-campaigns' && <AdCampaigns workspaceId={workspaceId} />}
            </div>
        </div>
    );
};

export default Studio;
