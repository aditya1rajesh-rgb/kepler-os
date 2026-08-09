/**
 * Production stand-in for the demo modules.
 *
 * Normal builds alias `../demo/{client,edge,ai,website}` to this file (see
 * vite.config.js), so the demo client, the Ken42 dataset and the local AI never
 * reach a production bundle — not as dead code, not as bytes.
 *
 * Every export here is unreachable at runtime: the call sites are all behind
 * `if (DEMO_MODE)`, which is `false` in these builds. They throw rather than
 * returning something plausible, so a wiring mistake fails loudly.
 */
const unreachable = (what) => () => {
    throw new Error(`[demo] ${what} is not available in a production build`);
};

export const demoClient = new Proxy({}, {
    get(_target, prop) {
        throw new Error(`[demo] demoClient.${String(prop)} is not available in a production build`);
    },
});

export const callDemoEdgeFunction = unreachable('callDemoEdgeFunction');
export const callDemoAI = unreachable('callDemoAI');
export const fetchDemoWebsiteContent = unreachable('fetchDemoWebsiteContent');
