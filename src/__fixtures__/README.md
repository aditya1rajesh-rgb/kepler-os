# Test / Storybook fixtures

Runtime demo mocks (`mockWorkspaces.js`, `mockBrandData.js`, `demoMode.js`) were removed as part of the live-only hardening phase.

If you add unit tests or Storybook stories, place isolated fixture data in this directory only. Fixtures here must **not** be imported by production service code or route components.

Example layout:

```
src/__fixtures__/
  workspaces.js      # sample workspace rows for tests
  brandProfiles.js   # sample brand data for component stories
```
