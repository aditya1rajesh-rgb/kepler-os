// Pure period-over-period math over campaign_metrics rows. No I/O — unit-tested.
//
// campaign_metrics snapshots are trailing LEVELS (e.g. GA4 stores last-28d sessions),
// not per-day increments. So a period's value is the latest snapshot at/ before that
// period's end (summed across campaigns), charted honestly as a level.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Build `count` consecutive periods ending with the one containing `now`, oldest
 * first. Each: { key, label, start (inclusive), end (exclusive) } as Date objects.
 */
export const buildPeriods = (granularity, count, now = new Date()) => {
    const periods = [];
    if (granularity === 'monthly') {
        const base = new Date(now.getFullYear(), now.getMonth(), 1);
        for (let i = count - 1; i >= 0; i -= 1) {
            const start = new Date(base.getFullYear(), base.getMonth() - i, 1);
            const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
            periods.push({ key: `${start.getFullYear()}-${start.getMonth() + 1}`, label: MONTHS[start.getMonth()], start, end });
        }
    } else if (granularity === 'quarterly') {
        const q = Math.floor(now.getMonth() / 3);
        const base = new Date(now.getFullYear(), q * 3, 1);
        for (let i = count - 1; i >= 0; i -= 1) {
            const start = new Date(base.getFullYear(), base.getMonth() - i * 3, 1);
            const end = new Date(start.getFullYear(), start.getMonth() + 3, 1);
            periods.push({ key: `${start.getFullYear()}-Q${Math.floor(start.getMonth() / 3) + 1}`, label: `Q${Math.floor(start.getMonth() / 3) + 1}`, start, end });
        }
    } else {
        // weekly — 7-day windows aligned to Monday.
        const today = startOfDay(now);
        const dow = (today.getDay() + 6) % 7; // 0 = Monday
        const monday = new Date(today);
        monday.setDate(today.getDate() - dow);
        for (let i = count - 1; i >= 0; i -= 1) {
            const start = new Date(monday);
            start.setDate(monday.getDate() - i * 7);
            const end = new Date(start);
            end.setDate(start.getDate() + 7);
            periods.push({ key: `${start.getFullYear()}-${start.getMonth() + 1}-${start.getDate()}`, label: `${MONTHS[start.getMonth()]} ${start.getDate()}`, start, end });
        }
    }
    return periods;
};

/**
 * For each period, sum (across campaigns) the latest `provider` snapshot whose
 * captured_at falls at or before the period end. Returns [{ ...period, value }].
 * `rows` are raw campaign_metrics rows: { campaign_id, provider, metrics, captured_at }.
 */
export const latestPerPeriod = (rows, periods, { provider, metricKey }) => {
    const relevant = (rows ?? []).filter((r) => r.provider === provider);
    return periods.map((p) => {
        const endMs = p.end.getTime();
        const latestByCampaign = new Map();
        for (const r of relevant) {
            const t = new Date(r.captured_at).getTime();
            if (t >= endMs) continue; // snapshot after this period's window
            const key = r.campaign_id ?? '__none__';
            const prev = latestByCampaign.get(key);
            if (!prev || t > prev.t) latestByCampaign.set(key, { t, value: Number(r.metrics?.[metricKey] ?? 0) });
        }
        let value = 0;
        for (const entry of latestByCampaign.values()) value += entry.value;
        return { ...p, value };
    });
};

/** Null-safe period-over-period delta. Hidden (pct null) when there's no comparable base. */
export const periodDelta = (current, previous) => {
    const cur = Number(current) || 0;
    const prev = Number(previous) || 0;
    if (!prev) return { pct: null, direction: cur > 0 ? 'up' : 'flat' };
    const pct = Math.round(((cur - prev) / prev) * 1000) / 10;
    return { pct, direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
};
