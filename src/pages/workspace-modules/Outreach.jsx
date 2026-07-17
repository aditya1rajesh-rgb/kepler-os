import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Tabs from '../../components/ui/Tabs';
import OutreachSequences from '../../components/outreach/OutreachSequences';
import Prospecting from './Prospecting';
import AbmResearch from './AbmResearch';
import AbmSaved from './AbmSaved';
import { workspacePath } from '../../constants/routes';
import '../../styles/module-kepler.css';
import './Outreach.css';

// Outreach is a multi-screen parent: the top-level "Outreach" module is a shell
// that hosts sub-modules behind a secondary nav. The active sub-module is the
// URL's :subModuleId segment so screens are deep-linkable.
//
// Default when the segment is absent: campaign/brand deep-links (which carry
// ?campaign/brief/icp/step) must land on the Sequences builder that consumes
// them; a plain "Outreach" click leads with ABM Research.
const SUB_MODULES = [
    { id: 'abm', label: 'ABM Research' },
    { id: 'prospecting', label: 'Prospecting' },
    { id: 'saved', label: 'Saved' },
    { id: 'sequences', label: 'Sequences' },
];
const SEQ_CONTEXT_PARAMS = ['campaign', 'brief', 'icp', 'step', 'list'];

const Outreach = ({ workspaceId }) => {
    const { subModuleId } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const fallback = SEQ_CONTEXT_PARAMS.some((k) => searchParams.has(k)) ? 'sequences' : 'abm';
    const active = SUB_MODULES.some((s) => s.id === subModuleId) ? subModuleId : fallback;

    const go = (id) => navigate(workspacePath(workspaceId, 'outreach', id));

    return (
        <div className="outreach-shell">
            <Tabs tabs={SUB_MODULES} activeTab={active} onTabChange={go} variant="kepler" />
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
