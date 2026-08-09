import { useParams } from 'react-router-dom';
import OutreachSequences from '../../components/outreach/OutreachSequences';
import AbmResearch from './AbmResearch';
import OutreachReplies from './OutreachReplies';
import OutreachAudiences from './OutreachAudiences';
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
                {/* E30 · S6's four children. Lists, Saved and Prospecting are not
                    gone — they live inside Audiences, which is the screen that
                    absorbed them. */}
                {active === 'replies' && <OutreachReplies workspaceId={workspaceId} />}
                {active === 'sequences' && <OutreachSequences workspaceId={workspaceId} />}
                {active === 'audiences' && <OutreachAudiences workspaceId={workspaceId} />}
                {active === 'abm' && <AbmResearch workspaceId={workspaceId} />}
            </div>
        </div>
    );
};

export default Outreach;
