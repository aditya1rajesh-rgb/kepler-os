import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink } from '../lib/icons';
import Panel, { PanelHeader } from '../components/ui/Panel';
import { useActiveWorkspaceId } from '../hooks/useActiveWorkspaceId';
import { useWorkspace } from '../context/WorkspaceContext';
import { workspacePath } from '../constants/routes';
import { GETTING_STARTED, HELP_RESOURCES } from '../constants/helpContent';
import './HelpCenterPage.css';

const HelpCenterPage = () => {
    const workspaceId = useActiveWorkspaceId();
    const { workspaces } = useWorkspace();
    const effectiveWorkspaceId = workspaceId ?? (workspaces[0]?.id ? String(workspaces[0].id) : null);

    return (
        <div className="help">
            <div className="help__inner">
                <header className="help__hero">
                    <h1 className="help__title font-display">Help Center</h1>
                    <p className="help__subtitle">Get set up and get the most out of Kepler.</p>
                </header>

                <Panel className="help__panel">
                    <PanelHeader title="Getting started" meta="Four steps from a blank workspace to a measured pipeline." />
                    <ol className="help__steps">
                        {GETTING_STARTED.map((step, i) => (
                            <li key={step.id} className="help__step">
                                <span className="help__step-num">{i + 1}</span>
                                <div className="help__step-body">
                                    <h3 className="help__step-title">{step.title}</h3>
                                    <p className="help__step-text">{step.body}</p>
                                </div>
                                {effectiveWorkspaceId && (
                                    <Link
                                        to={workspacePath(effectiveWorkspaceId, step.module, step.child)}
                                        className="btn btn-secondary help__step-cta"
                                    >
                                        {step.cta}
                                        <ArrowRight size={15} strokeWidth={1.8} />
                                    </Link>
                                )}
                            </li>
                        ))}
                    </ol>
                </Panel>

                <Panel className="help__panel">
                    <PanelHeader title="Resources" meta="Policies and support." />
                    <ul className="help__resources">
                        {HELP_RESOURCES.map((r) => (
                            <li key={r.id}>
                                <a
                                    className="help__resource"
                                    href={r.href}
                                    {...(r.external ? {} : { target: '_blank', rel: 'noreferrer' })}
                                >
                                    <span>{r.label}</span>
                                    <ExternalLink size={15} strokeWidth={1.7} />
                                </a>
                            </li>
                        ))}
                    </ul>
                </Panel>
            </div>
        </div>
    );
};

export default HelpCenterPage;
