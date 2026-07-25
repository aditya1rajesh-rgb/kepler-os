import { useCallback, useState } from 'react';

// Reusable multi-select over string ids. Powers the select-all / select-N bulk
// actions across ABM Research, Prospecting, Saved, and the list detail view.
// Callers own the id list; this only tracks which ids are selected.
export const useBulkSelect = () => {
    const [selected, setSelected] = useState(() => new Set());

    const toggle = useCallback((id) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    // Replace the selection with an explicit id list (Select all).
    const selectAll = useCallback((ids) => setSelected(new Set(ids)), []);

    // Select the first N of an already-ordered id list (e.g. by fit desc).
    const selectTop = useCallback((n, orderedIds) => setSelected(new Set(orderedIds.slice(0, n))), []);

    // Add every id in `ids` to the current selection (per-card "select all").
    const addMany = useCallback((ids) => {
        setSelected((prev) => new Set([...prev, ...ids]));
    }, []);

    // Remove every id in `ids` from the selection (per-card "clear").
    const removeMany = useCallback((ids) => {
        setSelected((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.delete(id));
            return next;
        });
    }, []);

    const clear = useCallback(() => setSelected(new Set()), []);
    const has = useCallback((id) => selected.has(id), [selected]);

    return { selected, size: selected.size, has, toggle, selectAll, selectTop, addMany, removeMany, clear };
};
