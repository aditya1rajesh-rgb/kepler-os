/**
 * Dependency-free premium bar chart (SVG). One bar is highlighted with the purple
 * gradient (à la the reference). Data: [{ label, value }]. Purely presentational -
 * real metric wiring (e.g. workspace optimization scores) can be scoped in later.
 */
const MiniBarChart = ({ data = [], highlightIndex = -1, className = '' }) => {
    const W = 520;
    const H = 200;
    const padX = 8;
    const gap = 14;
    const labelH = 24;
    const max = Math.max(1, ...data.map((d) => d.value));
    const n = data.length || 1;
    const barW = (W - padX * 2 - gap * (n - 1)) / n;
    const chartH = H - labelH;

    return (
        <svg
            className={className}
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            role="img"
            aria-label="Assets created per month"
        >
            <defs>
                <linearGradient id="mbc-hi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#6d8bff" />
                    <stop offset="1" stopColor="#4a6cf7" />
                </linearGradient>
            </defs>
            {data.map((d, i) => {
                const bh = Math.max(4, (d.value / max) * (chartH - 8));
                const x = padX + i * (barW + gap);
                const y = chartH - bh;
                const hi = i === highlightIndex;
                return (
                    <g key={d.label}>
                        <rect x={x} y={0} width={barW} height={chartH} rx="7" fill="rgba(255,255,255,0.03)" />
                        <rect
                            x={x}
                            y={y}
                            width={barW}
                            height={bh}
                            rx="7"
                            fill={hi ? 'url(#mbc-hi)' : 'rgba(255,255,255,0.13)'}
                        />
                        {hi && d.value > 0 && (
                            <text x={x + barW / 2} y={y - 8} textAnchor="middle" fontSize="12" fontWeight="600" fill="#e6ecff">
                                {d.value}
                            </text>
                        )}
                        <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="#6e6f85">
                            {d.label}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
};

export default MiniBarChart;
