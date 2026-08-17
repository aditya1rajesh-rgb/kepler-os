# Help Center — component inventory and mapping decisions

Working document. Siphron direction. A global screen (`/help`).
Read from `pages/HelpCenterPage.jsx` (69 lines) and
`constants/helpContent.js` (43 lines).

**Status: inventory complete, screen built, one copy defect fixed. The last of
the thirteen nav destinations.**

---

## Shape

Two panels under a hero, and the whole screen is content, not state:

**Getting started** — four numbered steps, "Four steps from a blank workspace to
a measured pipeline", each with a body and a **workspace-scoped deep link**
built from the active workspace id:

| # | Step | Goes to |
| --- | --- | --- |
| 1 | Build your brand intelligence | `brand-intelligence/overview` |
| 2 | Confirm your first ICP | `brand-intelligence/audience` |
| 3 | Generate your first asset | `seo-aeo/pipeline` |
| 4 | Connect a data source | `integrations` |

The order is the product's own dependency chain: brand feeds the ICP, the ICP
unlocks the generating modules, and a connector turns the Dashboard from
projection into measurement. Step 2's body says so outright — "It unlocks SEO &
AEO, Ad Creative and Outreach" — which matches `MODULE_GATES` exactly.

**Resources** — Privacy Policy, Terms of Service, Contact support.

## Checked, and fine

`{...(r.external ? {} : { target: '_blank', rel: 'noreferrer' })}` reads
backwards at a glance: the flag named `external` is the one that does *not* get
a new tab. Verified in the browser before touching it, and the behaviour is
right — the two policy pages open in a new tab so you do not lose your place,
and the `mailto:` opens in place because a new tab for a mail handoff leaves an
empty tab behind. **The flag name is the problem, not the logic**: `external`
means "is an external URL", not "opens in a new tab". Left alone; renaming it is
a code-clarity change, not a design one.

Both `/privacy` and `/terms` are real routes, so neither link is dead.

## Worth flagging

- **All three resources carry an external-link icon**, including the two that
  are internal app routes. The icon says "this leaves Kepler" about pages that
  are part of it.
- **`/data-deletion` exists as a routed page and is not listed here.** It is the
  URL platform reviewers ask for (see the app-review work), and Help Center's
  Resources panel is the obvious place a user would look for it.

## Fixed while reading

One em dash in step 1's body ("auto-builds your brand profile — so every module
writes on-brand").

## Built in Figma

Page `Help Center — Siphron`, frame `Help Center`.

Same **centred 720px column** as Settings: two global screens of short content,
laid out the same way, so moving between them does not feel like moving between
products.

Decided while drawing: the step number is a **filled counter, not a bullet**,
because the order is load-bearing here rather than decorative. The four CTAs are
right-aligned in their rows so their edges form a column, which is the row
equivalent of the card-action baseline rule: buttons of different widths still
line up on one edge.

## Mapping table

| # | Kepler component | Siphron form | Outcome | Note |
| --- | --- | --- | --- | --- |
| — | hero | page head | maps | |
| — | numbered step | counter + body + CTA row | maps | CTAs aligned on one baseline |
| — | resources list | link rows | maps | icon per row, chevron-style affordance |
| — | deep links | — | maps | workspace-scoped, built from the active workspace |
