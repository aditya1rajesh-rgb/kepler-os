import { useParams } from 'react-router-dom';
import OutreachSequences from '../../components/outreach/OutreachSequences';
import Prospecting from './Prospecting';
import AbmResearch from './AbmResearch';
import AbmSaved from './AbmSaved';
import { getModule } from '../../constants/moduleRegistry';
import '../../styles/module-kepler.css';
import './Outreach.css';

// Outreach is a multi-screen parent: a shell keyed by the URL's :subModuleId. The
// context-aware default (Sequences when campaign/brand deep-links are present, else
// ABM) lives in resolveWorkspaceLocation, so by the time this renders subModuleId is
// always a real child. The left sidebar drives which screen is active.
const OUTREACH = getModule('outreach');

const Outreach = ({ workspaceId }) => {
    const { subModuleId } = useParams();
    const active = OUTREACH.children.some((s) => s.id === subModuleId) ? subModuleId : OUTREACH.defaultChild;

    return (
        <div className="outreach-shell">
            <div className="outreach-shell__screen">
                {active === 'abm' && <AbmResearch workspaceId={workspaceId} />}
                {active === 'prospecting' && <Prospecting workspaceId={workspaceId} />}
                {active === 'saved' && <AbmSaved workspaceId={workspaceId} />}
                {active === 'sequences' && <OutreachSequences workspaceId={workspaceId} />}
            </div>
        </div>
    );
};

export default Outreach;
