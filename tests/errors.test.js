// A missing table used to reach the user as "Something went wrong. Please try
// again." while the list beside it showed "No goals yet" — two sentences that
// together say "you have no goals and the app is fine", when the truth was
// "this table does not exist on this database". These tests pin the naming.
import { describe, expect, it } from 'vitest';
import { errorDetail, isSchemaError, toUserMessage } from '../src/lib/errors.js';

const pgrest = (code, message) => ({ code, message });

describe('isSchemaError', () => {
    it('recognises the PostgREST schema-cache codes', () => {
        expect(isSchemaError(pgrest('PGRST205', "Could not find the table 'public.goals' in the schema cache"))).toBe(true);
        expect(isSchemaError(pgrest('PGRST204', "Could not find the column 'goal_id'"))).toBe(true);
    });

    it('recognises the raw Postgres codes', () => {
        expect(isSchemaError(pgrest('42P01', 'relation "public.change_events" does not exist'))).toBe(true);
        expect(isSchemaError(pgrest('42703', 'column "bySource" does not exist'))).toBe(true);
    });

    it('does not mistake ordinary failures for a missing schema', () => {
        expect(isSchemaError(pgrest('23505', 'duplicate key value violates unique constraint'))).toBe(false);
        expect(isSchemaError(pgrest('23514', 'violates check constraint "goals_measured_needs_target"'))).toBe(false);
        expect(isSchemaError('a string')).toBe(false);
        expect(isSchemaError(null)).toBe(false);
    });
});

describe('toUserMessage — the undeployed-migration case', () => {
    it('names the table so the user knows it is a deployment, not their data', () => {
        const msg = toUserMessage(
            pgrest('PGRST205', "Could not find the table 'public.goals' in the schema cache"),
            'Could not create the goal.',
        );
        expect(msg).toContain('goals');
        expect(msg).toMatch(/migration/i);
        expect(msg).not.toBe('Could not create the goal.');
    });

    it('handles the relation spelling too', () => {
        const msg = toUserMessage(pgrest('42P01', 'relation "public.change_events" does not exist'));
        expect(msg).toContain('change_events');
    });

    it('still says something useful when no name can be parsed', () => {
        const msg = toUserMessage(pgrest('PGRST205', 'schema cache miss'));
        expect(msg).toMatch(/database change that has not been applied/i);
    });
});

describe('toUserMessage — unchanged behaviour', () => {
    it('keeps swallowing unknown errors into the caller\'s fallback', () => {
        // The generic fallback is right for genuinely unknown failures; only the
        // schema class is promoted.
        expect(toUserMessage(pgrest('23505', 'duplicate key'), 'Could not create the goal.'))
            .toBe('Could not create the goal.');
    });

    it('still passes through the safe auth messages', () => {
        expect(toUserMessage({ message: 'Invalid login credentials' })).toBe('Invalid login credentials');
        expect(toUserMessage({ message: 'JWT expired' })).toMatch(/session has expired/i);
        expect(toUserMessage({ message: 'new row violates row-level security policy' }))
            .toMatch(/do not have access/i);
    });

    it('still names a network failure', () => {
        expect(toUserMessage({ message: 'fetch failed' })).toMatch(/network error/i);
    });
});

describe('errorDetail', () => {
    it('carries the code, message and hint so a cause can be pasted, not described', () => {
        const detail = errorDetail({
            code: '23503',
            message: 'insert or update on table "goals" violates foreign key constraint "goals_created_by_fkey"',
            hint: 'Key is not present in table "users".',
        });
        expect(detail).toContain('23503');
        expect(detail).toContain('goals_created_by_fkey');
        expect(detail).toContain('Key is not present');
    });

    it('is empty for nothing and for plain strings', () => {
        expect(errorDetail(null)).toBe('');
        expect(errorDetail('boom')).toBe('');
        expect(errorDetail({})).toBe('');
    });

    it('caps runaway detail so it cannot take over the screen', () => {
        expect(errorDetail({ code: 'X', message: 'y'.repeat(500) }).length).toBeLessThanOrEqual(300);
    });
});
