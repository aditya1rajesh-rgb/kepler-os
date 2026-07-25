import { Link } from 'react-router-dom';
import { ArrowRight } from '../../lib/icons';
import Panel from '../ui/Panel';
import { workspacePath } from '../../constants/routes';
import './SetupRequired.css';

/**
 * Explicit "prerequisites incomplete" state for a module.
 * Tells the user exactly what to configure - and links straight to the place to
 * do it (the relevant Brand Intelligence subtab) - instead of a prose-only dead end.
 *
 * @param {string} title
 * @param {string} summary
 * @param {Array<{label: string, done: boolean, prereq?: 'brand'|'icp'}>} requirements
 * @param {string} [workspaceId] - enables deep-link actions for unmet requirements
 */
const PREREQ_LINKS = {
    brand: { tab: 'overview', cta: 'Complete brand profile' },
    icp: { tab: 'audience', cta: 'Add an ICP' },
};

const SetupRequired = ({ title, summary, requirements = [], workspaceId }) => {
    const actions = workspaceId
        ? requirements
              .filter((req) => !req.done && req.prereq && PREREQ_LINKS[req.prereq])
              .map((req) => ({
                  prereq: req.prereq,
                  to: workspacePath(workspaceId, 'brand-intelligence', PREREQ_LINKS[req.prereq].tab),
                  label: PREREQ_LINKS[req.prereq].cta,
              }))
        : [];

    return (
        <Panel className="setup-required">
            <p className="setup-required__eyebrow">Setup required</p>
            <h3 className="setup-required__title font-heading">{title}</h3>
            <p className="setup-required__summary">{summary}</p>

            {requirements.length > 0 && (
                <ul className="setup-required__list">
                    {requirements.map((req) => (
                        <li
                            key={req.label}
                            className={`setup-required__item ${req.done ? 'setup-required__item--done' : ''}`}
                        >
                            <span className="setup-required__check" aria-hidden="true">
                                {req.done ? '✓' : '○'}
                            </span>
                            <span>{req.label}</span>
                        </li>
                    ))}
                </ul>
            )}

            {actions.length > 0 && (
                <div className="setup-required__actions">
                    {actions.map((action) => (
                        <Link
                            key={action.prereq}
                            to={action.to}
                            className="btn btn-primary setup-required__action"
                        >
                            {action.label}
                            <ArrowRight size={16} strokeWidth={1.8} />
                        </Link>
                    ))}
                </div>
            )}
        </Panel>
    );
};

export default SetupRequired;
