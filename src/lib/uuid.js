/**
 * Cross-environment UUID v4 generator.
 *
 * `crypto.randomUUID()` is only available in secure contexts (HTTPS / localhost).
 * Over plain http on a LAN IP, in some embedded webviews, or older runtimes it is
 * undefined and throws. This falls back to `crypto.getRandomValues` and finally to
 * Math.random so workspace creation never breaks because of the host environment.
 */
export const generateUuid = () => {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch {
        // fall through to manual generation
    }

    let getRandom;
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        getRandom = () => {
            const bytes = new Uint8Array(16);
            crypto.getRandomValues(bytes);
            return bytes;
        };
    } else {
        getRandom = () => {
            const bytes = new Uint8Array(16);
            for (let i = 0; i < 16; i += 1) {
                bytes[i] = Math.floor(Math.random() * 256);
            }
            return bytes;
        };
    }

    const bytes = getRandom();
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

    const hex = [];
    for (let i = 0; i < 256; i += 1) {
        hex.push((i + 0x100).toString(16).slice(1));
    }

    return (
        hex[bytes[0]] + hex[bytes[1]] + hex[bytes[2]] + hex[bytes[3]] + '-' +
        hex[bytes[4]] + hex[bytes[5]] + '-' +
        hex[bytes[6]] + hex[bytes[7]] + '-' +
        hex[bytes[8]] + hex[bytes[9]] + '-' +
        hex[bytes[10]] + hex[bytes[11]] + hex[bytes[12]] +
        hex[bytes[13]] + hex[bytes[14]] + hex[bytes[15]]
    );
};
