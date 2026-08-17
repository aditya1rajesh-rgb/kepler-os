import React from 'react';
import { createRoot } from 'react-dom/client';
import { SolarProvider } from '@solar-icons/react';
import { validateClientEnv } from './lib/env';
import ConfigError from './components/boot/ConfigError';
import './index.css';
import './styles/surfaces.css';
import './styles/kepler-materials.css';
import './styles/dashboard.css';
import './styles/card-edge.css';
// Siphron is a real, selectable theme now, so it ships. Both families are loaded
// in index.html.
import './styles/theme-siphron.css';
import { bootTheme, setTheme } from './lib/theme';

// Applied before React mounts: a theme resolved after first paint flashes the
// other one.
bootTheme();

// Local design experiments, still dev-only: ?theme=fin is the superseded
// Finnulate skin, and `design-forms.css` carries the per-reference component
// SHAPES that a token file cannot express. The direction is locked to Siphron, so
// these exist only to re-check that decision, never to ship.
if (import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true') {
    import('./styles/theme-finnulate.css');
    import('./styles/design-forms.css');
    const requested = new URLSearchParams(window.location.search).get('theme');
    if (requested === 'off') {
        setTheme('kepler');
    } else if (requested === 'fin') {
        document.documentElement.dataset.theme = 'fin';
        const font = document.createElement('link');
        font.rel = 'stylesheet';
        font.href = 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500;700&display=swap';
        document.head.appendChild(font);
    } else if (requested) {
        setTheme(requested);
    }
}

const env = validateClientEnv();
const rootEl = document.getElementById('root');

if (!rootEl) {
    throw new Error('Root element #root not found');
}

const root = createRoot(rootEl);

const renderConfigError = (missing, forbidden) => {
    root.render(
        <React.StrictMode>
            <ConfigError missing={missing} forbidden={forbidden} />
        </React.StrictMode>
    );
};

if (!env.valid) {
    renderConfigError(env.missing, env.forbidden);
} else {
    import('./App.jsx')
        .then(({ default: App }) => {
            root.render(
                <React.StrictMode>
                    {/* Global icon weight for Solar Icons — change here to restyle
                        the whole app (Linear | Bold | Outline | BoldDuotone |
                        LineDuotone | Broken). */}
                    <SolarProvider value={{ weight: 'Linear' }}>
                        <App />
                    </SolarProvider>
                </React.StrictMode>
            );
        })
        .catch((err) => {
            console.error('Failed to boot application:', err);
            renderConfigError(['Application failed to load - see browser console'], []);
        });
}
