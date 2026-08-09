/**
 * Deterministic UUIDs for the demo dataset.
 *
 * Rows need stable, valid v4-shaped UUIDs so fixtures can cross-reference each
 * other by name (`id('seq-decision-makers')`) and so `isUuid()` guards in
 * src/lib/validation.js accept them. Same name in, same UUID out, every reload.
 */
import { generateUuid } from '../lib/uuid';

/** FNV-1a → 32-bit seed. */
const seedFrom = (name) => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < name.length; i += 1) {
        hash ^= name.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
};

/** mulberry32 — tiny deterministic PRNG. */
const prng = (seed) => () => {
    let t = (seed += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t ^= (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const cache = new Map();

/** Stable UUID for a demo entity name. */
export const id = (name) => {
    const key = String(name);
    if (cache.has(key)) return cache.get(key);

    const random = prng(seedFrom(key));
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    const uuid = [
        hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20),
    ].join('-');

    cache.set(key, uuid);
    return uuid;
};

/** Fresh random UUID for rows created during the demo session. */
export const newId = () => generateUuid();
