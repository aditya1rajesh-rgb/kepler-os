# Kepler UX system (v4)

The rules a screen must follow. Written during the v4 rework; read this before
adding or changing any workspace module.

## Why v4 exists

Testers reported the app was "too cluttered" and that they "couldn't tell what a
screen is meant to be doing." Both symptoms had structural causes, not cosmetic
ones:

- **Screens were flat stacks of peer boxes.** SEO & AEO rendered eight sibling
  panels over 4.9 screens, each with its own title, its own explanatory
  sentence, and its own button. Six of those buttons were styled primary. The
  actual work surface — the pipeline board — was seventh.
- **The box was the only grouping device, and it was weak.** `--card` (#121317)
  on `--bg` (#0a0b0d) is a ~4% luminance step, so a 1px hairline carried all the
  grouping. Outlines floating on black read as unrelated rectangles.
- **Nine competing container systems** across six radii, three duplicate button
  systems (import order decided which `.btn-primary` won), 38 font sizes with
  12/12.5/13/13.5px coexisting, ~340 raw pixel spacing values against 19 token
  references, zero shadow tokens, and 11 CSS variables referenced but never
  defined (the active tab indicator had no resolvable color).

v4 fixes the causes. **Navigation was deliberately left alone** — it was not the
problem.

## The screen model: one canvas, demoted tools

Every workspace module has:

1. **One canvas** — the work surface you came for. It fills the screen. It is
   not wrapped in a panel with a title; the app header already names the screen.
2. **At most one primary action** — in the screen bar, styled `.btn-primary`.
   Nowhere else on the screen may use `.btn-primary`.
3. **A status line** — counts, sync state, connection health. Facts, not prose.
4. **A tool rail** — everything else. Connectors, one-off utilities, exports,
   configuration. Closed by default, remembers its state per module.

Nothing is deleted in this model. Things are **ranked**. If moving something to
the rail would lose a capability, it belongs on the canvas instead.

```jsx
<ModuleScreen
  moduleKey="seo-aeo"              // rail state is remembered per module
  className="mscreen--fill"        // board/map canvases; omit for documents
  railLabel="SEO tools"
  banner={<>{error}<FeedbackInsight …/></>}
  status={<><span><strong>4</strong> queued</span>…</>}
  primary={<button className="btn btn-primary">Generate keyword ideas</button>}
  rail={
    <ToolRail note="Tools act on the board.">
      <ToolGroup label="Data source">
        <ToolCard title="Search Console" state="Connected" tone="ok">…</ToolCard>
      </ToolGroup>
    </ToolRail>
  }
>
  {/* the canvas */}
</ModuleScreen>
```

`mscreen--fill` makes the screen exactly one viewport tall with the canvas
scrolling internally — right for boards and kanbans, wrong for documents and
long forms, which should scroll the page normally.

The rail **pushes** the canvas at ≥1400px, **floats** over its right edge below
that (a 1280px laptop cannot afford 320px of push), and becomes a **bottom
sheet** at ≤640px. It never uses a scrim and never traps focus — it is a
parallel tool panel, not a modal task.

## Copy rules

- **A section header's `meta` is state, not explanation.** "Connected · synced
  2h ago", "4 queued", "3 blog URLs" — yes. "Real search performance, grounds
  keywords in what people actually search for" — no.
- If a section needs a sentence to say what it is, **the label or the grouping
  is wrong**. Fix that instead of adding prose. (Apple: if you need a label to
  explain a control, the mapping is weak.)
- Two buttons with the same label must do the same thing. Campaigns v3 had two
  "New campaign" buttons opening different flows.

## Surfaces

One ladder, in `styles/surfaces.css`. Pick by what the thing **is**:

| Class | Role |
| --- | --- |
| `.surface` | a content container on the canvas |
| `.surface--inset` | a well recessed *into* a container (fields, tiles, tracks) |
| `.surface--float` | something that genuinely floats (popover, modal, rail) |
| `.surface--quiet` | a group boundary carried by tone and spacing only |

Rules:

- **A child surface is darker than its parent, never lighter.** A lighter child
  reads as another floating box.
- **Shadow and blur are reserved for `--float`.** If everything lifts, nothing
  does.
- **Reach for `--quiet` before `.surface`.** A screen of eight bordered boxes is
  the problem this system exists to solve.

The `.kepler-*` classes still work — `styles/kepler-materials.css` redefines
them over this ladder so unmigrated screens inherit the refresh. Do not write
new CSS against them.

## Tokens

All in `src/index.css`. Never hand-write a value that has a token.

- **Surface ladder** `--layer-canvas` → `-chrome` → `-raised` → `-inset` →
  `-overlay`, plus `-thin` translucent variants for use with `--blur-*`.
- **Spacing** `--sp-0…--sp-16` (4pt). Composition rhythm: `--stack-tight`,
  `--stack`, `--stack-loose`, `--pad-card`, `--pad-section`, `--gutter`.
- **Type** nine rungs, each a matched set of size + leading + tracking
  (`--fs-md`/`--lh-md`/`--tr-md`). Tracking is size-specific: large text
  tightens, small text opens up. Prefer the `.type-*` role classes to setting
  `font-size` at a call site.
- **Radius** `--r-xs…--r-xl`. A control inside a card is one rung smaller than
  the card.
- **Elevation** `--shadow-sm…--shadow-xl`. Rungs 2+ are for floating surfaces.
- **Motion** `--dur-*` graded by travel distance; `--ease-spring` and
  `--ease-spring-soft` are CSS `linear()` approximations of Apple's springs
  (damping 1.0, and ~0.8 for momentum). Gesture-driven motion belongs in
  framer-motion, which can be interrupted mid-flight.

## Motion

- **Feedback on pointer-down, not click.** `.btn:active { transform: scale(0.975) }`
  is global; don't wait for the click event to show state.
- **Default springs to no overshoot.** Add bounce (`--ease-spring-soft`) only
  when the motion followed a gesture that carried momentum.
- **Enter and exit along the same path.** The rail arrives from the right and
  leaves to the right.
- **Reduced motion is not "no feedback"** — keep state changes, drop travel and
  overshoot. Handled globally, plus `prefers-reduced-transparency` and
  `prefers-contrast: more`.

## Checklist for a new or changed screen

- [ ] Exactly one `.btn-primary` on the screen, in the bar
- [ ] The canvas is the first thing you see, not the seventh
- [ ] No `<h1>` duplicating the app header's title
- [ ] No panel header `meta` that explains rather than reports
- [ ] Cards in a grid are equal height
- [ ] No hand-written colour, spacing, radius, or font size that has a token
- [ ] Empty and loading states use `EmptyState`, not a bare `<p>` between panels
- [ ] `npx eslint <files>` clean
