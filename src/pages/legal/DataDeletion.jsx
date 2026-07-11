import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import LegalLayout from './LegalLayout';

// Data-deletion page. Satisfies Meta's required "Data Deletion Instructions URL"
// AND serves the status page that our data-deletion callback links to
// (?code=... → look up the request status). Public + unauthenticated by design.
const STATUS_ENDPOINT = `${(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')}/functions/v1/meta-callbacks/status`;

const DataDeletion = () => {
    const [params] = useSearchParams();
    const [code, setCode] = useState(params.get('code') || params.get('id') || '');
    const [status, setStatus] = useState(null);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState('');

    const lookup = async (value) => {
        const c = (value ?? code).trim();
        if (!c) return;
        setChecking(true);
        setError('');
        setStatus(null);
        try {
            const res = await fetch(`${STATUS_ENDPOINT}?code=${encodeURIComponent(c)}`);
            if (!res.ok) throw new Error('not found');
            const data = await res.json();
            setStatus(data);
        } catch {
            setError('We could not find a deletion request with that confirmation code. Check the code, or email us and we will help.');
        } finally {
            setChecking(false);
        }
    };

    // Auto-look-up when arriving from the callback link with a code. Deferred a
    // tick so the fetch's state updates don't fire synchronously during mount.
    useEffect(() => {
        const c = params.get('code') || params.get('id');
        if (!c) return undefined;
        const t = setTimeout(() => lookup(c), 0);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <LegalLayout title="Data deletion" updated="July 2026">
            <p>
                You can delete your Kepler data at any time. This page explains how, and lets you check
                the status of a deletion request.
            </p>

            <h2>How to delete your data</h2>
            <ul>
                <li><strong>Disconnect an integration</strong> — in Kepler, open the connector and choose Disconnect. This immediately revokes our access to that service (Google, Meta, LinkedIn, or other) and deletes the stored credentials.</li>
                <li><strong>Delete specific content</strong> — remove campaigns, generated content, or uploaded files from within your workspace.</li>
                <li><strong>Delete your whole account</strong> — email <a href="mailto:privacy@turbostart.co">privacy@turbostart.co</a> from your account address, or use the in-app account-deletion option, and we will erase your workspace data and connected-service credentials.</li>
            </ul>
            <p>
                Deletions complete within <span className="legal__todo">[retention window, e.g. 30 days]</span>.
                We remove connected-service data (including any data obtained from Meta, Google, or LinkedIn)
                except where we are legally required to retain it.
            </p>

            <h2>Check a deletion request</h2>
            <p>
                If a deletion was started from Facebook or Instagram, you received a confirmation code.
                Enter it to see the status.
            </p>
            <form
                className="legal__status-form"
                onSubmit={(e) => { e.preventDefault(); lookup(); }}
            >
                <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Confirmation code"
                    aria-label="Deletion confirmation code"
                />
                <button type="submit" className="btn btn-primary" disabled={checking || !code.trim()}>
                    {checking ? 'Checking…' : 'Check status'}
                </button>
            </form>
            {error && <p className="legal__status-result" role="alert">{error}</p>}
            {status && (
                <p className="legal__status-result" role="status">
                    Request <strong>{status.code}</strong>: {status.status === 'completed'
                        ? 'completed — the associated data has been deleted.'
                        : status.status === 'pending'
                            ? 'received and in progress.'
                            : status.status}
                </p>
            )}

            <h2>Contact</h2>
            <p>Anything unclear? <a href="mailto:privacy@turbostart.co">privacy@turbostart.co</a>.</p>
        </LegalLayout>
    );
};

export default DataDeletion;
