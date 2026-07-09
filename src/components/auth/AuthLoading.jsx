import React from 'react';
import './AuthLoading.css';

const AuthLoading = () => (
    <div className="auth-loading" role="status" aria-live="polite">
        <div className="auth-loading__spinner" aria-hidden="true" />
        <span className="auth-loading__text">Loading…</span>
    </div>
);

export default AuthLoading;
