// Shared month-grid + date helpers for calendar views (social planner + campaign
// calendar). Extracted from SocialMedia so both consume one implementation.
// All ISO formatting is LOCAL (avoids the UTC day-shift toISOString() causes in
// negative-offset timezones); calendar cells and 'YYYY-MM-DD' inputs line up.

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n) => String(n).padStart(2, '0');

/** Date → local 'YYYY-MM-DD'. */
export const toIso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Today as local 'YYYY-MM-DD'. */
export const todayIso = () => toIso(new Date());

/** Parse a local 'YYYY-MM-DD' to a Date at local midnight. */
export const fromIso = (iso) => new Date(`${iso}T00:00:00`);

/** Calendar cells (with leading blanks) for the month containing `monthDate`. */
export const monthCells = (monthDate) => {
    const y = monthDate.getFullYear();
    const m = monthDate.getMonth();
    const startWeekday = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells = Array.from({ length: startWeekday }, () => null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(y, m, d));
    return cells;
};

export const addDays = (date, n) => {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
};

/** Sunday-start of the week containing `date`, at local midnight. */
export const startOfWeek = (date) => {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
};

/** Is a local 'YYYY-MM-DD' within the current Sun–Sat week? */
export const isoInCurrentWeek = (iso) => {
    if (!iso) return false;
    const start = startOfWeek(new Date());
    const end = addDays(start, 7);
    const d = fromIso(iso);
    return d >= start && d < end;
};
