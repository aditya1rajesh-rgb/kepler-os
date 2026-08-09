import { useCallback, useState } from 'react';
import ConnectorsPanel from '../../components/integrations/ConnectorsPanel';
import ModuleScreen from '../../components/layout/ModuleScreen';
import { CONNECTORS } from '../../lib/connectors';
import '../../styles/module-kepler.css';
import './Integrations.css';

// Workspace-scoped Integrations screen (Others section). The active workspace is
// scoped by the sidebar switcher, so this drops the per-workspace tabs the old
// /profile Connectors section carried.
//
// The connector grid IS the canvas, so ConnectorsPanel renders without its own
// panel chrome — the app header already names the screen, and the explanatory
// sentence it used to carry ("Everything works without them; each connection
// raises the quality of…") is replaced by a factual connected count.
const Integrations = ({ workspaceId }) => {
    const [connected, setConnected] = useState(null);

    const handleStatuses = useCallback((map) => {
        setConnected(Object.values(map ?? {}).filter((s) => s?.status === 'connected').length);
    }, []);

    const available = CONNECTORS.filter((c) => c.status !== 'planned').length;

    return (
        <ModuleScreen
            className="integrations-module module-kepler"
            status={
                connected === null
                    ? null
                    : (
                        <span>
                            <strong>{connected}</strong> of {available} connected
                            {connected === 0 ? ' · Kepler works without them; each one sharpens what it produces' : ''}
                        </span>
                    )
            }
        >
            <ConnectorsPanel
                workspaceId={workspaceId}
                chrome={false}
                onStatusesChange={handleStatuses}
            />
        </ModuleScreen>
    );
};

export default Integrations;
