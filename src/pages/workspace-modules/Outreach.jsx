import { useParams, useNavigate } from 'react-router-dom';
import Tabs from '../../components/ui/Tabs';
import OutreachSequences from '../../components/outreach/OutreachSequences';
import Prospecting from './Prospecting';
import AbmResearch from './AbmResearch';
import { workspacePath } from '../../constants/routes';
import '../../styles/module-kepler.css';
import './Outreach.css';

// Outreach is a multi-screen parent: the top-level "Outreach" module is a shell
// that hosts three sub-modules behind a secondary nav. The active sub-module is
// the URL's :subModuleId segment so screens are deep-linkable; when it's absent
// (e.g. campaign deep-links land on /outreach?campaign=...) we default to
// Sequences, which reads those search params.
const SUB_MODULES = [
    { id: 'sequences', label: 'Sequences' },
    { id: 'prospecting', label: 'Prospecting' },
    { id: 'abm', label: 'ABM Research' },
];
const DEFAULT_SUB = 'sequences';

const Outreach = ({ workspaceId }) => {
    const { subModuleId } = useParams();
    const navigate = useNavigate();
    const active = SUB_MODULES.some((s) => s.id === subModuleId) ? subModuleId : DEFAULT_SUB;

    const go = (id) => navigate(workspacePath(workspaceId, 'outreach', id));

    return (
        <div className="outreach-shell">
            <Tabs tabs={SUB_MODULES} activeTab={active} onTabChange={go} variant="kepler" />
            <div className="outreach-shell__screen">
                {active === 'sequences' && <OutreachSequences workspaceId={workspaceId} />}
                {active === 'prospecting' && <Prospecting workspaceId={workspaceId} />}
                {active === 'abm' && <AbmResearch workspaceId={workspaceId} />}
            </div>
        </div>
    );
};

export default Outreach;
