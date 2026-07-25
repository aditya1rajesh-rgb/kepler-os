// Dark-track segmented control (Weekly/Monthly/Quarterly, Today/Week). The active
// segment is an elevated bordered pill.
const SegmentedControl = ({ options, value, onChange, size = 'md' }) => (
    <div className={`segmented segmented--${size}`}>
        {options.map((o) => {
            const val = typeof o === 'string' ? o.toLowerCase() : o.value;
            const label = typeof o === 'string' ? o : o.label;
            return (
                <button
                    key={val}
                    type="button"
                    className={`segmented__opt ${val === value ? 'segmented__opt--active' : ''}`}
                    onClick={() => onChange(val)}
                >
                    {label}
                </button>
            );
        })}
    </div>
);

export default SegmentedControl;
