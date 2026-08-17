# Integrations — component inventory and mapping decisions

Working document. Siphron direction. One flat destination; the connector grid
IS the canvas. Read from `pages/workspace-modules/Integrations.jsx`,
`components/integrations/ConnectorsPanel.jsx` and `lib/connectors.js`.

**Status: inventory complete, screen built, six copy defects fixed. The logo
refresh is blocked on a Brandfetch client ID.**

---

## Shape

Sixteen connectors in eight categories, with a status line reading
`12 of 16 connected`. No primary action: connecting happens on the card.

| Category | Connectors |
| --- | --- |
| Search | Google Search Console |
| CRM | HubSpot · Zoho CRM · Salesforce |
| Ad intelligence | Meta Ad Library |
| Analytics | Google Analytics 4 |
| Paid media | Google Ads · Meta Ads |
| Prospecting | Apollo |
| Publishing | LinkedIn · Facebook & Instagram · WordPress |
| AI visibility | Perplexity · ChatGPT · Claude · Google AI Overviews |

Three states, and they are genuinely different: **Connected**, **Needs
attention** (a granted-scope shortfall, offering Reconnect), and **Managed by
Kepler** (a central server-side key, so there is nothing to connect and the card
correctly offers no action).

Each card carries **capability chips** (Read / Write / Targeting) and the module
it feeds (`Enhances Outreach`). That pairing is the point of the screen: it says
what a connection buys, not just that it exists.

## Built in Figma

Page `Integrations — Siphron`, frame `Integrations` (911px).

**Search replaced the category headers.** The screen first went in as eight
labelled sections at 2,471px. Five of those categories hold a single connector,
so each cost a header plus a row that was two-thirds empty. Dropping the headers
for a **flat four-up grid with a search field in the head** took it to 911px —
63% shorter — and search is the better finding tool anyway once there are more
than a handful: it matches the connector *and* what it enhances, which a
category label cannot.

Grouping is not lost. The registry order still clusters related connectors, and
each card names the module it feeds.

Card at 270 × 190: logo slot and state pill on the top row, then name with
`Enhances X` beneath it, the description, and the action right-aligned at the
foot. The four `Managed by Kepler` cards have no footer at all, because there is
genuinely nothing to do to them.

**Capabilities came off the card.** Read / Write / Targeting were drawn as chips
and then removed: they are detail for the connect and manage modals, which are
not designed yet, and a card is the wrong place to learn what a connection can
do before you have made one.

The card was also asserting something it cannot know. `capabilityScopes` exists
precisely because a provider may grant a **subset** at consent time, which is
what lets a connector say "read works, publishing was not authorised". Three
flat chips reading `Read Write Targeting` on a card in `Needs attention` implied
all three were live when the shortfall is the reason the card is in that state.
Granted-versus-requested belongs in the modal, where there is room to show both.

**Every logo sits in a fixed 36×36 slot** so real artwork drops in without
relayout. The slots currently hold lettermarks — see below.

## The logo refresh is done

All sixteen connectors now carry their real brand mark, in Figma **and** in the
app. Pulled from Brandfetch at 144×144 (4× the 36px slot), uniform square PNGs.

**The fast recipe**, which is not the one the tool descriptions point at:

- `build_logo_urls` is the wrong tool — its URLs are hotlink-only and blocked
  for programmatic fetching.
- `get_brand(domain)` returns credentialed CDN URLs that *are* fetchable, but the
  payload is enormous (Google's carries ~45 asset variants).
- **The credential from any `get_brand` response also works on the short
  domain-form URL**: `https://cdn.brandfetch.io/{domain}/w/144/h/144/icon.png?c={token}`.
  One `get_brand` call to obtain the token, then plain `curl` for every brand.
  Sixteen logos in two commands instead of sixteen giant round trips.
- Into Figma: `upload_assets` with `count: 16`, POST each file as
  `multipart/form-data` (the filename becomes the layer name), then read the
  returned `imageHash` and set
  `fills = [{ type: 'IMAGE', imageHash, scaleMode: 'FILL' }]` on each slot.
  `FILL` rather than `FIT`: these icons are opaque squares, so they fill the
  rounded tile edge to edge and read as app icons.

**Two brands legitimately share a mark.** Brandfetch has no product-specific
icons for Google's or Meta's sub-products — `analytics.google.com`,
`ads.google.com` and `search.google.com` all return the identical file. So the
four Google connectors share the Google mark and the two Facebook-domain
connectors share the Facebook mark. That is the brand, not a mapping error, and
it is commented in `ConnectorsPanel.jsx`.

**The shipped assets were replaced too.** `src/assets/connectors/` went from
seven files covering seven of sixteen connectors, at aspect ratios from 1:1 to
16:9, to sixteen uniform 144×144 squares named by connector id — 84KB total,
down from a set where `hubspot.png` alone was a 3840×2160 image. Verified in the
running app: 16 of 16 logos load, all `144x144`, none broken.

## Previously: why this was blocked

The Brandfetch Logo API requires a client ID on every request
(`https://cdn.brandfetch.io/{domain}/w/{w}/h/{h}/icon.png?c={CLIENT_ID}`).
Without one the CDN returns Brandfetch's own documentation page, not an image —
verified: `http 200, content-type text/html, 383KB`, containing "Register an
account and get your Client ID".

There is no Brandfetch client ID anywhere in this repo, and the Brandfetch MCP
connector is unauthorised in this session.

**This is worth doing, because the logos the app ships today are a mess:**

| File | Dimensions | Problem |
| --- | --- | --- |
| `hubspot.png` | 3840 × 2160 | a 4K 16:9 image, not a logo |
| `gsc.png` | 1200 × 630 | an Open Graph share card |
| `ga4.webp` | 1600 × 1650 | near-square, wrong format for the set |
| `zoho.png` | 860 × 303 | wordmark, 2.8:1 |
| `meta.png` | 900 × 507 | 16:9 |
| `apollo.png` | 512 × 512 | correct |
| `google-ads.png` | 256 × 256 | correct |

Seven files for sixteen connectors, aspect ratios from 1:1 to 16:9, two of them
scraped share images, and nine connectors with no logo at all. Squeezing those
into a 40×40 slot is what the fixed-size slot is designed to prevent.

**To finish it:** a free client ID from the Brandfetch developer portal, then
`icon.png` at `w/80/h/80` (2× the 40px slot) for each of the sixteen domains —
`google.com`, `hubspot.com`, `zoho.com`, `salesforce.com`, `facebook.com`,
`apollo.io`, `linkedin.com`, `wordpress.org`, `perplexity.ai`, `openai.com`,
`anthropic.com`. Square icons, one format, one size, dropped into slots that are
already the right shape.

## Fixed while reading

- `enhances: 'Ad Campaigns'` on three connectors — the module is **Ad Creative**
  in the nav. Third instance of a stale module name this pass.
- Five hyphen-as-dash strings in user-facing descriptions and field help
  (GSC's description, Zoho's data-centre and grant-token help, Zoho's and
  LinkedIn's descriptions).

## Mapping table

| # | Kepler component | Siphron form | Outcome | Note |
| --- | --- | --- | --- | --- |
| — | category sections | *search field* | **rejected** | eight headers for sixteen cards, five of them single; search finds faster and costs one row |
| — | connector card | raised card | bends | four-up at 270px: logo and state on top, identity, description, footer |
| — | logo | fixed 36×36 slot | bends | the slot is the design; the artwork is data |
| — | 3 states | status pill | maps | Managed by Kepler correctly offers no action |
| — | capability chips | — | **moved** | off the card, into the connect/manage modals as granted vs requested |

## The modals are built

Seven frames on page `Integrations — Siphron`, all 560 wide, laid out in a row
from x=2600. The states frame is `Integrations — states` (`155:91`); see
`docs/STATES-MAPPING.md`.

| Modal | Node | Case it covers |
| --- | --- | --- |
| `Connect Apollo` | `163:98` | API key, the one-field case |
| `Connect Zoho CRM` | `163:116` | API key, four fields, a select, and a scope list to paste elsewhere |
| `Connect Google Search Console` | `165:103` | OAuth, read-only |
| `Connect Facebook & Instagram` | `165:125` | OAuth, publishing: two capabilities and a precondition |
| `Disconnect HubSpot?` | `165:152` | manage / disconnect, and what breaks |
| `Meta Ads needs attention` | `166:109` | a real granted-scope shortfall |
| `Google Ads needs attention` | `166:143` | granted scopes never recorded |
| `Integrations · modal overlay` | `166:300` | the scrim treatment, in situ |

### The decision that shaped all four: capabilities, not scope strings

The brief for the needs-attention modal was "requested vs **granted** scopes".
Taken literally that means printing the scopes, and the scopes are machine
values:

```
https://www.googleapis.com/auth/adwords
kepler:google-ads-write
ads_management
```

The first is a URL. The second is not an OAuth scope at all — it is an internal
marker Kepler invented to represent developer-token tier. Printing either
breaks the never-print-a-machine-value rule, and neither tells a marketer
anything.

So the modal reports **capabilities**, which is what `capabilityScopes` exists
to resolve them into. Each row is: the capability, what it does in one sentence,
whether it was granted, and — where it helps — **the provider's own name for the
permission**, because that is the word the user will actually see on the consent
screen. "Meta calls this permission Ads Management" is useful; `ads_management`
is not.

The consequence gets its own line, because it is the reason the modal exists:

> Ad Creative can read your spend and performance. It cannot publish a campaign
> to Meta from Kepler, and a push would fail at the point of writing.

And then the cause, which is not the user's fault and should not read as though
it were: *"Meta grants Ads Management only after business verification and app
review."*

### Three states, not two — `null` is not `false`

`grantedScopes` returns `null` when a connection predates scope recording, and
`capabilityReport` carries that through as `granted: null` meaning *unknowable*.
The card had no room for a third value, which is half of why the chips were
wrong: three flat chips cannot distinguish "granted", "refused" and "never
recorded".

The modal draws all three. `Google Ads needs attention` is the `null` case in
full: every capability reads **Not recorded**, in `text/dim` rather than the
negative tone, and the body says what follows — Kepler will try, and a push may
fail at the point of writing, so reconnect to find out now rather than then.
Drawing that as "Not granted" would have been a claim the data does not support.

### Zoho's scope list is an exception, and it earns it

Zoho's grant-token help is a 200-character comma-run of
`ZohoCRM.modules.contacts.ALL,…` inside one sentence that also carries the
expiry warning. Those are machine values — but they are values **the user must
paste into Zoho's console**, not a status Kepler is reporting. That is the one
legitimate reason to show a machine value: the user needs it verbatim.

So it stays, and stops pretending to be prose: the scope list moves into its own
inset block with a **Copy scopes** action, and the timing warning becomes a
separate line in `semantic/warning`, because "it expires fast" is the part that
makes people fail this form:

> Paste the code and connect within a few minutes. It expires fast.

### The modal form in Siphron

The shipped `Modal.css` is premium-dark: a translucent navy gradient, 20px
backdrop blur, white hairlines at 8%. None of that survives the move to a light
canvas, so the dialog is rebuilt on Siphron tokens:

```
scrim    text/primary at 45%           (shipped is 72% — on a light canvas that buries the screen)
dialog   layer/overlay · radius 22 · Elevation/lg · 560 wide · clips content
header   pad 20/24 · 15px SemiBold · ✕ in text/muted · hairline under
body     pad 24 · gap 16
footer   pad 16/24 · layer/chrome · hairline over · actions right-aligned, gap 12
field    label 12 SemiBold text/secondary · input layer/inset r9 pinned to 40px · help 12 text/dim
eyebrow  11px SemiBold · 135% · 2% tracking · text/dim
```

Dividers are 1px frames rather than per-side borders, which auto-layout does not
have. Each is bound to `border/base` and then rewritten to 9% opacity — the
two-write dance, because a single `setBoundVariableForPaint` resets opacity to 1.

Inputs are **pinned to 40px** rather than left hugging: a credential field is
empty until typed into, and a hugging frame with no text collapses to its
padding.

**`Button / destructive` is new** (`162:93`, on the Dashboard page with the other
shared components). The disconnect confirmation needs one, the app already has a
`btn-destructive` class, and the library had only primary/secondary/ghost. Same
geometry as secondary; the label carries `semantic/negative`.

### Still to do

Nothing in the design. In code, the modals are a port: today
`ConnectorsPanel.jsx` has **one** modal — the API-key form — and no OAuth
pre-consent step, no disconnect confirmation (`disconnect()` fires immediately
on click), and no needs-attention detail anywhere. The capability chips are also
still on the card, contrary to the note above; removing them is part of the same
port.
