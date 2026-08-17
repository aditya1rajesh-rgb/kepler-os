# Settings — component inventory and mapping decisions

Working document. Siphron direction. A global screen (`/profile`), not
workspace-scoped, though the workspace sidebar stays beside it.
Read from `pages/ProfilePage.jsx` (101 lines).

**Status: inventory complete, screen built, two copy defects fixed.**

---

## Shape

The smallest screen in the product, and the only one whose inventory is shorter
than its state list:

- **Hero**: `Settings` / "Your account across Kepler."
- **Account panel**: display name (editable), email (read-only, disabled), Save,
  and a saved / error notice beside the button.
- **Connectors pointer**: a migration notice explaining that data sources moved
  to Integrations, with a button through to it.

That is the whole screen. Ken42's is `Priya Menon` / `priya@ken42.com`.

## What is not here

Worth stating plainly, because the gap is the finding:

- **Sign out** is in the header avatar menu, not on Settings.
- There is **no password change, no theme, no notification preferences, no
  workspace management and no account deletion**. A user who opens Settings
  looking for any of those finds a single text field.

None of that is a design defect to fix in this pass. It is a product gap, and it
belongs on a roadmap rather than being invented here: drawing a Danger Zone or a
theme toggle that no code backs would be designing fiction.

**The connectors pointer is a migration notice**, and migration notices expire.
It has done its job for anyone who used the product before connectors moved; for
a new workspace it explains a move they never saw. Worth a decision at port
time about when it comes out.

## Fixed while reading

Two em dashes in prose: the account panel's meta ("Your name appears across
Kepler — the home greeting and menus") and the pointer's body ("Data sources
moved to Integrations — they're scoped per workspace now").

## Built in Figma

Page `Settings — Siphron`, frame `Settings`.

**A centred 720px column, not the full 1,116.** The shipped page runs to 960px
wide with inputs capped at 420, which leaves each panel two-thirds empty. Two
short fields do not want a wide canvas: the column narrows to the content, and
the inputs fill their panel rather than stopping halfway across it.

The saved and error notices are drawn beside the Save button, where they appear,
rather than as separate state cards. On a screen this small the states are the
screen.

## Mapping table

| # | Kepler component | Siphron form | Outcome | Note |
| --- | --- | --- | --- | --- |
| — | hero | page head | maps | |
| — | account panel | form panel | maps | inputs fill the panel; the 420px cap goes |
| — | read-only email | disabled input | maps | inset fill, dim text, no border |
| — | save + notice row | action row | maps | notice sits beside the button |
| — | connectors pointer | notice panel with icon and CTA | maps | its lifespan is a product decision, not a design one |
