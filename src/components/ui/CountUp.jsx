import { useEffect, useRef, useState } from 'react';

const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);

/** Animated number that counts up to `value` on mount (respects reduced-motion). */
const CountUp = ({ value = 0, duration = 900, className = '', suffix = '' }) => {
    const [display, setDisplay] = useState(0);
    const raf = useRef(0);

    useEffect(() => {
        const target = Number(value) || 0;
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const dur = reduce ? 0 : duration;
        const start = performance.now();
        const tick = (now) => {
            const p = dur === 0 ? 1 : Math.min(1, (now - start) / dur);
            setDisplay(Math.round(target * easeOutCubic(p)));
            if (p < 1) raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf.current);
    }, [value, duration]);

    return (
        <span className={className}>
            {display}
            {suffix}
        </span>
    );
};

export default CountUp;
