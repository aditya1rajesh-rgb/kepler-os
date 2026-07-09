import { useState } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/layout/AuthLayout';
import Panel, { PanelHeader } from '../components/ui/Panel';
import { authService } from '../services/authService';
import { workspaceService } from '../services/workspaceService';
import { validateAuthInput } from '../lib/validation';
import { toUserMessage } from '../lib/errors';
import './LoginPage.css';

const LoginPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const isSignUp = searchParams.get('mode') === 'signup';
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [awaitingConfirm, setAwaitingConfirm] = useState(false);
    const [resending, setResending] = useState(false);
    const [resendMsg, setResendMsg] = useState('');

    const handleSubmit = async (event) => {
        event.preventDefault();
        setIsSubmitting(true);
        setError('');
        setNotice('');
        setResendMsg('');
        setAwaitingConfirm(false);

        const validated = validateAuthInput({ email, password });
        if (!validated.ok) {
            setError(validated.error);
            setIsSubmitting(false);
            return;
        }

        try {
            const result = isSignUp
                ? await authService.signUp(validated.value.email, validated.value.password, {
                    name: validated.value.email.split('@')[0],
                })
                : await authService.signIn(validated.value.email, validated.value.password);

            if (result.error) {
                setError(toUserMessage(result.error, `${isSignUp ? 'Sign up' : 'Sign in'} failed.`));
                return;
            }

            if (isSignUp && !result.data?.session) {
                setNotice('Account created - check your inbox for a confirmation link, then sign in.');
                setAwaitingConfirm(true);
                return;
            }

            const workspaces = await workspaceService.getWorkspaces();
            const returnTo = location.state?.from?.pathname;

            if (workspaces.length === 0) {
                navigate('/onboarding', { replace: true });
            } else if (returnTo && returnTo !== '/login') {
                navigate(returnTo, { replace: true });
            } else {
                navigate('/', { replace: true });
            }
        } catch (err) {
            setError(toUserMessage(err));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResend = async () => {
        setResending(true);
        setResendMsg('');
        try {
            const { error: resendError } = await authService.resendConfirmation(email.trim());
            setResendMsg(
                resendError
                    ? toUserMessage(resendError, 'Could not resend. Try again shortly.')
                    : 'Confirmation email sent.'
            );
        } catch (err) {
            setResendMsg(toUserMessage(err, 'Could not resend. Try again shortly.'));
        } finally {
            setResending(false);
        }
    };

    return (
        <AuthLayout>
            <div className="login-page">
                <div className="login-page__brand">
                    <div className="login-page__brand-badge">
                        <img src="/kepler-logo.png" alt="KEPLER" className="login-page__brand-mark" />
                    </div>
                    <div className="login-page__brand-text">
                        <span className="login-page__wordmark font-heading">KEPLER</span>
                        <span className="login-page__subtitle">Operating system</span>
                    </div>
                </div>

                <Panel className="login-page__panel">
                    <PanelHeader
                        title={isSignUp ? 'Create account' : 'Sign in'}
                        meta={
                            isSignUp
                                ? 'Register to create and manage brand workspaces'
                                : 'Access your brand workspaces and intelligence modules'
                        }
                    />
                    <form className="login-page__form" onSubmit={handleSubmit}>
                        {error && (
                            <p className="login-page__error" role="alert">
                                {error}
                            </p>
                        )}

                        {notice && (
                            <p className="login-page__notice" role="status">
                                {notice}
                            </p>
                        )}

                        <label className="login-page__label" htmlFor="login-email">
                            Email
                        </label>
                        <input
                            id="login-email"
                            type="email"
                            className="login-page__input"
                            placeholder="you@company.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            required
                        />

                        <label className="login-page__label" htmlFor="login-password">
                            Password
                        </label>
                        <input
                            id="login-password"
                            type="password"
                            className="login-page__input"
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete={isSignUp ? 'new-password' : 'current-password'}
                            required
                            minLength={6}
                        />

                        <button
                            type="submit"
                            className="btn btn-primary login-page__submit"
                            disabled={isSubmitting}
                        >
                            {isSubmitting
                                ? (isSignUp ? 'Creating account…' : 'Signing in…')
                                : (isSignUp ? 'Create account' : 'Sign in')}
                        </button>

                        {awaitingConfirm && (
                            <>
                                <button
                                    type="button"
                                    className="btn btn-secondary login-page__resend"
                                    onClick={handleResend}
                                    disabled={resending}
                                >
                                    {resending ? 'Sending…' : 'Resend confirmation email'}
                                </button>
                                {resendMsg && <p className="login-page__resend-msg">{resendMsg}</p>}
                            </>
                        )}
                    </form>
                </Panel>

                <p className="login-page__footer">
                    {isSignUp ? (
                        <>
                            Already have an account?{' '}
                            <Link to="/login" className="login-page__link">
                                Sign in
                            </Link>
                        </>
                    ) : (
                        <>
                            New to KEPLER?{' '}
                            <Link to="/login?mode=signup" className="login-page__link">
                                Create account
                            </Link>
                            {' · '}
                            <Link to="/login?mode=signup" className="login-page__link">
                                Set up workspace
                            </Link>
                        </>
                    )}
                </p>
            </div>
        </AuthLayout>
    );
};

export default LoginPage;
