/**
 * The user's appearance choice. Two real themes, not a dev experiment.
 *
 * `kepler` is the premium-dark system in `index.css :root`. `siphron` is the
 * light system in `styles/theme-siphron.css`, which overrides those same root
 * tokens under `[data-theme='siphron']`.
 *
 * Kepler's dark values stay on `:root` rather than moving into a
 * `[data-theme='kepler']` block, so nothing depends on the attribute being
 * present to render correctly - a stored value we cannot parse, or a first paint
 * before this runs, degrades to dark rather than to unstyled.
 *
 * The DEFAULT is `siphron`: it is the design every screen was drawn against.
 * Flip DEFAULT_THEME to change that.
 */

export const THEMES = [
    { id: 'siphron', label: 'Light', hint: 'Cool, low-contrast surfaces that group by shadow.' },
    { id: 'kepler', label: 'Dark', hint: 'The original Kepler system: near-black canvas, indigo accent.' },
];

export const DEFAULT_THEME = 'siphron';

const STORAGE_KEY = 'kepler-theme';

const isValid = (id) => THEMES.some((t) => t.id === id);

/** The stored choice, or the default. Never throws: storage can be unavailable. */
export const readTheme = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (isValid(stored)) return stored;
    } catch {
        /* private mode, or storage disabled */
    }
    return DEFAULT_THEME;
};

/**
 * Put the theme on <html>. `kepler` clears the attribute instead of setting it,
 * because its tokens ARE the root defaults - see the note above.
 */
export const applyTheme = (id) => {
    const theme = isValid(id) ? id : DEFAULT_THEME;
    if (theme === 'kepler') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    return theme;
};

export const setTheme = (id) => {
    const theme = applyTheme(id);
    try {
        localStorage.setItem(STORAGE_KEY, theme);
    } catch {
        /* the choice still applies for this session */
    }
    return theme;
};

/** Called from main.jsx before React mounts, so there is no flash of the other theme. */
export const bootTheme = () => applyTheme(readTheme());
