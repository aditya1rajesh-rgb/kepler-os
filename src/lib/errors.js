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

/**
 * Postgres / PostgREST codes that mean "the schema this build expects is not on
 * this database" — almost always a migration that has not been applied yet.
 *
 * These get a NAMED message rather than the generic fallback. The generic one is
 * right for unknown errors, and actively harmful here: a missing table produces
 * a screen that says "could not create" while the list quietly shows an empty
 * state, which reads as "you have no goals" rather than "this feature is not
 * deployed". Naming the cause is the difference between a user who is stuck and
 * one who can act — and it leaks nothing an operator does not already know.
 */
const SCHEMA_CODES = new Set([
    'PGRST205', // Could not find the table … in the schema cache
    'PGRST204', // Could not find the column … in the schema cache
    'PGRST202', // function not found
    '42P01', // undefined_table
    '42703', // undefined_column
]);

/** "…the table 'public.goals'…" → "goals" */
const namedRelation = (message = '') => {
    const match = /table ['"]?(?:public\.)?([a-z0-9_]+)['"]?/i.exec(message)
        ?? /relation ['"]?(?:public\.)?([a-z0-9_]+)['"]?/i.exec(message)
        ?? /column ['"]?([a-z0-9_.]+)['"]?/i.exec(message);
    return match?.[1] ?? '';
};

/**
 * True when this error means the database is behind the app. Exported so a
 * screen can render a different, non-alarming state rather than an error banner.
 */
export const isSchemaError = (error) => {
    if (!error || typeof error === 'string') return false;
    if (SCHEMA_CODES.has(error.code)) return true;
    return /schema cache|does not exist/i.test(error.message ?? '');
};

/**
 * The raw cause, for a muted "technical detail" line next to the friendly
 * message.
 *
 * WHY THIS EXISTS. `toUserMessage` deliberately collapses anything it does not
 * recognise into a generic sentence, which is the right security posture and
 * makes a real failure undiagnosable: a create that failed on a constraint, a
 * foreign key, a stale schema cache and a wrong project all read as "Something
 * went wrong. Please try again." This happened for real on the Goals screen and
 * cost a session of guessing.
 *
 * Postgres error codes and PostgREST messages are not secrets — they describe
 * the schema, which the operator of this workspace already owns. Rendering them
 * quietly, beside the human sentence rather than instead of it, is what lets
 * someone paste the actual cause instead of describing a symptom.
 */
export const errorDetail = (error) => {
    if (!error || typeof error === 'string') return '';
    const code = error.code ? String(error.code) : '';
    const message = String(error.message ?? '').trim();
    const hint = String(error.hint ?? '').trim();
    if (!code && !message) return '';
    return [code, message, hint].filter(Boolean).join(' · ').slice(0, 300);
};

export const toUserMessage = (error, fallback = 'Something went wrong. Please try again.') => {
    if (!error) return fallback;

    const message =
        typeof error === 'string'
            ? error
            : error.message ?? error.error_description ?? fallback;

    if (isSchemaError(error)) {
        const relation = namedRelation(message);
        return relation
            ? `This feature needs the “${relation}” table, which this database does not have yet. A pending migration has not been applied.`
            : 'This feature needs a database change that has not been applied to this environment yet.';
    }

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
