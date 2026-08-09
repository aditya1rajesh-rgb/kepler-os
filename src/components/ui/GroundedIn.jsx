import { Target, Megaphone, Layers, Search } from '../../lib/icons';
import './GroundedIn.css';

/**
 * What a generated asset was actually grounded in (E3).
 *
 * Grounding is a claim, and a claim nobody can inspect is indistinguishable from
 * a marketing sentence. This strip is the inspection: it lists the goal, the
 * campaign, the prior assets and the live signals that went into the prompt —
 * the same `groundedIn` array the generation stored on the asset.
 *
 * The 'primary-fallback' case is called out rather than hidden. That goal was
 * INFERRED because the asset was generated outside any campaign, and a user who
 * disagrees with the inference can only fix it if they can see it.
 *
 * @param {Array<{kind:string,label:string,source?:string}>} items
 */
const ICONS = { goal: Target, campaign: Megaphone, priorAssets: Layers, signals: Search };

const GroundedIn = ({ items = [], className = '' }) => {
    if (!items?.length) return null;

    const inferredGoal = items.find((i) => i.kind === 'goal' && i.source === 'primary-fallback');

    return (
        <div className={`grounded-in ${className}`.trim()}>
            <span className="grounded-in__lead">Grounded in</span>
            <ul className="grounded-in__list">
                {items.map((item, index) => {
                    const Icon = ICONS[item.kind] ?? Layers;
                    return (
                        <li key={`${item.kind}-${index}`} className="grounded-in__item">
                            <Icon size={13} strokeWidth={1.7} className="grounded-in__icon" />
                            <span>{item.label}</span>
                        </li>
                    );
                })}
            </ul>
            {inferredGoal && (
                <p className="grounded-in__caveat">
                    This asset sits outside a campaign, so it was grounded in your primary
                    goal. Ladder it to a campaign to ground it deliberately.
                </p>
            )}
        </div>
    );
};

export default GroundedIn;
