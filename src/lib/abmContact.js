// Shared helpers for projecting an ABM contact into the prospect list. Used by
// both the per-result card and the batch "save all qualifying" action so the
// mapping + dedupe key stay identical.

// Index-free stable key: works on both abm contacts and mapped prospects so a
// created prospect can be matched back to its abm_contact row for the backlink.
export const contactMatchKey = (c) =>
    c.externalId
    || (c.email
        ? `e:${String(c.email).toLowerCase()}`
        : `n:${String(c.firstName).toLowerCase()}|${String(c.lastName).toLowerCase()}|${String(c.title).toLowerCase()}`);

export const toProspectInsert = (c, account = {}) => ({
    firstName: c.firstName,
    lastName: c.lastName,
    title: c.title,
    company: c.company || account.companyName || '',
    email: c.email,
    linkedinUrl: c.linkedinUrl,
    location: '',
    source: 'abm',
    externalId: c.externalId,
});
