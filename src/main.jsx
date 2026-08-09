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
