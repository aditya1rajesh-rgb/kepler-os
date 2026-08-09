/**
 * Demo-mode flag — the single switch that turns Kepler into a self-contained,
 * backend-free product tour.
 *
 * Set VITE_DEMO_MODE=true at BUILD time to produce a demo bundle. In every other
 * build the flag is false, `src/demo/*` is tree-shaken out of the bundle, and the
 * app behaves exactly as before (real Supabase, real edge functions, real AI).
 *
 * The demo bundle is deployed to its own URL. It never talks to Supabase: reads
 * and writes hit an in-memory dataset (src/demo/dataset), edge functions and AI
 * calls are answered locally (src/demo/edge.js, src/demo/ai.js). A page reload
 * restores the pristine dataset, which is what you want between demos.
 */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

/** Simulated network latency (ms) so loading states are visible, not instant. */
export const DEMO_LATENCY_MS = Number(import.meta.env.VITE_DEMO_LATENCY_MS ?? 90);

/** Simulated AI "thinking" time (ms) — generation should feel like work. */
export const DEMO_AI_LATENCY_MS = Number(import.meta.env.VITE_DEMO_AI_LATENCY_MS ?? 1400);

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
