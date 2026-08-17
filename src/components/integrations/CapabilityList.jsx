import {
    capabilityPurpose, providerPermissionLine, internalGateLine,
    GRANT_STATE, grantStateOf,
} from '../../lib/connectorCapabilityCopy';
import './CapabilityList.css';

/**
 * What a connection can do, one row per capability.
 *
 * This is what the capability chips on the card were trying and failing to be.
 * A card cannot show requested AND granted, and it has no room for the third
 * state: `granted: null` means Kepler never recorded what the provider allowed,
 * which is unknowable rather than refused. Three flat chips reading
 * Read / Write / Targeting implied all three were live even on a connector whose
 * whole reason for being in "Needs attention" was that they were not.
 *
 * Raw scopes never appear. They are machine values; the provider's own NAME for
 * the permission does appear, because that is the word on the consent screen.
 *
 * `mode="request"` is the pre-consent view: nothing is granted yet, so every row
 * reads "Requested" and the point is to say what is being asked for.
 */
const CapabilityList = ({ connector, caps = [], mode = 'report' }) => {
    if (!caps.length) return null;

    return (
        <ul className="caplist">
            {caps.map((cap) => {
                const state = mode === 'request' ? 'requested' : grantStateOf(cap);
                const { label, tone } = GRANT_STATE[state];
                const provider = state === 'refused' ? providerPermissionLine(connector, cap.missing) : '';
                const gate = state === 'refused' ? internalGateLine(cap.missing) : '';
                return (
                    <li key={cap.id} className="caplist__row">
                        <div className="caplist__head">
                            <span className="caplist__name">{cap.label}</span>
                            <span className={`caplist__state caplist__state--${tone}`}>{label}</span>
                        </div>
                        <p className="caplist__what">{capabilityPurpose(connector, cap.id)}</p>
                        {provider && <p className="caplist__note">{provider}</p>}
                        {gate && <p className="caplist__note">{gate}</p>}
                        {state === 'unknown' && (
                            <p className="caplist__note">
                                This connection predates Kepler recording granted permissions.
                            </p>
                        )}
                    </li>
                );
            })}
        </ul>
    );
};

export default CapabilityList;
