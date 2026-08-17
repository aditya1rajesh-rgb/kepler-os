/**
 * Which design-reference FORM the app should render in.
 *
 * The theme files (styles/theme-*.css) only re-point colour, type and radius
 * tokens — they cannot change a component's anatomy. This flag is what lets a
 * component render in a reference's *shape*: Kepler's funnel stage as a pastel
 * icon-chip tile, its channel table as a ranked leaderboard, its sparkline as a
 * gradient area chart.
 *
 * Read once at module load. The theme is applied to <html> before React mounts
 * and switching it requires a reload, so there is nothing to subscribe to.
 *
 * Available in dev AND in the demo build — the demo bundle is how the design is
 * actually shown to someone, so a design experiment that cannot reach it is not
 * reviewable. Always null in a real production build (`npm run build`), where
 * both flags fold to false and every call site collapses to Kepler's existing
 * rendering.
 */
import { DEMO_MODE } from '../demo/flag';

/* Everything lives INSIDE read() on purpose. A module-level const survives
   dead-code elimination even when the branch that uses it folds away, so the
   form names leaked into the production bundle as a stray string array. The gate
   is also NOT exported for the same reason — a cross-module const defeats DCE,
   so each call site inlines the literal expression instead (see cockpit/*.jsx). */
const read = () => {
    if (!(import.meta.env.DEV || DEMO_MODE)) return null;
    if (typeof document === 'undefined') return null;
    const t = document.documentElement.dataset.theme;
    return ['fin', 'siphron'].includes(t) ? t : null;
};

export const DESIGN_FORM = read();
