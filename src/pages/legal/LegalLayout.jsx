import { Link } from 'react-router-dom';
import './legal.css';

// Public, unauthenticated shell for the legal pages (privacy, terms, data
// deletion). These must be reachable without a login — OAuth reviewers at
// Google/Meta/LinkedIn open them directly — so they live OUTSIDE the app's
// auth-gated routes and don't depend on Auth/Workspace context.
const LegalLayout = ({ title, updated, children }) => (
    <div className="legal">
        <header className="legal__bar">
            <a className="legal__wordmark" href="/">Kepler</a>
            <nav className="legal__nav">
                <Link to="/privacy">Privacy</Link>
                <Link to="/terms">Terms</Link>
                <Link to="/data-deletion">Data deletion</Link>
            </nav>
        </header>
        <main className="legal__main">
            <p className="legal__eyebrow">Kepler by TurboStart</p>
            <h1 className="legal__title">{title}</h1>
            {updated && <p className="legal__updated">Last updated {updated}</p>}
            <div className="legal__body">{children}</div>
        </main>
        <footer className="legal__foot">
            <span>© {new Date().getFullYear()} TurboStart. All rights reserved.</span>
            <a href="mailto:privacy@turbostart.co">privacy@turbostart.co</a>
        </footer>
    </div>
);

export default LegalLayout;
