import React from 'react';
import './ConfigError.css';

const ConfigError = ({ missing = [], forbidden = [] }) => (
    <div className="config-error">
        <div className="config-error__panel kepler-panel">
            <p className="config-error__eyebrow">Configuration required</p>
            <h1 className="config-error__title font-heading">Supabase is not configured</h1>
            <p className="config-error__body">
                KEPLER OS requires a live Supabase project. Copy <code>.env.example</code> to{' '}
                <code>.env.local</code> and set the client variables below.
            </p>

            {missing.length > 0 && (
                <div className="config-error__section">
                    <p className="config-error__label">Missing or placeholder</p>
                    <ul>
                        {missing.map((item) => (
                            <li key={item}><code>{item}</code></li>
                        ))}
                    </ul>
                </div>
            )}

            {forbidden.length > 0 && (
                <div className="config-error__section config-error__section--danger">
                    <p className="config-error__label">Remove from frontend env</p>
                    <ul>
                        {forbidden.map((item) => (
                            <li key={item}><code>{item}</code></li>
                        ))}
                    </ul>
                    <p className="config-error__hint">Service-role keys must never ship in Vite env.</p>
                </div>
            )}

            <pre className="config-error__code">{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}</pre>
        </div>
    </div>
);

export default ConfigError;
