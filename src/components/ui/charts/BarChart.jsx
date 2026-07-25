import { useEffect, useMemo, useRef, useState } from 'react';
import './BarChart.css';

// Dependency-free themed bar chart. Container-measured width, dotted gridlines,
// rounded-top bars, and an active/hovered bar with a gradient fill, a dashed vertical
// guide, a ring dot, and an HTML tooltip card. Colors come from CSS tokens.
//
// data: [{ label, value, tooltip?: [{ k, v }] }]

const niceMax = (max) => {
    if (max <= 0) return 10;
    const pow = 10 ** Math.floor(Math.log10(max));
    const n = max / pow;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * pow;
};

const roundedTopPath = (x, y, w, h, r) => {
    const radius = Math.min(r, w / 2, h);
    return `M${x},${y + h} L${x},${y + radius} Q${x},${y} ${x + radius},${y} L${x + w - radius},${y} Q${x + w},${y} ${x + w},${y + radius} L${x + w},${y + h} Z`;
};

const PAD = { top: 12, right: 8, bottom: 26, left: 38 };

const BarChart = ({ data = [], height = 260, yTicks = 4, formatTick = (v) => v, activeIndex = null }) => {
    const wrapRef = useRef(null);
    const [width, setWidth] = useState(640);
    const [hovered, setHovered] = useState(null);

    useEffect(() => {
        if (!wrapRef.current) return undefined;
        const ro = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect?.width;
            if (w) setWidth(Math.max(320, Math.round(w)));
        });
        ro.observe(wrapRef.current);
        return () => ro.disconnect();
    }, []);

    const { bars, ticks, max, plotH } = useMemo(() => {
        const rawMax = Math.max(0, ...data.map((d) => Number(d.value) || 0));
        const m = niceMax(rawMax);
        const pH = height - PAD.top - PAD.bottom;
        const plotW = width - PAD.left - PAD.right;
        const slot = data.length ? plotW / data.length : plotW;
        const barW = Math.min(46, slot * 0.5);
        const b = data.map((d, i) => {
            const v = Number(d.value) || 0;
            const h = m ? (v / m) * pH : 0;
            const cx = PAD.left + slot * i + slot / 2;
            return { ...d, index: i, x: cx - barW / 2, cx, y: PAD.top + (pH - h), w: barW, h };
        });
        const t = Array.from({ length: yTicks + 1 }, (_, i) => {
            const val = (m / yTicks) * i;
            return { val, y: PAD.top + pH - (i / yTicks) * pH };
        });
        return { bars: b, ticks: t, max: m, plotH: pH };
    }, [data, width, height, yTicks]);

    const active = hovered ?? activeIndex;
    const activeBar = active != null ? bars[active] : null;

    return (
        <div className="bar-chart" ref={wrapRef} style={{ height }}>
            <svg width={width} height={height} className="bar-chart__svg" role="img">
                <defs>
                    <linearGradient id="bar-chart-active" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="var(--accent-text)" />
                        <stop offset="1" stopColor="var(--accent)" />
                    </linearGradient>
                </defs>

                {ticks.map((t, i) => (
                    <g key={i}>
                        <line
                            x1={PAD.left} y1={t.y} x2={width - PAD.right} y2={t.y}
                            className="bar-chart__grid" strokeDasharray="2 4"
                        />
                        <text x={PAD.left - 8} y={t.y + 3} textAnchor="end" className="bar-chart__ytick">
                            {formatTick(Math.round(t.val))}
                        </text>
                    </g>
                ))}

                {activeBar && (
                    <line
                        x1={activeBar.cx} y1={PAD.top} x2={activeBar.cx} y2={PAD.top + plotH}
                        className="bar-chart__guide" strokeDasharray="3 3"
                    />
                )}

                {bars.map((bar) => (
                    <path
                        key={bar.index}
                        d={roundedTopPath(bar.x, bar.y, bar.w, Math.max(bar.h, 2), 6)}
                        className={`bar-chart__bar ${bar.index === active ? 'bar-chart__bar--active' : ''}`}
                        fill={bar.index === active ? 'url(#bar-chart-active)' : 'rgba(255,255,255,0.07)'}
                    />
                ))}

                {activeBar && activeBar.h > 0 && (
                    <circle cx={activeBar.cx} cy={activeBar.y} r="4" className="bar-chart__dot" />
                )}

                {bars.map((bar) => (
                    <text key={`l${bar.index}`} x={bar.cx} y={height - 8} textAnchor="middle" className="bar-chart__xtick">
                        {bar.label}
                    </text>
                ))}

                {/* Full-height hit areas for hover */}
                {bars.map((bar) => (
                    <rect
                        key={`h${bar.index}`}
                        x={bar.cx - (width - PAD.left - PAD.right) / (bars.length * 2)}
                        y={PAD.top}
                        width={(width - PAD.left - PAD.right) / bars.length}
                        height={plotH}
                        fill="transparent"
                        onMouseEnter={() => setHovered(bar.index)}
                        onMouseLeave={() => setHovered(null)}
                    />
                ))}
            </svg>

            {activeBar && activeBar.tooltip && (
                <div
                    className="bar-chart__tooltip"
                    style={{
                        left: `${(activeBar.cx / width) * 100}%`,
                        top: `${Math.max(0, activeBar.y - 8)}px`,
                    }}
                >
                    {activeBar.tooltip.map((row) => (
                        <div key={row.k} className="bar-chart__tip-row">
                            <span className="bar-chart__tip-k">{row.k}</span>
                            <span className="bar-chart__tip-v">{row.v}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default BarChart;
