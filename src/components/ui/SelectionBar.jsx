import './SelectionBar.css';

// Bulk-selection toolbar: "Select all · 25 · 50 · 100 · Clear" + a live count and
// an action slot (e.g. "Add N to list"). Presentational — the caller owns the
// selection (see useBulkSelect) and passes the total selectable count.
//   total        - number of selectable rows
//   selectedCount- currently selected
//   counts       - quick-pick chips (auto-hidden when >= total)
//   onSelectAll / onSelectN(n) / onClear
//   children     - action buttons, shown only when something is selected
const SelectionBar = ({
    total = 0,
    selectedCount = 0,
    counts = [25, 50, 100],
    onSelectAll,
    onSelectN,
    onClear,
    label = 'selected',
    children,
}) => {
    if (!total) return null;
    const chips = counts.filter((n) => n < total);
    return (
        <div className="selection-bar">
            <div className="selection-bar__picks">
                <button type="button" className="selection-bar__btn" onClick={onSelectAll}>Select all {total}</button>
                {chips.map((n) => (
                    <button key={n} type="button" className="selection-bar__btn" onClick={() => onSelectN(n)}>{n}</button>
                ))}
                {selectedCount > 0 && (
                    <button type="button" className="selection-bar__btn" onClick={onClear}>Clear</button>
                )}
                <span className="selection-bar__count">{selectedCount} {label}</span>
            </div>
            {selectedCount > 0 && children ? <div className="selection-bar__actions">{children}</div> : null}
        </div>
    );
};

export default SelectionBar;
