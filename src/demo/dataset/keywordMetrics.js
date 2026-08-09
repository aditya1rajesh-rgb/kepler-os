/**
 * Keyword volume / difficulty, as the DataForSEO capability would report it.
 *
 * Curated values for the terms in the demo's keyword set; anything else gets a
 * deterministic value derived from the term itself, so a keyword typed live during
 * a demo still comes back with plausible, stable metrics.
 */
const metric = (volume, difficulty, cpc, competition) => ({ volume, difficulty, cpc, competition });

export const KEYWORD_METRICS = {
    'campus management software india': metric(18100, 34, 412, 0.71),
    'university erp software': metric(12100, 41, 388, 0.68),
    'admission management software': metric(14800, 38, 356, 0.74),
    'best admissions software for universities': metric(9900, 31, 402, 0.66),
    'student information system india': metric(7400, 29, 298, 0.52),
    'college management system software': metric(8100, 36, 274, 0.63),
    'nirf 2026 parameters': metric(22200, 19, 46, 0.14),
    'naac evidence collection': metric(890, 11, 88, 0.22),
    'naac accreditation software': metric(4400, 27, 312, 0.58),
    'naac documentation process': metric(3600, 16, 74, 0.19),
    'switch admissions software mid cycle': metric(210, 14, 264, 0.34),
    'campus management platform vs admissions crm': metric(480, 22, 288, 0.41),
    'ken42 vs meritto': metric(90, 8, 196, 0.28),
    'campus management software pricing india': metric(2100, 33, 356, 0.69),
    'student information system vs erp': metric(3300, 29, 214, 0.44),
    'fee management software for colleges': metric(5400, 31, 286, 0.61),
    'placement management software': metric(3600, 26, 198, 0.48),
    'whatsapp student communication compliance': metric(260, 21, 112, 0.31),
    'higher education crm india': metric(8100, 44, 468, 0.78),
    'admissions crm comparison': metric(1600, 24, 302, 0.52),
    'multi campus erp': metric(1300, 28, 244, 0.46),
    'exam management software india': metric(1900, 25, 176, 0.43),
    'scholarship management software india': metric(1100, 22, 168, 0.38),
    'hostel management system': metric(2400, 23, 132, 0.36),
    'alumni engagement platform india': metric(540, 18, 156, 0.29),
    'dpdp compliance education': metric(720, 17, 208, 0.33),
    'aicte reporting software': metric(960, 20, 226, 0.39),
};

/** Deterministic fallback so unseen keywords still return stable, sane metrics. */
export const metricsForKeyword = (term) => {
    const s = String(term ?? '').trim().toLowerCase();
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    const words = s.split(/\s+/).filter(Boolean).length || 1;
    // Longer phrases → lower volume and difficulty, which is how the real curve behaves.
    const volumeBand = [12000, 6000, 2400, 880, 320, 140][Math.min(words - 1, 5)];
    const volume = Math.max(20, Math.round((volumeBand * (0.55 + (h % 90) / 100)) / 10) * 10);
    const difficulty = Math.min(72, Math.max(6, Math.round(46 - words * 4 + (h % 17))));
    const cpc = Math.round(60 + (h % 420));
    const competition = Number(Math.min(0.94, 0.12 + ((h >> 5) % 80) / 100).toFixed(2));
    return { volume, difficulty, cpc, competition };
};
