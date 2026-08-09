// A trend line small enough to sit inside a number.
//
// The cockpit's admission filter rejects a card that only reports current state,
// and the cheapest way to turn state into change is to draw where it came from.
//
// Gaps are real. `null` points are periods with no reading, and the line BREAKS
// across them rather than interpolating — a straight line drawn through a week
// nobody pulled data invents a measurement that was never taken.
const Sparkline = ({ points = [], width = 120, height = 32, className = '' }) => {
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
        current.push(`${i * stepX},${y(v)}`);
    });
    if (current.length > 1) segments.push(current);

    const lastIndex = values.reduce((last, v, i) => (v === null ? last : i), -1);

    return (
        <svg
            className={`sparkline ${className}`.trim()}
            viewBox={`0 0 ${width} ${height}`}
            width={width}
            height={height}
            aria-hidden="true"
            focusable="false"
        >
            {segments.map((seg) => (
                <polyline key={seg[0]} points={seg.join(' ')} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            ))}
            {lastIndex >= 0 && (
                <circle cx={lastIndex * stepX} cy={y(values[lastIndex])} r="2.2" />
            )}
        </svg>
    );
};

export default Sparkline;
