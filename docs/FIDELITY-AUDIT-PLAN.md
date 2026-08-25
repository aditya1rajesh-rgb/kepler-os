# Fidelity audit — Figma frames against the running demo

Prepared so the audit can start immediately in a session that HAS Figma access.
It was blocked here: the Figma desktop app's Dev Mode MCP Server is not enabled,
and the plugin server needs an OAuth flow this session could not run.

**To unblock:** Figma desktop → Figma menu → Preferences → *Enable Dev Mode MCP
Server*, then restart Claude. Verify with `mcp__Figma__get_metadata`; it should
return a node tree rather than the setup instructions.

Note that server reads **the current selection in the desktop app** — it takes no
file key. So the file must be open, and each frame selected in turn, or its node
id passed. The other server (`use_figma`, file key `XlstnvwPQpcOq2tNY7sjxN`) takes
a key directly and is the better one if its auth can be completed.

## The map

Thirteen pages, one per nav destination. Page ids are from this file; run the
demo with `npm run dev:demo` and append `?theme=siphron` to every route.

| Figma page | id | Demo route (after `/workspace/:id`) |
| --- | --- | --- |
| Dashboard — Siphron | `0:1` | `/overview` |
| Goals — Siphron | `27:72` | `/goals` |
| Campaigns — Siphron | `32:72` | `/campaigns` |
| Measurement — Siphron | `37:72` | `/measurement` |
| Outreach — Siphron | `60:72` | `/outreach/replies`, `/sequences`, `/audiences`, `/abm` |
| Brand Intelligence — Siphron | `98:91` | `/brand-intelligence` + `?tab=` details/competitors/audience/files |
| SEO & AEO — Siphron | `107:91` | `/seo-aeo/pipeline`, `/opportunities`, `/ai-visibility` |
| Social Media — Siphron | `116:91` | `/social-media` |
| Ad Creative — Siphron | `121:91` | `/ad-campaigns` |
| Library — Siphron | `128:91` | `/library` |
| Integrations — Siphron | `131:91` | `/integrations` |
| Settings — Siphron | `139:91` | `/settings` |
| Help Center — Siphron | `141:91` | `/help` |

## What the docs already pin down

These record their frames explicitly, so they are the strongest specs and the
best place to start:

| Doc | Frames listed |
| --- | --- |
| `AUDIENCES-ABM-MAPPING.md` | 8 |
| `BRAND-INTELLIGENCE-MAPPING.md` | 5 |
| `SOCIAL-MEDIA-MAPPING.md` | 4 |
| `SEO-AEO-MAPPING.md` | 3 |

The rest (Dashboard, Goals, Campaigns, Measurement, Outreach, Ad Creative,
Library, Integrations, Settings, Help Center) record decisions in prose but do
not enumerate frames. Read the frame off Figma for those rather than trusting a
reconstruction.

## Method

Same discipline as the port: **read geometry off the node, never off a
screenshot, and never off a value you computed yourself.**

1. `get_metadata` on the page → frame list and node ids.
2. Per frame: read the real numbers — width, padding, gap, corner radius, fill
   token, text size/weight/line-height.
3. Screenshot the same route in the demo at 1440×900.
4. Compare in this order, because this is the order that matters:
   1. **Structure** — same panels, same order, same columns.
   2. **Content** — same real Ken42 data, same counts, same copy.
   3. **States** — the frame's state is reachable in the app at all.
   4. **Geometry** — spacing, sizing, radius, elevation.
   5. **Type** — size, weight, tracking, line height.
5. Where they disagree: the **product rule wins and the form bends** — that rule
   already resolved several frames during the original build. Record the call in
   the relevant mapping doc rather than silently following Figma.

## Known divergences before you start

These are already true and are NOT bugs to re-fix:

- **Audiences and Research were rebuilt structurally**, not restyled. The Figma
  frames `Outreach · Audiences` and `Outreach · ABM` are the target; the older
  tab-strip and chat-log frames, if still on the page, are superseded.
- **Integrations dropped its eight category headers** for one flat four-up grid
  with search, and the capability chips came OFF the cards into the modals.
- **The budget control is three stops**, not a slider.
- **Ad Creative's gate** now titles itself "Ad Creative", not "Ad Campaigns".
- The **states frames** (six of them) and the **Integrations modals** were drawn
  after the screens; check them against `STATES-MAPPING.md`, which lists every
  state with its exact copy.

## Expect the ink to differ from the Figma variables

The Siphron variable collection in Figma still holds the ORIGINAL ink ramp. Code
has since moved it to clear WCAG AA, and Figma has not been updated:

| Token | Figma | Code now | Why |
| --- | --- | --- | --- |
| `--text-secondary` | `#41464c` | `#363b45` | kept four steps distinct |
| `--text-muted` | `#767c8a` | `#4f5664` | was 3.69:1 on the inset tone |
| `--text-dim` | `#a3a9b8` | `#656c7a` | was 2.07:1 |
| `--positive` | `#2f7d5f` | `#276a50` | was 4.25:1 on its own tint |
| `--negative` | `#c8443c` | `#b03a33` | was 4.14:1 |
| `--warning` | `#b07d1f` | `#7d5813` | was 3.17:1 |

**Do not "fix" the code back to the Figma values.** Update the Figma collection
to match the code — the accessible values are the source of truth now. New tokens
with no Figma equivalent: `--on-accent`, `--accent-fill`, `--negative-fill`,
`--wash-1..4`, `--edge-highlight`, `--edge-highlight-accent`, `--canvas-fade`,
`--header-fade-from`.
