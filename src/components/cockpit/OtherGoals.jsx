import { MEASURES } from '../../lib/goalFeasibility';

// Zone 6 — a quiet strip of the other goals.
//
// Deliberately compact: secondary goals must stay visible without competing with
// the hero. Each carries only what it takes to decide whether to switch focus —
// its measure, its deadline, and whether it is the primary.

const OtherGoals = ({ goals = [], heroId, onOpen, onSetPrimary }) => {
    const others = goals.filter((g) => g.id !== heroId && g.status === 'active');
    if (others.length === 0) return null;

    return (
        <section className="cockpit-others" aria-label="Other goals">
            <span className="cockpit-others__label">Also running</span>
            <ul className="cockpit-others__list">
                {others.map((g) => (
                    <li key={g.id} className="cockpit-others__item">
                        <button type="button" className="cockpit-others__name" onClick={() => onOpen?.(g)}>
                            {g.isPrimary && <span aria-label="Primary goal" title="Primary goal">★ </span>}
                            {g.name}
                        </button>
                        <span className="cockpit-others__meta">
                            {g.kind === 'measured'
                                ? `${MEASURES[g.measure]?.label ?? g.measure} · ${new Intl.NumberFormat().format(g.target ?? 0)}`
                                : 'Directional'}
                            {g.endDate ? ` · ends ${g.endDate}` : ''}
                        </span>
                        {!g.isPrimary && onSetPrimary && (
                            <button
                                type="button"
                                className="cockpit-others__promote"
                                onClick={() => onSetPrimary(g)}
                            >
                                Make primary
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
};

export default OtherGoals;
