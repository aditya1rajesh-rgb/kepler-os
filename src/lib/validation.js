const STRIP_TAGS = /<[^>]*>/g;

export const sanitizeText = (value, maxLength = 500) => {
    if (value == null) return '';
    return String(value)
        .replace(STRIP_TAGS, '')
        .trim()
        .slice(0, maxLength);
};

export const sanitizeEmailLocalPart = (email) => {
    if (!email || typeof email !== 'string') return 'User';
    const local = email.split('@')[0] ?? '';
    const cleaned = local.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64);
    return cleaned || 'User';
};

export const sanitizeDisplayName = (name) => sanitizeText(name, 80);

export const isValidEmail = (email) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? '').trim());

export const isValidPassword = (password) =>
    String(password ?? '').trim().length >= 6;

export const isValidUrl = (url) => {
    const value = String(url ?? '').trim();
    if (!value) return false;
    try {
        const parsed = new URL(value.includes('://') ? value : `https://${value}`);
        return Boolean(parsed.hostname);
    } catch {
        return false;
    }
};

export const validateWorkspaceInput = ({ name, url, industry }) => {
    const cleanName = sanitizeText(name, 120);
    const cleanIndustry = sanitizeText(industry, 80);

    if (!cleanName) {
        return { ok: false, error: 'Workspace name is required.' };
    }

    if (url && !isValidUrl(url)) {
        return { ok: false, error: 'Enter a valid brand website URL.' };
    }

    return {
        ok: true,
        value: {
            name: cleanName,
            url,
            industry: cleanIndustry || 'Consumer Brand',
        },
    };
};

export const validateAuthInput = ({ email, password }) => {
    const cleanEmail = String(email ?? '').trim().toLowerCase();

    if (!isValidEmail(cleanEmail)) {
        return { ok: false, error: 'Enter a valid email address.' };
    }
    if (!isValidPassword(password)) {
        return { ok: false, error: 'Password must be at least 6 characters.' };
    }

    return { ok: true, value: { email: cleanEmail, password } };
};

export const isUuid = (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(value ?? '')
    );
