/**
 * A small in-memory PostgREST emulator.
 *
 * It implements exactly the surface Kepler's services use against Supabase —
 * select/insert/update/upsert/delete, the filter operators in use (eq, neq, gte,
 * in, ilike, contains, match), order/limit, single/maybeSingle, exact head counts,
 * and embedded resources (`*, prospect:prospects(...)`, `!inner` joins, and
 * `child(count)` aggregates). Anything the app does not use is deliberately absent
 * rather than half-implemented, so an unsupported call fails loudly in the demo
 * build instead of silently returning wrong data.
 *
 * Rows are plain objects in `store.tables[name]`. Every builder resolves to the
 * Supabase shape `{ data, error, count }`, and every method returns `this` so the
 * chains in src/services read identically to production.
 */
import { DEMO_LATENCY_MS, sleep } from './flag';
import { newId } from './ids';

/** Embedded-resource foreign keys that don't follow the `<singular>_id` rule. */
const FK_OVERRIDES = {
    'prospect_lists:prospect_list_members': 'list_id',
};

const singular = (table) => table.replace(/ies$/, 'y').replace(/es$/, 'e').replace(/s$/, '');

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** `a.b` → nested read; plain key → direct read. */
const readPath = (row, path) => {
    if (!path.includes('.')) return row?.[path];
    return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), row);
};

/**
 * Parse a PostgREST select string into { columns, embeds }.
 * Handles `*`, plain column lists, `alias:table(inner cols)`, `table!inner(...)`,
 * and `table(count)`. Nesting deeper than one level is not used by the app.
 */
const parseSelect = (select = '*') => {
    const columns = [];
    const embeds = [];
    let depth = 0;
    let current = '';
    const parts = [];
    for (const ch of select) {
        if (ch === '(') depth += 1;
        if (ch === ')') depth -= 1;
        if (ch === ',' && depth === 0) {
            parts.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim()) parts.push(current);

    for (const rawPart of parts) {
        const part = rawPart.trim();
        if (!part) continue;
        const embedMatch = part.match(/^([^(]+)\(([\s\S]*)\)$/);
        if (!embedMatch) {
            columns.push(part);
            continue;
        }
        const [, head, innerRaw] = embedMatch;
        const [aliasOrTable, tableMaybe] = head.split(':').map((s) => s.trim());
        const target = (tableMaybe ?? aliasOrTable).trim();
        const table = target.replace('!inner', '').trim();
        embeds.push({
            alias: tableMaybe ? aliasOrTable : table,
            table,
            inner: target.includes('!inner'),
            countOnly: innerRaw.trim() === 'count',
            columns: innerRaw.trim() === 'count' ? [] : innerRaw.split(',').map((c) => c.trim()).filter(Boolean),
        });
    }

    return { columns: columns.length ? columns : ['*'], embeds };
};

const projectRow = (row, columns) => {
    if (columns.includes('*')) return { ...row };
    const out = {};
    for (const col of columns) {
        const key = col.includes(':') ? col.split(':')[1].trim() : col;
        const alias = col.includes(':') ? col.split(':')[0].trim() : col;
        out[alias] = row?.[key];
    }
    return out;
};

const matchesLike = (value, pattern, { caseInsensitive }) => {
    const escaped = String(pattern)
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/%/g, '.*')
        .replace(/_/g, '.');
    return new RegExp(`^${escaped}$`, caseInsensitive ? 'i' : '').test(String(value ?? ''));
};

const applyFilter = (row, filter) => {
    const value = readPath(row, filter.column);
    switch (filter.op) {
        case 'eq':
            return String(value) === String(filter.value);
        case 'neq':
            return String(value) !== String(filter.value);
        case 'gt':
            return value != null && value > filter.value;
        case 'gte':
            return value != null && value >= filter.value;
        case 'lt':
            return value != null && value < filter.value;
        case 'lte':
            return value != null && value <= filter.value;
        case 'in':
            return (filter.value ?? []).some((v) => String(v) === String(value));
        case 'is':
            return filter.value === null ? value == null : value === filter.value;
        case 'ilike':
            return matchesLike(value, filter.value, { caseInsensitive: true });
        case 'like':
            return matchesLike(value, filter.value, { caseInsensitive: false });
        case 'contains': {
            const haystack = Array.isArray(value) ? value.map(String) : [];
            const needles = Array.isArray(filter.value) ? filter.value.map(String) : [String(filter.value)];
            return needles.every((n) => haystack.includes(n));
        }
        default:
            throw new Error(`[demo] unsupported filter operator: ${filter.op}`);
    }
};

export class DemoQuery {
    constructor(store, table) {
        this.store = store;
        this.table = table;
        this.action = 'select';
        this.selectString = '*';
        this.selectRequested = false;
        this.filters = [];
        this.orders = [];
        this.limitCount = null;
        this.rangeBounds = null;
        this.countMode = null;
        this.headOnly = false;
        this.singleMode = null;
        this.payload = null;
        this.onConflict = null;
    }

    // ── Terminal-ish verbs ───────────────────────────────────────────────────
    select(select = '*', opts = {}) {
        this.selectString = select;
        this.selectRequested = true;
        if (opts.count) this.countMode = opts.count;
        if (opts.head) this.headOnly = true;
        return this;
    }

    insert(payload) {
        this.action = 'insert';
        this.payload = payload;
        return this;
    }

    update(payload) {
        this.action = 'update';
        this.payload = payload;
        return this;
    }

    upsert(payload, opts = {}) {
        this.action = 'upsert';
        this.payload = payload;
        this.onConflict = opts.onConflict ? String(opts.onConflict).split(',').map((c) => c.trim()) : ['id'];
        return this;
    }

    delete() {
        this.action = 'delete';
        return this;
    }

    // ── Filters ──────────────────────────────────────────────────────────────
    eq(column, value) { this.filters.push({ column, op: 'eq', value }); return this; }
    neq(column, value) { this.filters.push({ column, op: 'neq', value }); return this; }
    gt(column, value) { this.filters.push({ column, op: 'gt', value }); return this; }
    gte(column, value) { this.filters.push({ column, op: 'gte', value }); return this; }
    lt(column, value) { this.filters.push({ column, op: 'lt', value }); return this; }
    lte(column, value) { this.filters.push({ column, op: 'lte', value }); return this; }
    in(column, values) { this.filters.push({ column, op: 'in', value: values }); return this; }
    is(column, value) { this.filters.push({ column, op: 'is', value }); return this; }
    like(column, value) { this.filters.push({ column, op: 'like', value }); return this; }
    ilike(column, value) { this.filters.push({ column, op: 'ilike', value }); return this; }
    contains(column, value) { this.filters.push({ column, op: 'contains', value }); return this; }

    match(criteria = {}) {
        for (const [column, value] of Object.entries(criteria)) this.eq(column, value);
        return this;
    }

    // ── Shaping ──────────────────────────────────────────────────────────────
    order(column, { ascending = true } = {}) { this.orders.push({ column, ascending }); return this; }
    limit(count) { this.limitCount = count; return this; }
    range(from, to) { this.rangeBounds = [from, to]; return this; }
    single() { this.singleMode = 'single'; return this; }
    maybeSingle() { this.singleMode = 'maybe'; return this; }

    // ── Execution ────────────────────────────────────────────────────────────
    get rows() {
        return this.store.rowsOf(this.table);
    }

    /** Filters that address the base table (not an embedded relation). */
    baseFilters(embeds) {
        const embedNames = new Set(embeds.flatMap((e) => [e.alias, e.table]));
        return this.filters.filter((f) => !(f.column.includes('.') && embedNames.has(f.column.split('.')[0])));
    }

    embedFiltersFor(embed) {
        return this.filters
            .filter((f) => f.column.includes('.'))
            .filter((f) => [embed.alias, embed.table].includes(f.column.split('.')[0]))
            .map((f) => ({ ...f, column: f.column.split('.').slice(1).join('.') }));
    }

    /** Resolve one embedded relation for a base row: belongs-to or has-many. */
    resolveEmbed(baseRow, embed) {
        const localFk = `${singular(embed.table)}_id`;
        const related = this.store.rowsOf(embed.table);
        const filters = this.embedFiltersFor(embed);

        // belongs-to: the base row holds the foreign key.
        if (Object.hasOwn(baseRow, localFk)) {
            const target = related.find((r) => String(r.id) === String(baseRow[localFk]));
            if (!target) return { value: null, keep: !embed.inner };
            if (!filters.every((f) => applyFilter(target, f))) return { value: null, keep: !embed.inner };
            return { value: projectRow(target, embed.columns.length ? embed.columns : ['*']), keep: true };
        }

        // has-many: the related rows hold the foreign key back to this table.
        const remoteFk = FK_OVERRIDES[`${this.table}:${embed.table}`] ?? `${singular(this.table)}_id`;
        const children = related
            .filter((r) => String(r[remoteFk]) === String(baseRow.id))
            .filter((r) => filters.every((f) => applyFilter(r, f)));
        if (embed.inner && children.length === 0) return { value: null, keep: false };
        if (embed.countOnly) return { value: [{ count: children.length }], keep: true };
        return {
            value: children.map((c) => projectRow(c, embed.columns.length ? embed.columns : ['*'])),
            keep: true,
        };
    }

    runSelect() {
        const { columns, embeds } = parseSelect(this.selectString);
        const baseFilters = this.baseFilters(embeds);

        let rows = this.rows.filter((row) => baseFilters.every((f) => applyFilter(row, f)));

        for (const { column, ascending } of this.orders) {
            rows = [...rows].sort((a, b) => {
                const av = readPath(a, column);
                const bv = readPath(b, column);
                if (av === bv) return 0;
                if (av == null) return 1;
                if (bv == null) return -1;
                return (av > bv ? 1 : -1) * (ascending ? 1 : -1);
            });
        }

        const shaped = [];
        for (const row of rows) {
            const out = projectRow(row, columns);
            let keep = true;
            for (const embed of embeds) {
                const { value, keep: keepRow } = this.resolveEmbed(row, embed);
                if (!keepRow) { keep = false; break; }
                out[embed.alias] = value;
            }
            if (keep) shaped.push(out);
        }

        const total = shaped.length;
        let page = shaped;
        if (this.rangeBounds) page = page.slice(this.rangeBounds[0], this.rangeBounds[1] + 1);
        if (this.limitCount != null) page = page.slice(0, this.limitCount);

        if (this.headOnly) return { data: null, error: null, count: total };
        return { data: page, error: null, count: this.countMode ? total : null };
    }

    withDefaults(row) {
        const now = new Date().toISOString();
        const out = { id: row.id ?? newId(), created_at: row.created_at ?? now, ...row };
        out.id = row.id ?? out.id;
        if (this.store.hasColumn(this.table, 'updated_at')) out.updated_at = row.updated_at ?? now;
        return out;
    }

    runInsert() {
        const incoming = Array.isArray(this.payload) ? this.payload : [this.payload];
        const inserted = incoming.map((row) => this.withDefaults(row));
        this.store.rowsOf(this.table).push(...inserted);
        return inserted;
    }

    runUpdate() {
        const matched = this.rows.filter((row) => this.filters.every((f) => applyFilter(row, f)));
        const patch = { ...this.payload };
        if (this.store.hasColumn(this.table, 'updated_at')) patch.updated_at = new Date().toISOString();
        for (const row of matched) Object.assign(row, patch);
        return matched;
    }

    runUpsert() {
        const incoming = Array.isArray(this.payload) ? this.payload : [this.payload];
        const result = [];
        for (const row of incoming) {
            const existing = this.rows.find((candidate) =>
                this.onConflict.every((key) => String(candidate[key]) === String(row[key]))
            );
            if (existing) {
                Object.assign(existing, row, this.store.hasColumn(this.table, 'updated_at')
                    ? { updated_at: new Date().toISOString() }
                    : {});
                result.push(existing);
            } else {
                const created = this.withDefaults(row);
                this.rows.push(created);
                result.push(created);
            }
        }
        return result;
    }

    runDelete() {
        const rows = this.rows;
        const removed = rows.filter((row) => this.filters.every((f) => applyFilter(row, f)));
        const keep = rows.filter((row) => !removed.includes(row));
        this.store.replaceRows(this.table, keep);
        return removed;
    }

    /** Shape a mutation's affected rows the way a trailing `.select()` would. */
    shapeMutationResult(rows) {
        if (!this.selectRequested) return { data: null, error: null, count: null };
        const { columns, embeds } = parseSelect(this.selectString);
        const data = rows.map((row) => {
            const out = projectRow(row, columns);
            for (const embed of embeds) {
                const { value } = this.resolveEmbed(row, embed);
                out[embed.alias] = value;
            }
            return out;
        });
        return { data, error: null, count: null };
    }

    async execute() {
        if (DEMO_LATENCY_MS > 0) await sleep(DEMO_LATENCY_MS);
        try {
            let result;
            switch (this.action) {
                case 'select':
                    result = this.runSelect();
                    break;
                case 'insert':
                    result = this.shapeMutationResult(this.runInsert());
                    break;
                case 'update':
                    result = this.shapeMutationResult(this.runUpdate());
                    break;
                case 'upsert':
                    result = this.shapeMutationResult(this.runUpsert());
                    break;
                case 'delete':
                    result = this.shapeMutationResult(this.runDelete());
                    break;
                default:
                    throw new Error(`[demo] unsupported action: ${this.action}`);
            }

            if (this.singleMode && Array.isArray(result.data)) {
                const [first, ...rest] = result.data;
                if (this.singleMode === 'single' && (first === undefined || rest.length)) {
                    return {
                        data: null,
                        error: {
                            code: 'PGRST116',
                            message: 'JSON object requested, multiple (or no) rows returned',
                            details: `${result.data.length} rows`,
                        },
                        count: null,
                    };
                }
                return { data: first ?? null, error: null, count: result.count };
            }

            return result;
        } catch (error) {
            console.error('[demo] query failed', { table: this.table, action: this.action }, error);
            return { data: null, error: { message: error.message, code: 'DEMO_QUERY_ERROR' }, count: null };
        }
    }

    // Thenable so `await supabase.from(...)...` works without an explicit run().
    then(onFulfilled, onRejected) {
        return this.execute().then(onFulfilled, onRejected);
    }

    catch(onRejected) {
        return this.execute().catch(onRejected);
    }

    finally(onFinally) {
        return this.execute().finally(onFinally);
    }
}

export const isRelationRow = isPlainObject;
