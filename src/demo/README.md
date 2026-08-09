# Demo mode — a backend-free Kepler for showing the product

A build of the real app with a fake backend. Every screen, module and generator
works; nothing touches Supabase, Vertex, or any connector. Deployed to its own URL
and shown as a product tour.

```bash
npm run dev:demo     # http://localhost:5176
npm run build:demo   # → dist-demo/  (static, deploy anywhere)
```

The switch is the build-time flag `VITE_DEMO_MODE=true`. With it unset — every
normal build — `DEMO_MODE` folds to `false`, the four guarded branches below are
dead code, and this whole directory is tree-shaken out of the bundle.

## What the demo shows

The workspace belongs to **Ken42** (ken42.com), an AI-native operating system for
higher education, with ~13 weeks of GTM activity: three live campaigns, published
articles ranking in Search Console, four AI-visibility scan runs, a running send
engine with real replies, eight researched ABM accounts, and ₹34L of attributed
closed-won revenue.

**Ken42's positioning, product names (KenRoll, KenLearn, KenFin, …) and headline
claims are real** — taken from its public site. Everything else is invented:
metrics, pipeline, prospects, replies, revenue. The institutions in the prospect,
ABM and Apollo datasets are **fictional** (Anantara University, Vidyapeeth
Education Group, …) precisely so no real college has invented pipeline, contacts
or objections attached to its name. Competitors named in competitive intelligence
(Meritto, Camu, Academia ERP, …) are real companies described at category level
only.

Reloading the page rebuilds the dataset from scratch — that is the reset button
between demos. Anything created during a demo (a generated article, an approved
sequence, a saved list) persists until reload, so the interactive flows are real
writes, not fakes.

## The four swap points in product code

| File | Branch |
| --- | --- |
| `src/lib/env.js` | `DEMO_MODE` → config validation passes with no Supabase env |
| `src/lib/supabase.js` | `DEMO_MODE` → returns `demoClient` instead of a real client |
| `src/services/edgeClient.js` | `DEMO_MODE` → `callDemoEdgeFunction()` |
| `src/services/aiClient.js` | `DEMO_MODE` → `callDemoAI()` |
| `src/services/websiteIntelligenceService.js` | `DEMO_MODE` → bundled site snapshot instead of a live page fetch |

Nothing else in `src/` knows the demo exists. Services, hooks and components run
their production code paths, which is the point: the demo cannot drift from the
product, and a shape mismatch shows up as a real bug rather than a demo-only quirk.

## How it works

- **`pgrest.js`** — an in-memory PostgREST emulator: select/insert/update/upsert/
  delete, the filter operators the app actually uses, order/limit, single/maybeSingle,
  exact head counts, and embedded resources (`*, prospect:prospects(...)`, `!inner`,
  `child(count)`). Unsupported calls throw loudly rather than returning wrong data.
- **`store.js`** — the tables, built lazily on first use, with the two database views
  (`v_outreach_sequence_metrics`, `v_prospect_campaigns`) derived from the base rows
  exactly as their SQL does.
- **`client.js`** — the Supabase client stand-in: `from()`, a permanently signed-in
  session for Priya Menon, and an in-memory storage bucket.
- **`edge.js`** — the nine edge functions: Search Console query rows, DataForSEO
  keyword metrics, answer-engine scans, Apollo people search, Zoho/HubSpot/Salesforce
  records, Meta Ad Library ads, WordPress publish, and a `capabilities` response
  reporting every platform key as provisioned.
- **`ai.js`** — `callAI()` answered locally. Curated Ken42 output for the generators a
  demo exercises (keyword research, the three-step blog pipeline, ad variants, LinkedIn
  targeting, social posts and calendars, sequences, the three-stage ABM pipeline,
  campaign strategy), plus a generic fallback that parses the JSON skeleton embedded in
  any other Kepler prompt and fills it — so an un-curated generator still returns valid,
  on-brand structure instead of throwing mid-demo.
- **`dataset/`** — the Ken42 data itself. All timestamps are relative to page load
  (`daysAgo(12)`), so the demo never looks stale.

## Editing the dataset

One file per domain in `dataset/`. Two rules worth keeping:

1. **Row shapes must match the DB.** Columns come from `supabase/migrations/`; JSONB
   payload shapes come from whatever the real generator persists (see the normalizers
   in `src/services/*`). A mismatch renders as an empty panel or a crash — e.g. ad
   targeting needs `jobFunctions` and `adjacentTitles[].why`, not invented key names.
2. **Numbers that appear twice must agree.** Measurement's outreach snapshots are
   grown backwards from the real enrollment/message/reply counts (`fromCurrent`), and
   CRM/GA4 payloads build their UTM strings with the app's own `campaignUtm()` helper,
   so attribution genuinely matches instead of being asserted.

## Known cosmetic gap

The Dashboard and Measurement revenue figures are stored in INR but rendered with a
hardcoded `$` (`src/components/dashboard/CampaignTable.jsx`, `money()`). That is
product behaviour, not a demo artifact — worth fixing in the product if the demo
audience is Indian.
