/**
 * The demo store — every table the app reads, held in memory for the session.
 *
 * Writes are real writes against these arrays, so the demo is fully interactive:
 * create a campaign, approve a sequence, save a prospect list, and the change
 * shows up everywhere the app reads it. A page reload rebuilds the pristine
 * dataset, which is the reset button between demos.
 */
import { buildDataset, DEMO_TABLES } from './dataset';
import { DemoQuery } from './pgrest';

/** Tables carrying an `updated_at` column (mirrors supabase/migrations). */
const HAS_UPDATED_AT = new Set([
    'workspaces', 'user_profiles', 'brand_profiles', 'content_items', 'campaigns',
    'workspace_integrations', 'prospects', 'sequences', 'enrollments', 'messages',
    'sending_domains', 'abm_accounts', 'abm_contacts', 'prospect_lists',
]);

class DemoStore {
    constructor() {
        this.tables = buildDataset();
    }

    /** Rows for a table, auto-created so an unseeded table reads as empty. */
    rowsOf(table) {
        if (!this.tables[table]) {
            if (!DEMO_TABLES.includes(table)) {
                console.warn(`[demo] table "${table}" is not part of the demo dataset — reading as empty.`);
            }
            this.tables[table] = [];
        }
        return this.tables[table];
    }

    replaceRows(table, rows) {
        this.tables[table] = rows;
    }

    hasColumn(table, column) {
        if (column === 'updated_at') return HAS_UPDATED_AT.has(table);
        const [first] = this.rowsOf(table);
        return first ? Object.hasOwn(first, column) : false;
    }

    from(table) {
        return new DemoQuery(this, table);
    }

    reset() {
        this.tables = buildDataset();
    }
}

let instance = null;

/**
 * The store, built on first use. Lazy on purpose: with no module-level side effect,
 * a non-demo build tree-shakes this entire directory out of the bundle.
 */
export const getStore = () => {
    if (!instance) instance = new DemoStore();
    return instance;
};

export const resetStore = () => {
    instance = null;
};
