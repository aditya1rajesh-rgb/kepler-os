import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/layout/AuthLayout';
import Panel, { PanelHeader } from '../components/ui/Panel';
import AuthLoading from '../components/auth/AuthLoading';
import { useAuth } from '../context/AuthContext';
import { workspacePath } from '../constants/routes';
import { workspaceService } from '../services/workspaceService';
import { onboardingService } from '../services/onboardingService';
import { fileService } from '../services/fileService';
import { useWorkspace } from '../context/WorkspaceContext';
import { validateWorkspaceInput } from '../lib/validation';
import { toUserMessage } from '../lib/errors';
import { onboardingTrace } from '../lib/onboardingTrace';
import './OnboardingPage.css';

const STEPS = [
    { id: 'workspace', label: 'Workspace' },
    { id: 'brand', label: 'Brand' },
    { id: 'files', label: 'Project Files' },
    { id: 'ready', label: 'Launch' },
];

const OnboardingPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { loading: authLoading } = useAuth();
    const { refreshWorkspaces } = useWorkspace();
    const isNewWorkspace = searchParams.get('new') === '1';
    const [step, setStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState({
        workspaceName: '',
        brandUrl: '',
        industry: 'Consumer Brand',
    });
    const [projectFiles, setProjectFiles] = useState([]);
    const [uploadInfo, setUploadInfo] = useState('');

    const isLastStep = step === STEPS.length - 1;

    useEffect(() => {
        if (authLoading) return;

        if (!isNewWorkspace) {
            workspaceService.isOnboardingComplete().then((complete) => {
                if (complete) {
                    workspaceService.resolveActiveWorkspaceId().then((id) => {
                        if (id) {
                            navigate(workspacePath(id), { replace: true });
                        }
                    });
                }
            });
        }
    }, [navigate, authLoading, isNewWorkspace]);

    if (authLoading) {
        return (
            <AuthLayout>
                <AuthLoading />
            </AuthLayout>
        );
    }

    const handleNext = async (event) => {
        event.preventDefault();
        setError('');
        setUploadInfo('');

        if (!isLastStep) {
            setStep((current) => current + 1);
            return;
        }

        const validated = validateWorkspaceInput({
            name: form.workspaceName,
            url: form.brandUrl,
            industry: form.industry,
        });

        if (!validated.ok) {
            setError(validated.error);
            return;
        }

        setIsSubmitting(true);
        let createdWorkspaceId = null;

        try {
            onboardingTrace('OnboardingPage:handleNext:submit:start', {
                forceNew: isNewWorkspace,
                form: validated.value,
            });

            const result = await onboardingService.completeOnboarding(validated.value, {
                forceNew: isNewWorkspace,
            });

            createdWorkspaceId = result.workspace.id;
            onboardingTrace('OnboardingPage:handleNext:create:end', { workspaceId: createdWorkspaceId });
        } catch (err) {
            const cause = err?.cause ?? err;
            // Flat, always-visible diagnostics (no need to expand console objects).
            console.error(
                '[onboarding] create failed →',
                'message:', cause?.message,
                '| code:', cause?.code,
                '| details:', cause?.details,
                '| hint:', cause?.hint
            );
            if (Array.isArray(err?.steps)) {
                err.steps.forEach((s) =>
                    console.error(
                        `[onboarding] step "${s.step}" ok=${s.ok}`,
                        s.error ? `error: ${s.error.message} (code ${s.error.code})` : ''
                    )
                );
            }
            onboardingTrace('OnboardingPage:handleNext:create:error', {
                message: cause?.message,
                code: cause?.code,
                details: cause?.details,
                hint: cause?.hint,
                steps: err?.steps,
            });
            setError(toUserMessage(cause, 'Could not create your workspace. Please try again.'));
            setIsSubmitting(false);
            return;
        }

        if (projectFiles.length > 0 && createdWorkspaceId) {
            let uploadedCount = 0;
            let failedCount = 0;

            for (const file of projectFiles) {
                try {
                    await fileService.uploadFile(
                        createdWorkspaceId,
                        file,
                        ['brand-intelligence'],
                        { uploadSource: 'onboarding' }
                    );
                    uploadedCount += 1;
                } catch (uploadErr) {
                    failedCount += 1;
                    onboardingTrace('OnboardingPage:fileUpload:error', {
                        workspaceId: createdWorkspaceId,
                        fileName: file.name,
                        message: uploadErr?.message,
                        code: uploadErr?.code,
                    });
                }
            }

            if (failedCount > 0) {
                setUploadInfo(
                    `${uploadedCount} file${uploadedCount === 1 ? '' : 's'} uploaded. ${failedCount} failed. You can upload more files later from File Intelligence.`
                );
            } else {
                setUploadInfo(`${uploadedCount} project file${uploadedCount === 1 ? '' : 's'} uploaded successfully.`);
            }
        }

        try {
            onboardingTrace('OnboardingPage:handleNext:refresh:start');
            await refreshWorkspaces();
            onboardingTrace('OnboardingPage:handleNext:refresh:end');
        } catch (refreshError) {
            console.warn('[onboarding] workspace list refresh failed after create:', refreshError);
            onboardingTrace('OnboardingPage:handleNext:refresh:error', refreshError);
        }

        onboardingTrace('OnboardingPage:handleNext:navigate:start', { workspaceId: createdWorkspaceId });
        navigate(workspacePath(createdWorkspaceId), { replace: true });
        setIsSubmitting(false);
    };

    const handleBack = () => {
        setStep((current) => Math.max(0, current - 1));
    };

    return (
        <AuthLayout>
            <div className="onboarding-page">
                <div className="onboarding-page__intro">
                    <p className="onboarding-page__eyebrow">First-time setup</p>
                    <h1 className="onboarding-page__title font-display">Create your workspace</h1>
                    <p className="onboarding-page__subtitle">
                        Configure the essentials for KEPLER to begin brand intelligence.
                    </p>
                </div>

                <div className="onboarding-page__steps">
                    {STEPS.map((item, index) => (
                        <span
                            key={item.id}
                            className={`onboarding-page__step ${index === step ? 'onboarding-page__step--active' : ''} ${index < step ? 'onboarding-page__step--done' : ''}`}
                        >
                            {item.label}
                        </span>
                    ))}
                </div>

                <Panel className="onboarding-page__panel">
                    <PanelHeader
                        title={
                            step === 0
                                ? 'Workspace details'
                                : step === 1
                                    ? 'Brand profile'
                                    : step === 2
                                        ? 'Project files (optional)'
                                        : 'Ready to launch'
                        }
                        meta={
                            step === 0
                                ? 'Name the workspace KEPLER will organize'
                                : step === 1
                                    ? 'Tell us where your brand lives online'
                                    : step === 2
                                        ? 'Upload internal docs to improve intelligence quality'
                                        : 'Review and enter your operating environment'
                        }
                    />

                    <form className="onboarding-page__form" onSubmit={handleNext}>
                        {error && (
                            <p className="onboarding-page__error" role="alert">
                                {error}
                            </p>
                        )}
                        {uploadInfo && (
                            <p className="onboarding-page__notice" role="status">
                                {uploadInfo}
                            </p>
                        )}

                        {step === 0 && (
                            <>
                                <label className="onboarding-page__label" htmlFor="workspace-name">
                                    Workspace name
                                </label>
                                <input
                                    id="workspace-name"
                                    type="text"
                                    className="onboarding-page__input"
                                    placeholder="Your company name"
                                    value={form.workspaceName}
                                    onChange={(e) => setForm({ ...form, workspaceName: e.target.value })}
                                    required
                                />
                                <label className="onboarding-page__label" htmlFor="industry">
                                    Industry
                                </label>
                                <select
                                    id="industry"
                                    className="onboarding-page__input"
                                    value={form.industry}
                                    onChange={(e) => setForm({ ...form, industry: e.target.value })}
                                >
                                    <option>Consumer Brand</option>
                                    <option>B2B SaaS</option>
                                    <option>E-commerce</option>
                                    <option>Agency</option>
                                </select>
                            </>
                        )}

                        {step === 1 && (
                            <>
                                <label className="onboarding-page__label" htmlFor="brand-url">
                                    Brand website
                                </label>
                                <input
                                    id="brand-url"
                                    type="url"
                                    className="onboarding-page__input"
                                    placeholder="https://yourcompany.com"
                                    value={form.brandUrl}
                                    onChange={(e) => setForm({ ...form, brandUrl: e.target.value })}
                                    required
                                />
                                <div className="onboarding-page__hint kepler-tile">
                                    KEPLER will scan public brand signals to seed intelligence modules.
                                </div>
                            </>
                        )}

                        {step === 2 && (
                            <>
                                <div className="onboarding-page__hint kepler-tile">
                                    Uploading project files is optional but strongly encouraged. Files improve:
                                    brand understanding, business details, ICP suggestions, and later blog/outreach/social quality.
                                </div>
                                <label className="onboarding-page__label" htmlFor="project-files">
                                    Project files (optional)
                                </label>
                                <input
                                    id="project-files"
                                    type="file"
                                    className="onboarding-page__input onboarding-page__input--file"
                                    multiple
                                    accept=".txt,.md,.markdown,.csv,.json,.html,.htm,.pdf,.doc,.docx"
                                    onChange={(e) => setProjectFiles(Array.from(e.target.files ?? []))}
                                />
                                <p className="onboarding-page__file-hint">
                                    Suggested: brand guidelines, positioning docs, messaging frameworks, case studies, pitch decks.
                                </p>
                                {projectFiles.length > 0 && (
                                    <div className="onboarding-page__file-list kepler-tile">
                                        {projectFiles.map((file) => (
                                            <p key={`${file.name}-${file.size}`} className="onboarding-page__file-item">
                                                {file.name}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}

                        {step === 3 && (
                            <div className="onboarding-page__summary kepler-tile">
                                <p><strong>Workspace:</strong> {form.workspaceName || 'Untitled workspace'}</p>
                                <p><strong>Industry:</strong> {form.industry}</p>
                                <p><strong>Website:</strong> {form.brandUrl || 'Not provided'}</p>
                                <p><strong>Project files:</strong> {projectFiles.length || 0} selected</p>
                            </div>
                        )}

                        <div className="onboarding-page__actions">
                            {step > 0 && (
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={handleBack}
                                    disabled={isSubmitting}
                                >
                                    Back
                                </button>
                            )}
                            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                {isSubmitting
                                    ? 'Creating workspace…'
                                    : isLastStep
                                        ? 'Enter KEPLER'
                                        : 'Continue'}
                            </button>
                        </div>
                    </form>
                </Panel>

                {isNewWorkspace && (
                    <p className="onboarding-page__footer">
                        <Link to="/" className="onboarding-page__link">
                            Back to dashboard
                        </Link>
                    </p>
                )}
            </div>
        </AuthLayout>
    );
};

export default OnboardingPage;
