const SAFE_PATTERNS = [
    /invalid login credentials/i,
    /email not confirmed/i,
    /user already registered/i,
    /password should be at least/i,
    /jwt expired/i,
    /not authenticated/i,
    /session expired/i,
    /row-level security/i,
];

export const toUserMessage = (error, fallback = 'Something went wrong. Please try again.') => {
    if (!error) return fallback;

    const message =
        typeof error === 'string'
            ? error
            : error.message ?? error.error_description ?? fallback;

    if (SAFE_PATTERNS.some((pattern) => pattern.test(message))) {
        if (/jwt expired|session expired/i.test(message)) {
            return 'Your session has expired. Please sign in again.';
        }
        if (/row-level security/i.test(message)) {
            return 'You do not have access to this workspace.';
        }
        return message;
    }

    if (/network|fetch failed/i.test(message)) {
        return 'Network error. Check your connection and try again.';
    }

    return fallback;
};
