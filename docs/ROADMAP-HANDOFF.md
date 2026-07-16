# KEPLER — Build Handoff: The Revenue-Engine Wedge (R1 → R3)

> **Status:** Committed direction, dev-ready. · **Date:** 12 Jul 2026 · **Owner:** Aditya
> **Companion docs:** [`PRODUCT.md`](PRODUCT.md) (system as built) · [`CONTEXT.md`](CONTEXT.md) (working conventions) · strategy one-pager artifact (premium-dark, shareable)
> **Prerequisite reading order for a new builder:** this doc → `PRODUCT.md` §2–6 → `CONTEXT.md` §2.

This document is self-contained: someone with the codebase and this file can build R1 without access to the strategy conversations that produced it. It records **what to build, why it's this and not something else, what "done" looks like, and where every piece lands in the existing architecture.**

---

## 1. The thesis (read this first)

**KEPLER is a revenue engine for lean go-to-market teams: it does the outreach follow-up a stretched team drops, and proves the meetings and deals that work produced.**

- **The buyer (v1)** is **"The Operator"** — the marketer-of-record for a lean startup or small agency. Stretched across every channel, judged on revenue by founders who don't care *how*. Wants leverage and proof. **Human-in-the-loop by design** — the Operator approves everything before it sends. KEPLER is a copilot, never an autonomous SDR.
- **The moat is NOT generation.** AI generation is a commodity in every channel (clonable in a weekend, increasingly spam-penalized). The two durable moats are:
  1. **The closed revenue loop** — joining `message → prospect → reply → meeting → deal → revenue` in one system.
  2. **Accumulated practitioner judgment** — outcome data (what got replies/meetings) feeding back into generation via the existing feedback-loop architecture.
- **Outreach is the first surface** not because outreach is special, but because it is the *only* channel where the revenue loop closes end-to-end today (send → reply → meeting → deal is fully observable). SEO/AEO's loop is blocked at the platform layer (AI engines expose no query/attribution data); social's is structurally broken (dark social).
- **The GTM asymmetry (bake this into every UX decision):** we **acquire on capacity** (the felt pain: "I can't keep up with follow-up") and **defend on proof** (the unfelt pain: "prove marketing's ROI" — the #1 documented pain in every flagship CMO survey). We never *sell* "attribution software" to this ICP — we do the work and quietly show one honest number.
- **Phase 2 (later):** the founder-facing self-serve "autopilot," powered by the judgment the operator cockpit accumulates. Not in this handoff's build scope, but every schema decision should avoid closing that door.

### One-paragraph positioning

> For lean GTM teams — and the operators who run them — judged on revenue but too stretched to follow up consistently or prove what worked, KEPLER does the follow-up and shows the meetings and deals it booked. Unlike copy generators, autonomous "AI SDRs" (which spam, and whose category publicly cracked — 11x/Artisan), or dashboards that stop at traffic, it closes the loop from message to money — human-in-the-loop, on the one channel where that loop actually closes.

---

## 2. How we got here — the evidence trail (compressed)

Full research lives in the strategy session (2026-07-12, five market streams + four spike streams + two code audits). The load-bearing findings:

| Finding | Evidence | Consequence |
|---|---|---|
| Generation is commodity everywhere | Defensibility scored 2/5 in SEO/AEO, social, AND outreach; LinkedIn cuts AI-post reach ~47%; Gmail flags AI phrasing ~2× | The product's heart cannot be "we generate content." Generation stays as the on-ramp; execution + proof is the product |
| Revenue proximity is the only channel differentiator | Outreach 5/5 (send→reply→meeting→deal observable); AEO 2/5 (platform-blocked); social 2.5/5 (dark social) | Outreach is the first surface for the loop |
| Follow-up is the sharpest capacity pain | Reps average 1.3 touches; 5+ needed; follow-up drives ~42% of replies | Cadence execution (E2) is the differentiated core, not initial-touch copy |
| Proving ROI is the market's #1 pain — but not this ICP's *felt* pain | #1 in CMO Survey (64%), HubSpot, CMI; but lean teams are time-poor, not attribution-hungry (ROI confidence fell 27%→18%) | Build measurement as the moat; never pitch it as the product. "One honest number," not dashboards |
| The AI-SDR category cracked publicly | 11x/Artisan: 50–80% churn, LinkedIn bans, "barely worked" | Position hard as human-in-the-loop copilot; approval gate is identity, not just safety |
| Cold email compliance tightened structurally | Google/Yahoo/Microsoft bulk-sender rules (spam complaints <0.3%, trending 0.1%; auth required; one-click unsub) | Deliverability spine (E6) is uncuttable for cold; it is also a trust differentiator |
| Cold/ABM is a required capability | Lean/new teams have no inbound to follow up on; warm-only serves nobody in the ICP | R1 must include a compliant cold path (scoped: orchestration on user-owned domains, not an ESP) |
| AEO timing is elite but its loop is blocked | Zero-click 60→68%; AI Overviews halve clicks; BUT citation churn 40–70%, no platform attribution data, sub-$100 tier crowding now | AEO **re-sequenced, not abandoned**: generation stays live; the visibility wedge is parked and plugs into the same loop later (`campaign_metrics.provider='aeo'` — migration 018 already sockets this) |
| Code audit: the built layers are the commodity layers | Generation strong; execution 0%; revenue loop ~10% (no deal/revenue concept anywhere in schema) | Switching cost from AEO-first ≈ 0; the moat is greenfield either way — so build the moat where it can close |

**Wedge-selection precedent** (Clay/enrichment, Apollo, HubSpot, Semrush): winners pick the narrowest workflow step with a countable unit of output inside an existing budget/habit — for us, **"one sequence → one meeting → one deal."**

---

## 3. Locked decisions (do not relitigate without new evidence)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Loop + outreach first; AEO visibility parked to R3** | §2. AEO generation modules remain untouched and shipped |
| D2 | **Practitioner cockpit before founder autopilot** | Operators feel the pain, teach the judgment layer, and are distribution into their founder-clients (1 operator ≈ 5 SMBs). Higher ACV/lower churn than direct SMB |
| D3 | **Human approval gate before any send** | Anti-AI-SDR positioning + safety. Enforced server-side, not just UI |
| D4 | **Send paths: CRM-native (warm) + user-owned dedicated cold domains (cold). Gmail = R2** | CRM send self-logs against the contact (makes the loop cheaper); cold never touches the primary domain; `gmail.send` is a *sensitive* Google scope (verification, weeks, **no CASA**) — Gmail **read** (reply detection) is restricted + CASA, so Gmail lands R2 with send-first sequencing |
| D5 | **We orchestrate sending; we are not an ESP** | Users connect their own dedicated domains/mailboxes; KEPLER owns orchestration, compliance enforcement, warmup ramps, suppression, logging |
| D6 | **Warm + cold both in R1; R1a/R1b split by capacity** | R1a = the channel-agnostic engine proven on warm (no deliverability spine needed). R1b = cold spine bolted on. **R1b is the true ICP launch gate** — warm-only is a demo for a no-inbound team |
| D7 | **MoSCoW prioritization, dependencies override scores** | Pre-launch = no reach data (RICE would launder guesses); the sequence is dependency-locked, so the real decision is the release *cut* |
| D8 | **Integration posture: feed into/out of CRMs; never compete with Clay/HubSpot on their turf** | Their blind spot we fill: outcome-driven follow-up orchestration + cross-platform proof for teams too small for RevOps |
| D9 | **Suppression/unsubscribe honored at send time, globally, permanently** | Legal + deliverability + trust. Single server-side choke point |
| D10 | **Revenue is the currency of every surface** | Buyers (founders) only care about money; channels ride underneath a revenue story. AEO/SEO/social are plumbing in the narrative, even when technically first-class |

## 4. Non-goals — deliberately NOT building

- **No autonomous sending** (no "AI decides and sends"). Approval gate always.
- **No ESP/shared sending infrastructure** — no shared IP pools, no sending from KEPLER-owned domains, no automated warmup *networks* (external warmup tools are the user's choice).
- **No attribution-as-a-product pitch**, no multi-touch attribution modeling UI. One honest number.
- **No social spike, no paid/retargeting in R1–R2** (retargeting audiences = R3+, fed *by* the loop).
- **No AEO visibility scanner in R1–R2** (R3; the socket exists — see §9.6).
- **No LinkedIn cold automation ever** (ban-risk; R3 LinkedIn = manual-assist tasks only).
- **No per-module JSON handling, no bespoke connector functions** — existing architecture rules stand (`CONTEXT.md` §2).

---

## 5. Codebase reality — what exists vs. what's greenfield

Verified by code audit 2026-07-12 (two independent passes). Trust this over older docs where they conflict.

### 5.1 Build on (exists, works)

| Asset | Where | Use for |
|---|---|---|
| Sequence generation (cold 5-touch + lifecycle skeletons, per-step validation, banned phrases, `{{tokens}}`) | `src/services/outreachService.js`, `src/lib/outreachSkeletons.js`, `src/lib/persuasionLayer.js` | E1's input. Drafting is done — do not rebuild |
| Connector adapter pattern (registry + uniform `validate/onConnect/push/fetch`) | `src/lib/connectors.js` + `supabase/functions/connector-proxy/index.ts` | Extend with `send` + deal `fetch` actions (§9.3) |
| OAuth families (Google, Meta) + LinkedIn/FB/IG publishing | `supabase/functions/oauth-proxy/index.ts` | Gmail (R2) joins the Google family; social publish already live |
| Zoho adapter (contact upsert + dated tasks), HubSpot, Apollo people-search | `connector-proxy` | Zoho = reference CRM for warm send + R2 deal read-back |
| Prospects (flat list: name/title/company/email/linkedin, `saved→pushed`) | `supabase/migrations/015_prospects.sql`, `src/services/prospectsService.js` | E7 imports into this; enrollment references it |
| UTM identity + campaign matching (id8 prefix) | `src/lib/tracking.js` | Loop joins; keep the id8 convention |
| GA4 pull + `campaign_metrics` snapshots (provider-shaped JSONB) | `src/services/measurementService.js`, migration `017` | E5 renders from here; new providers snapshot into the same table |
| AI gateway (rate-limited, JSON-repair centralized) | `ai-proxy` + `src/services/aiClient.js` | Any new AI call goes through `callAI`. Never add JSON handling per-module |
| Feedback loop (RatingControl + `getGuidance` prompt injection) | `generation_feedback`, `src/services/feedbackService.js` | §9.7 extends this with *outcome* signals |
| RLS/tenancy pattern (`is_workspace_member`, hidden credential columns, no client secrets) | migrations `001–002`, `013–014`, `src/lib/env.js` | Every new table copies this pattern exactly |
| Visibility scan schema + pure helpers (prompt gen, citation extraction, share-of-voice math) | migration `018`, `src/lib/visibility.js` | R3 scanner writes into this — schema already correct |

### 5.2 Greenfield (does not exist — verified absent)

- **Sending of any kind.** No SMTP, no email API calls anywhere. Outreach output today = clipboard copy + Zoho *tasks* (human reminders).
- **Cadence execution.** `dayOffset` is display-only. No scheduler, queue, or conditional branching.
- **Reply/bounce/unsubscribe detection.** No inbound handling of any kind.
- **Deal/revenue concepts.** No `deal`, `stage`, `closed-won`, or `amount` anywhere in schema or services. The measurement chain stops at GA4 session counts + CRM lead *counts*.
- **Deliverability infra.** No domain records, auth checks, warmup, caps, or suppression list.
- **The `visibility-scanner` edge function** (AEO): referenced in comments, never written. All AI-visibility providers `configured:false`; Measurement's share-of-voice tile renders labeled sample data.
- **Automated tests.** Zero in the repo. §12 makes the send path the beachhead for changing this.

### 5.3 Maturity snapshot

AEO stack ~58% (generation ~80%, visibility measurement ~0 live) · Outreach ~35% (drafting done; engine absent) · Measurement ~40% (channel counts ~60%; revenue loop ~10%).

---

## 6. End-state capability walkthroughs (what "done" feels like)

### End of R1a — "the engine, proven warm" *(internal/beta milestone)*
The Operator opens a workspace with Zoho connected. She generates a follow-up sequence for 30 warm contacts (existing leads that went quiet), reviews every step, edits touch 3, and hits **Approve & schedule**. Over the next two weeks KEPLER sends each touch through Zoho on schedule inside business hours — every send logged against the contact. Contact #7 replies after touch 2; their remaining touches cancel instantly and the reply surfaces in KEPLER flagged for her. A contact whose address hard-bounces is auto-suppressed and their steps stop. Nothing ever sent without her approval; she can pause the sequence at any moment.

### End of R1b — "compliant cold, end-to-end" *(the ICP launch gate)*
A new-company Operator with zero inbound connects `try-acme.com` (a dedicated domain she provisioned). KEPLER verifies SPF/DKIM/DMARC, shows fix-it instructions for the failing DMARC record, and blocks cold sending until all pass. She imports a 400-row ABM CSV; KEPLER validates and dedupes it — 38 rows quarantined (bad/missing emails), 12 merged as duplicates. She attaches the clean list to an approved cold sequence and sees a pre-launch summary (350 enrolled / 8 suppressed / 38 invalid) before confirming. Sends ramp under the warmup ceiling (day 1: 10, growing daily), every email carrying a working one-click unsubscribe + her business address. An unsubscribe lands on the global suppression list permanently — re-enrollment is blocked. Replies route to her; OOO auto-replies reschedule the next touch past the return date instead of stopping the cadence. She tags two replies as **Meeting booked**.

### End of R2 — "close the loop, prove the money"
Meetings are auto-classified from reply content (her manual tag remains as override). KEPLER reads Zoho Deals back (Amount/Stage/closed-won) and joins them through prospect → enrollment → message: the cockpit shows **"This month: 412 sends · 31 replies · 6 meetings · 2 deals · $14,500 attributed."** CRM-less workspaces get the same via KEPLER's native lightweight pipeline (a prospect can be dragged lead→meeting→won with an amount). Gmail mailbox send is live (sensitive-scope verification cleared); Gmail-read reply detection ships if/when CASA is cleared, else IMAP fallback. This number — meetings and money from the work — is the retention engine and the renewal argument.

### End of R3 — "widen and deepen, same loop"
The AEO visibility scanner (the parked wedge) goes live: scheduled runs ask buyer prompts across ChatGPT/Claude/Perplexity/AIO, write real `visibility_scans` rows, and snapshot share-of-voice into `campaign_metrics(provider='aeo')` — AEO becomes a measured channel *inside the same proof surface*, no new architecture. LinkedIn manual-assist touches join cadences (KEPLER drafts + schedules the task; the human sends — no automation). Retargeting audience export (loop → Google/Meta) begins. The accumulated outcome data (which copy/timing/personas produced meetings) starts powering the Phase-2 founder autopilot spec.

---

## 7. Release plan, gates, and definitions of done

```
R1a (warm engine)         R1b (cold spine)          R2 (the loop)              R3 (widen)
E1-warm → E2 → E3-min  →  E6 + E7 + E1-cold      →  E4 + E5 + E1-gmail      →  AEO scanner · LinkedIn assist
[internal/beta]           [ICP LAUNCH GATE]         + E3-meeting-classify      · autopilot spec · retargeting
```

**Dependency skeleton (overrides any scoring):** `E6 ─┐  E7 ─┼→ E1 → E2 → E3 → E4 → E5` (E6/E7 gate only the *cold* lane).

### R1a — MUSTs: E1-warm, E2, E3-min
**DoD:** one real workspace (our own agency book) runs a ≥3-touch warm sequence end-to-end via CRM-native send; reply cancels remaining touches; hard bounce auto-suppresses; every send/failure logged against contact + sequence + step; **provably zero sends without approval** (server-side test, not UI promise); pause works mid-flight.

### R1b — MUSTs: E6, E7, E1-cold · **launch gate**
**DoD:** ≥1 *external* operator completes the §6/R1b walkthrough unaided; domain auth gate blocks unverified cold send (test-proven); warmup ramp caps enforced; ≥100-row list imported/validated/deduped; unsubscribe is public, one-click (RFC 8058 `List-Unsubscribe` headers present), permanent; compliance validation blocks cold mail missing unsub link or physical address; bounce rate <5% and spam-complaint rate <0.1% on the first live campaign.

### R2 — E4, E5, E1-gmail, E3+
**DoD:** Zoho Deals read-back joins ≥1 real deal `message→prospect→meeting→deal→$`; native pipeline usable by a CRM-less workspace; cockpit "one honest number" renders from live data only (no sample data on this surface, ever); meeting auto-classification with human override; Gmail send live post-verification.
**Start immediately (long poles, external clocks):** Google sensitive-scope verification for `gmail.send` — file at R1a start. Decide Gmail-read (CASA) vs IMAP for reply detection during R1b (§10-O3).

### R3 — AEO scanner, LinkedIn assist, retargeting export, autopilot spec
**DoD (scanner):** scheduled runs write `status='ok'` rows with real answers; share-of-voice snapshots as `provider='aeo'`; sample-data tile deleted.

**Capacity rule:** tight capacity → ship R1a then R1b sequentially; ample → one R1. **Never** cut E6 scope while sending cold — that is not a smaller launch, it's a domain fire.

### Metrics
- **North star:** meetings booked per active workspace per month (R1) → revenue attributed per workspace (R2+).
- **Activation:** time-to-first-approved-send. **Retention proxy:** weekly cockpit views of the honest number. **Trust:** spam-complaint rate (<0.1%), bounce rate (<5%), zero suppression violations (a suppressed contact receiving mail = SEV-1 bug).

---

## 8. Epic specs & user stories

Persona in all stories: **The Operator** (§1). Stories are Mike Cohn + Gherkin, INVEST, thin vertical slices; the compliance/edge criteria are the point, not decoration. Effort: S/M/L. R1 stories are dev-ready; R2 stories are one grooming pass away.

### E1 · Send-path abstraction (L) — *R1a warm, R1b cold, R2 gmail*

**E1.1 — Send warm follow-ups through the connected CRM** *(R1a)*
As an Operator, I want to send approved follow-ups through my connected CRM (Zoho first), so that warm messages go from my system of record and log automatically.
- **Given** a connected, validated CRM and an approved sequence, **When** a scheduled step fires, **Then** the message sends via the CRM send API and a send record is written against that contact (enrollment, step, timestamp, provider message id).
- **Given** the CRM token is expired/revoked, **When** a step is due, **Then** the send **holds** (never drops, never bypasses) and the Operator is prompted to reconnect; sends resume on reconnect within cap.

**E1.2 — Review and approve before anything sends** *(R1a — the identity gate)*
As an Operator, I want to review a full sequence and explicitly approve it before it can send, so that nothing leaves without my sign-off.
- **Given** a drafted sequence, **When** viewed pre-approval, **Then** all send actions are disabled and status reads "Not approved."
- **When** I click *Approve & schedule*, **Then** steps queue and status flips to "Scheduled," recording approver + timestamp.
- **Given** an approved sequence, **When** I edit any step's content, **Then** approval is revoked and re-approval is required. *(Server-enforced: the scheduler refuses enrollments whose sequence isn't `approved` — see §9.5.)*

**E1.3 — Cold sends leave from a dedicated domain, never the primary** *(R1b)*
- **Given** a cold-mode sequence with no attached domain whose SPF/DKIM/DMARC all pass, **When** I try to approve for sending, **Then** approval is blocked with a specific fix-it message and nothing sends.

**E1.4 — Log every send against the contact** *(R1a — seeds the loop)*
- **Given** a step sends, **Then** a `messages` row is written (contact, enrollment, sequence, step, send path, domain, timestamp, provider id). **Given** a send fails, **Then** a failed row with reason is written — never a silent drop.

**E1.5 — Handle bounces and failures gracefully** *(R1a)*
- **Given** a hard bounce, **Then** the contact is flagged, their remaining steps stop, and the address joins suppression (`reason='hard_bounce'`). **Given** a transient failure, **Then** bounded retry with backoff, then mark failed and notify.

**E1.6 — Send via my Gmail mailbox** *(R2, post-verification)*
As an Operator without a CRM, I want warm sends from my own Gmail address, so that replies land in my real inbox and my identity stays consistent.
- **Given** Google OAuth with `gmail.send` granted, **When** a warm step fires, **Then** it sends via Gmail API within Google's per-account limits, logged as E1.4.

### E2 · Cadence + stop-on-reply (M) — *R1a*

**E2.1 — Auto-send timed follow-up touches**
- **Given** an approved multi-touch sequence and no stop condition, **When** a step's time arrives inside the send window (workspace-TZ business hours default), **Then** that touch sends and the next schedules from its `dayOffset`.
- **Given** a due send lands outside the window (weekend/holiday/night), **Then** it defers to the next window opening — never sends at 3am.

**E2.2 — Stop the cadence the instant a prospect replies**
- **Given** queued follow-ups, **When** a reply is detected (E3), **Then** remaining steps cancel (`stopped_reply`) and the contact is flagged for attention. **Given** the Operator manually marks "replied elsewhere" (e.g., a phone call), **Then** same outcome.

**E2.3 — Respect per-domain/per-mailbox send caps**
- **Given** queued sends exceeding a domain's current daily cap (warmup ramp or configured ceiling), **When** the cap is reached, **Then** overflow rolls to the next day within cap, oldest-first — never bursts over.

**E2.4 — Pause/resume a sequence safely**
- **Given** an active sequence, **When** paused, **Then** no further steps send; **When** resumed, **Then** scheduling recomputes from now (no "catch-up flood" of missed touches).

### E3 · Reply/unsub detection → auto-suppress (M–L) — *R1 min, R2 classify*

**E3.1 — Detect and route replies** *(R1)*
- **Given** a sent message, **When** the prospect replies, **Then** the reply is captured, linked to contact + enrollment + triggering message, surfaced in a KEPLER inbox view, and E2.2 fires. *(Mechanics per send path: CRM email-thread polling for CRM sends; IMAP polling for cold-domain mailboxes — §10-O2.)*

**E3.2 — Honor unsubscribe on every cold email** *(R1b)*
- **Given** every cold email carries a working one-click unsubscribe (public endpoint, signed token, no login), **When** a recipient unsubscribes, **Then** they join the workspace suppression list permanently and exit all active + future sequences. **Given** a suppressed contact, **When** anyone attempts (re-)enrollment or a send, **Then** blocked — at *send time*, not just enroll time.

**E3.3 — Handle OOO and bounces distinctly from real replies** *(R1)*
- **Given** an auto-reply classified out-of-office, **Then** the next touch reschedules past the detected return date (default +7d if unparseable) and the enrollment is *not* marked replied. **Given** a bounce notification, **Then** E1.5 flow, not the reply flow.

**E3.4 — Auto-classify "meeting booked"** *(R2)*
- **Given** a captured reply, **When** classified (via `ai-proxy`) as meeting-intent, **Then** the enrollment is marked `meeting` pending Operator confirm; manual tag always overrides. Precision > recall — false "meetings" corrupt the honest number.

### E6 · Deliverability + compliance spine (L) — *R1b, gates the cold lane*

**E6.1 — Connect and verify a dedicated sending domain**
- **Given** I add a domain, **When** KEPLER checks DNS, **Then** SPF/DKIM/DMARC each show pass/fail with copy-paste fix instructions; **Given** any fail, **Then** cold send from that domain stays blocked. Re-check on demand and every 24h (drift → auto-pause cold sends + alert).

**E6.2 — Warm up new domains on an enforced ramp**
- **Given** a newly verified domain, **Then** a ramp schedule applies (default: day 1 = 10/mailbox/day, +~20%/day to the 50–100 ceiling — constants configurable); **When** queued volume exceeds the day's ceiling, **Then** overflow defers (E2.3). Operator sees the ramp curve and current ceiling.

**E6.3 — Enforce suppression + compliance fields before every send**
- **Given** a send batch, **When** validated at send time, **Then** suppressed contacts are removed; **Given** a cold email missing an unsubscribe link OR the workspace has no physical business address on file, **Then** the batch is blocked with a specific error naming the missing field. Physical address is a required workspace/brand field before any cold approval.

**E6.4 — Deliverability health surface**
- **Given** live sending, **Then** per-domain bounce + complaint rates are visible; **Given** complaint rate crosses 0.1% or bounces 5%, **Then** cold sends auto-pause on that domain + alert. *(We enforce the thresholds Google/Yahoo enforce — before they do.)*

### E7 · ABM list intake (M) — *R1b*

**E7.1 — Import and clean a target list**
- **Given** a CSV or Apollo import, **When** processed, **Then** emails are syntax+MX validated; duplicates (in-file and vs existing prospects, by email + `external_id`) merge; rows missing email/company quarantine for review — never silently enroll. Import summary shows valid/merged/quarantined counts.

**E7.2 — Launch a cleaned list into an approved sequence**
- **Given** a validated list and an approved cold sequence, **When** attached, **Then** only non-suppressed valid contacts enroll, and a pre-launch summary (enrolled/suppressed/invalid counts + domain + ramp ceiling) requires confirmation before the first send.

### E4 · The closed revenue loop (L) — *R2*

**E4.1 — Read deals back from the CRM**
As an Operator, I want KEPLER to read my Zoho Deals (Amount, Stage, closed-won) and join them to the outreach that created them, so the money proves the work.
- **Given** a prospect pushed to CRM from KEPLER, **When** a deal on that contact reaches any stage, **Then** the deal links through prospect → enrollment → messages, and closed-won snapshots `{deals, revenue}` into `campaign_metrics(provider='crm')`.
- **Given** a deal on a contact KEPLER never touched, **Then** it lands in the unattributed bucket — the honest number never inflates.

**E4.2 — Native lightweight pipeline for CRM-less teams**
- **Given** no CRM connected, **When** I mark a meeting-stage prospect as an opportunity with an amount, **Then** a native deal (lead → meeting → proposal → won/lost) carries the same join chain and feeds the same snapshots. *(Same shape as E4.1 so E5 renders identically.)*

**E4.3 — The join spine is queryable**
- **Given** any closed-won deal, **Then** one query answers "which sequence, which step, which message started this" — the `messages` table is the spine (E1.4); no heuristic matching.

### E5 · The "one honest number" (S–M) — *R2*

**E5.1 — Cockpit proof tile**
- **Given** live data, **Then** Overview + Measurement show: sends → replies → meetings → deals → revenue attributed (this month, with trend), per workspace and per campaign. **Given** zero data, **Then** an honest empty state — never sample numbers on this surface.
- Leading-indicator slice (sends/replies/meetings) may ship late-R1 as a COULD once E3 flows — it proves "we book meetings" before the money joins.

---

## 9. System design guidance

Principles: reuse the existing patterns (`CONTEXT.md` §2); every new table is workspace-scoped + RLS'd exactly like migration 015; **the browser never sends email** — all sends flow through one server-side choke point, mirroring how `ai-proxy` is the single AI gateway.

### 9.1 New tables (migrations 022+; shapes indicative, not frozen)

| Table | Key columns | Notes |
|---|---|---|
| `sequences` | workspace_id, campaign_id?, name, channel `email`, mode `warm\|cold`, status `draft\|approved\|scheduled\|active\|paused\|archived`, steps JSONB `[{idx, dayOffset, subject, body, sendWindow?}]`, approved_by, approved_at, sending_domain_id? | Promotes today's `content_items(type='outreach')` payloads to first-class executable objects. Content edits reset status to `draft` (E1.2) |
| `enrollments` | workspace_id, sequence_id, prospect_id, status `active\|paused\|completed\|stopped_reply\|stopped_unsub\|stopped_bounce\|suppressed\|meeting`, current_step, next_send_at, stop_reason?, meeting_at? | One prospect × one sequence. `next_send_at` is the scheduler's work queue index |
| `messages` | workspace_id, enrollment_id, prospect_id, sequence_id, step_idx, send_path `crm_zoho\|crm_hubspot\|cold_domain\|gmail`, sending_domain_id?, provider_message_id, status `queued\|sent\|failed\|bounced`, error?, sent_at | **The join spine of the entire moat.** Get this right first |
| `replies` | workspace_id, prospect_id, enrollment_id?, message_id?, kind `reply\|ooo\|bounce\|unsub`, raw_snippet, classified `meeting\|interested\|negative\|auto` (R2), received_at | E3's landing zone |
| `suppression_list` | workspace_id, email (citext, unique per ws), reason `unsub\|hard_bounce\|complaint\|manual`, source_message_id?, created_at | Per-workspace (each workspace = a brand; suppression is brand-scoped). Checked at **send time** |
| `sending_domains` | workspace_id, domain, status `pending\|verified\|failed\|paused`, auth JSONB `{spf,dkim,dmarc:{pass,detail}}`, last_checked_at, warmup_started_at, daily_cap, sent_today, complaint_rate, bounce_rate | E6's backbone. Mailbox credentials go in `workspace_integrations` hidden columns (existing pattern), *not* here |
| `deals` *(R2)* | workspace_id, prospect_id, source `native\|zoho\|hubspot`, external_id?, name, amount, currency, stage `lead\|meeting\|proposal\|won\|lost`, closed_at | E4.2 native + E4.1 mirror rows share one shape |

### 9.2 New edge functions

| Function | Trigger | Responsibility |
|---|---|---|
| `send-scheduler` | pg_cron / scheduled invocation (e.g. every 5 min) | Pull due `enrollments` (`next_send_at <= now`, status `active`) → enforce **all invariants** (§9.5) → dispatch to the send adapter for the enrollment's send path → write `messages` → advance/schedule next step. Idempotent (safe re-run), batch-limited |
| `inbox-monitor` | scheduled | Poll reply sources (CRM threads for CRM sends; IMAP for cold mailboxes) → classify `reply\|ooo\|bounce` (deterministic headers first; `ai-proxy` assist for ambiguous, R2 for meeting-intent) → write `replies` → fire stop/reschedule/suppress transitions |
| `unsubscribe` | public HTTPS GET/POST (`verify_jwt=false` for this function only) | Validate signed token (HMAC over message_id+email with an edge secret) → write `suppression_list` → plain confirmation page. Also honor RFC 8058 one-click POST. No auth, no CORS dependency — it's a mail-client link |
| *(R3)* `visibility-scanner` | scheduled | Already fully specified by migration 018's comments + `src/lib/visibility.js` helpers: ask buyer prompts across surfaces with provisioned keys, write `status='ok'` rows, snapshot share-of-voice into `campaign_metrics(provider='aeo')` |

### 9.3 Adapter extensions (no bespoke functions — registry rules stand)

- `connector-proxy` Zoho adapter: add `send` (Zoho CRM v7 send-mail) and extend `fetch` with `deals` (R2: Deals module, Amount/Stage). HubSpot: add same interface; **validate plan-level send capability during R1a** (§10-O1).
- New connector type for cold mailboxes: SMTP/IMAP credentials as an API-key-style connector (user-supplied, validated live on connect, stored in hidden columns) — one adapter, N mailboxes.
- `oauth-proxy` Google family: add `gmail.send` scope + send action (R2). Keep scopes minimal — request **send only**; the read decision is O3.

### 9.4 Where generation meets execution

`outreachService.generateSequence` output → saved as `sequences(status='draft')`. The Approve flow (E1.2) is the only bridge from the generation world to the execution world. Existing validation (char limits, banned phrases, `{{token}}` extraction) runs at draft time **and** re-runs at send time (tokens must all be resolved from prospect fields, or the send blocks — never send `{{firstName}}` literally).

### 9.5 Invariant enforcement map (single choke point: `send-scheduler`)

| Invariant | Enforced at |
|---|---|
| No send without approval | `send-scheduler` refuses enrollments whose sequence ≠ `approved/active`; content-edit resets to draft (DB trigger or service) |
| Suppression honored | `send-scheduler` checks `suppression_list` per recipient **at send time**; enroll-time check is a courtesy, send-time check is the law |
| Cold requires verified domain | scheduler blocks `mode='cold'` unless `sending_domains.status='verified'` |
| Caps/warmup | scheduler's due-query is capped per domain per day (`sent_today < daily_cap`) |
| Unsub link + physical address on cold | send adapter injects `List-Unsubscribe` headers + footer at send time; validation blocks if brand address missing |
| Everything logged | adapter writes `messages` in the same transaction/flow as the send call; a send without a row is a bug class to test for |
| Health auto-pause | complaint >0.1% or bounce >5% flips domain to `paused` (E6.4) |

### 9.6 The AEO socket (so R3 is a plug-in, not a project)

Do not touch: migration 018 schema, `src/lib/visibility.js` pure helpers, the `campaign_metrics(provider='aeo')` convention, and the mock/stub/ok status discipline (mock is never snapshotted). R3 = provision provider keys as edge secrets + write `visibility-scanner` + delete Measurement's sample-data tile. Everything else in this handoff strengthens AEO's eventual story: by R3 the proof surface AEO plugs into already speaks revenue.

### 9.7 The judgment loop (moat #2 — cheap now, priceless later)

The existing feedback loop captures *human ratings*. The execution layer adds *outcome truth*: which step/copy/timing got replies and meetings. From day one, `messages` + `replies` give per-step reply rates for free. R2+: surface these in the Outreach module and feed summarized outcome guidance into `feedbackService.getGuidance('outreach')` alongside human notes ("step-3 breakup emails at day 9 outperform day 5 by …"). This accumulated, workspace-specific judgment is what the Phase-2 founder autopilot will run on — and why the data model must keep message-level granularity even where a rollup would do.

---

## 10. Open decisions for the builder (recommended defaults)

| # | Decision | Recommended default | Why / watch-out |
|---|---|---|---|
| O1 | HubSpot warm-send depth | Ship Zoho send first; validate HubSpot plan-gating during R1a, ship R1b/R2 | HubSpot "send as user" varies by plan (connected-inbox/single-send); don't let it block R1a |
| O2 | Cold reply detection mechanics | IMAP polling on the user's dedicated mailboxes | Provider-agnostic, no Google review. Note: Google app-passwords are being deprecated for many org types — prefer providers with stable IMAP (Zoho Mail, Fastmail) in onboarding guidance |
| O3 | R2 reply detection for Gmail sends | Decide during R1b: Gmail `readonly` (restricted scope → **CASA**) vs IMAP fallback | CASA is the heavy gate, not `gmail.send`. If IMAP suffices, skip CASA entirely in R2 |
| O4 | Scheduler transport | `pg_cron` → invoke edge function | Stays inside the existing Supabase-only architecture; no new infra |
| O5 | Email validation (MX/syntax) at import | In-house syntax + MX lookup for R1b; third-party verification API as a later connector | Don't add a paid dependency before launch; quarantine + bounce-containment covers the gap |
| O6 | Send windows/timezones | Workspace-TZ business hours default; per-sequence override later | Recipient-TZ inference is a refinement, not a gate |
| O7 | Suppression scope | Per-workspace | Workspace = brand = legal entity; revisit if operators demand cross-client suppression |
| O8 | Meeting detection precision bar (E3.4) | Suggest-then-confirm (never auto-confirm) | The honest number's integrity outranks automation convenience |

---

## 11. Risks & guardrails

1. **Domain burn is asymmetric and existential** for a small player — one bad campaign can poison a client's domain. Mitigations are *product*: E6 gates, auto-pause thresholds, ramp enforcement, dedicated-domain-only cold. Never soften these for a customer in a hurry.
2. **Category backlash:** "AI SDR" is a damaged phrase (11x/Artisan). Never market or build toward autonomy. The approval gate is positioning.
3. **Feature absorption:** HubSpot Breeze ships adjacent capability into its installed base. Our durable ground: cross-platform, outcome-learning follow-up + proof for teams too small for RevOps — deepen the loop and the judgment data, don't broaden into CRM.
4. **R1 scope creep:** the graceful degradation path is depth-within-epics (already cut: meeting auto-classify → R2, Gmail → R2, health dashboard → minimal). The R1a/R1b seam is the pressure valve. E6 never shrinks while cold sends.
5. **Compliance drift:** CAN-SPAM (US), GDPR/PECR (EU — B2B cold email is jurisdiction-sensitive; keep the lawful-basis note in onboarding), Google/Yahoo/Microsoft bulk rules. The spine (E6.3) enforces mechanics; onboarding copy must not promise legal cover.
6. **Fake proof kills the moat:** the honest number must never inflate (unattributed bucket exists for a reason; sample data banned on proof surfaces; meeting classification is confirm-gated). The first time an Operator catches the number lying, the product's entire defense evaporates.

## 12. Quality mandate

The repo has **zero automated tests** (named debt under the Kepler north star: acquisition-grade, no shortcuts). **The send path is where testing starts** — it moves money and legal risk. Minimum bar, R1a: unit tests for scheduler invariants (approval, suppression, caps, window deferral) + send-adapter contract tests with a mock provider + an integration test proving "no path sends without approval." R1b adds: domain-gate, ramp math, unsubscribe token round-trip, import validation/dedupe. CI already gates builds (`.github/workflows`); extend it to run tests. New UI follows the existing design system (`CONTEXT.md` §5) — premium-dark, reuse `Panel`/`RatingControl`/pill patterns.

## 13. Pointers

- **Strategy memory (cross-session):** `~/.claude/.../memory/discovery-revenue-engine-wedge.md` (full evidence trail + decisions), `aeo-wedge-roadmap.md` (superseded sequencing — this doc governs), `kepler-north-star.md`, `app-review-requirements.md` (scope/CASA specifics), `connector-architecture.md`, `measurement-attribution.md`, `feedback-learning-loop.md`.
- **Shareable one-pager:** strategy artifact "KEPLER — The Revenue-Engine Wedge" (claude.ai artifact, 12 Jul 2026).
- **This doc supersedes** §10 of `PRODUCT.md` (roadmap) and `CONTEXT.md` §7 where they conflict; update both when R1a ships.

---

*A plan, not a contract: release boundaries flex with capacity; the dependency skeleton, the invariants (§9.5), and the locked decisions (§3) do not.*
