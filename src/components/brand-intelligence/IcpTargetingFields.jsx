import {
    COMPANY_SIZE_BANDS,
    INDUSTRIES,
    PLATFORM_TARGETING_SUPPORT,
    REVENUE_BANDS,
    normalizeTargeting,
    targetingForPlatform,
} from '../../lib/icpTargeting';

// The ICP's targeting block (E22).
//
// Its own component for two reasons: BrandIntelligence.jsx is already 1,200
// lines, and the same block has to appear in both the add form and the
// suggestion card — one copy, or the two drift.
//
// The fields are SELECTS, not free text, and that is the whole point. `companyType`
// already exists as prose and is excellent for writing copy; nothing on an ad
// platform can select it. These four are platform-agnostic values that S8's
// renditions can translate.

const PLATFORMS = Object.keys(PLATFORM_TARGETING_SUPPORT);

const FIELD_NOUNS = {
    companySizeBand: 'company size',
    revenueBand: 'revenue',
    geographyTargets: 'locations',
    industry: 'industry',
};

/** "a", "a or b", "a, b or c" — not "a or b or c". */
const joinFields = (fields) => {
    const names = fields.map((f) => FIELD_NOUNS[f] ?? f);
    if (names.length <= 1) return names[0] ?? '';
    return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
};

const IcpTargetingFields = ({ value, onChange, idPrefix = 'icp' }) => {
    const targeting = normalizeTargeting(value);
    const set = (patch) => onChange(normalizeTargeting({ ...targeting, ...patch }));

    // What each platform will actually do with this, computed from the block as
    // it stands. The roadmap's honesty clause: say what cannot be done rather
    // than accepting input that quietly disappears at push time.
    const renditions = PLATFORMS
        .map((p) => targetingForPlatform(p, targeting))
        .filter((r) => r && r.dropped.length > 0);

    return (
        <div className="icp-targeting">
            <div className="icp-targeting__grid">
                <div className="data-section">
                    <label className="data-label" htmlFor={`${idPrefix}-size`}>Company size</label>
                    <select
                        id={`${idPrefix}-size`}
                        className="intel-input"
                        value={targeting.companySizeBand}
                        onChange={(e) => set({ companySizeBand: e.target.value })}
                    >
                        <option value="">Any size</option>
                        {COMPANY_SIZE_BANDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                    </select>
                </div>

                <div className="data-section">
                    <label className="data-label" htmlFor={`${idPrefix}-industry`}>Industry</label>
                    <select
                        id={`${idPrefix}-industry`}
                        className="intel-input"
                        value={targeting.industry?.id ?? ''}
                        onChange={(e) => set({ industry: e.target.value })}
                    >
                        <option value="">Any industry</option>
                        {INDUSTRIES.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
                    </select>
                </div>

                <div className="data-section">
                    <label className="data-label" htmlFor={`${idPrefix}-revenue`}>Revenue</label>
                    <select
                        id={`${idPrefix}-revenue`}
                        className="intel-input"
                        value={targeting.revenueBand}
                        onChange={(e) => set({ revenueBand: e.target.value })}
                    >
                        <option value="">Any revenue</option>
                        {REVENUE_BANDS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                </div>

                <div className="data-section">
                    <label className="data-label" htmlFor={`${idPrefix}-geo`}>Locations (comma-separated)</label>
                    <input
                        id={`${idPrefix}-geo`}
                        className="intel-input"
                        value={targeting.geographyTargets.join(', ')}
                        placeholder="e.g. India, Singapore"
                        onChange={(e) => set({ geographyTargets: e.target.value })}
                    />
                </div>
            </div>

            {renditions.length > 0 && (
                <ul className="icp-targeting__notes">
                    {renditions.map((r) => (
                        <li key={r.platform}>
                            <strong>{r.label}</strong> can’t target {joinFields(r.dropped)}.
                            {r.note ? ` ${r.note}` : ''}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default IcpTargetingFields;
