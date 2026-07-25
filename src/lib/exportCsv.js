// Shared CSV export. Used by the Dashboard Export button, the chart Download, and any
// table export. RFC-4180 quoting + a UTF-8 BOM so Excel/Sheets open it cleanly.

const escapeCell = (value) => {
    const s = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Serialize rows to a CSV string. `columns` = [{ key, label, format? }].
 * format(value, row) may transform a cell before stringification.
 */
export const toCsv = (rows, columns) => {
    const header = columns.map((c) => escapeCell(c.label ?? c.key)).join(',');
    const body = (rows ?? []).map((row) =>
        columns.map((c) => escapeCell(c.format ? c.format(row[c.key], row) : row[c.key])).join(','),
    );
    return [header, ...body].join('\r\n');
};

/** Build the CSV and trigger a browser download (Blob + anchor, SeoAeo precedent). */
export const downloadCsv = (filename, rows, columns) => {
    const csv = `﻿${toCsv(rows, columns)}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
