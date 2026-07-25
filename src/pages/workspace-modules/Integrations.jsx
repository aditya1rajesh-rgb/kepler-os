import ConnectorsPanel from '../../components/integrations/ConnectorsPanel';
import '../../styles/module-kepler.css';
import './Integrations.css';

// Workspace-scoped Integrations screen (Others section). The active workspace is
// scoped by the sidebar switcher, so this drops the per-workspace tabs the old
// /profile Connectors section carried.
const Integrations = ({ workspaceId }) => (
    <div className="integrations-module module-kepler">
        <ConnectorsPanel
            workspaceId={workspaceId}
            meta="Connect this workspace’s data sources. Everything works without them; each connection raises the quality of what Kepler produces and measures."
        />
    </div>
);

export default Integrations;
