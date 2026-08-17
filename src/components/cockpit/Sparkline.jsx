import { useId } from 'react';
import { DESIGN_FORM } from '../../lib/designForm';

// A trend line small enough to sit inside a number.
//
// The cockpit's admission filter rejects a card that only reports current state,
// and the cheapest way to turn state into change is to draw where it came from.
//
// Gaps are real. `null` points are periods with no reading, and the line BREAKS
// across them rather than interpolating — a straight line drawn through a week
// nobody pulled data invents a measurement that was never taken.
//
// When a design-reference form is active the same series renders as a smoothed
// gradient area (the shape the Siphron reference uses for its Performance
// chart) instead of a bare polyline. The gap rule is NOT relaxed for it: every
// segment gets its own curve AND its own area, so an un-measured period stays
// a hole in the fill rather than being closed over by it.

/* Catmull-Rom through the points, converted to cubic beziers. Endpoints are
   clamped so the curve starts and stops exactly on the first/last reading
   rather than overshooting past a real value. */
const curve = (pts) => {
    if (pts.length < 2) return '';
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i += 1) {
        const p0 = pts[i - 1] ?? pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] ?? p2;
        d += ` C ${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6}`;
        d += ` ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6}`;
        d += ` ${p2.x},${p2.y}`;
    }
    return d;
};

const Sparkline = ({ points = [], width = 120, height = 32, className = '' }) => {
    const gradientId = useId();
    const values = points.map((p) => (p?.value === null || p?.value === undefined ? null : Number(p.value)));
    const observed = values.filter((v) => v !== null);
    if (observed.length < 2) return null;

    const min = Math.min(...observed);
    const max = Math.max(...observed);
    const span = max - min || 1;
    const stepX = width / Math.max(1, values.length - 1);
    // A flat series sits mid-height rather than pinned to the floor, which would
    // read as "at zero" instead of "unchanged".
    const y = (v) => (max === min ? height / 2 : height - 2 - ((v - min) / span) * (height - 4));

    const segments = [];
    let current = [];
    values.forEach((v, i) => {
        if (v === null) {
            if (current.length > 1) segments.push(current);
            current = [];
            return;
        }
        current.push({ x: i * stepX, y: y(v) });
    });
    if (current.length > 1) segments.push(current);

    const lastIndex = values.reduce((last, v, i) => (v === null ? last : i), -1);
    // DEV-gated so the area/gradient path folds away in a production build.
    const areaFill = (import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true') && DESIGN_FORM !== null;

    return (
        <svg
            className={`sparkline ${areaFill ? 'sparkline--area' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
            viewBox={`0 0 ${width} ${height}`}
            width={width}
            height={height}
            aria-hidden="true"
            focusable="false"
        >
            {areaFill && (
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
                        <stop offset="1" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>
                </defs>
            )}

            {segments.map((seg) =>
                areaFill ? (
                    <g key={seg[0].x}>
                        <path
                            d={`${curve(seg)} L ${seg[seg.length - 1].x},${height} L ${seg[0].x},${height} Z`}
                            fill={`url(#${gradientId})`}
                            stroke="none"
                        />
                        <path
                            d={curve(seg)}
                            fill="none"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                        />
                    </g>
                ) : (
                    <polyline
                        key={seg[0].x}
                        points={seg.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        strokeWidth="1.5"
                        vectorEffect="non-scaling-stroke"
                    />
                ),
            )}

            {lastIndex >= 0 && (
                <circle cx={lastIndex * stepX} cy={y(values[lastIndex])} r={areaFill ? '2.8' : '2.2'} />
            )}
        </svg>
    );
};

export default Sparkline;
