// Provenance labels ("Edited by you", "From website", …) are intentionally
// hidden per product decision - users can see and fix any field themselves.
// The underlying fieldProvenance data is still tracked and still protects manual
// edits from being overwritten on regeneration; only the visual chip is removed.
// Kept as a no-op component so existing call sites don't need to change.
const ProvenanceLabel = () => null;

export default ProvenanceLabel;
