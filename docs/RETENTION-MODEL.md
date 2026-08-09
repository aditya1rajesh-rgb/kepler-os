# Kepler retention model — research

**Question:** what would make someone open Kepler tomorrow, and the week after?

**Method:** read the data model, the scheduled backend, and every state machine in
the app to find what changes *without the user acting* — because that, not screen
layout, is what creates a reason to return. Evidence is cited; where I'm inferring
about user behaviour rather than reading code, I say so.

**Headline finding:** Kepler already has a working background engine. Three jobs
run on cron today and produce real state changes. Almost none of that surfaces in
the UI, and one of them can silently stop a customer's outreach with no signal at
all. The retention problem is not "we need to build background activity" — it's
"the background activity we already have is invisible."

---

## 1. What already runs without the user

| Job | Cadence | What it changes | Evidence |
|---|---|---|---|
| `send-scheduler` | **every 5 min** | Due enrollments → sends; advances `enrollments.next_send_at` | `migrations/023` |
| `inbox-monitor` | **every 10 min** | Detects reply / OOO / bounce; sets `enrollments.status='stopped_reply'`, `messages.status='bounced'`; emits an `outreach.reply` event | `functions/inbox-monitor/index.ts:164-189` |
| `metrics-snapshot` | **daily 05:00** | Accrues `campaign_metrics` history | `migrations/028` |

So on any given morning the system may genuinely have: emails sent overnight,
replies waiting, bounces to clean up, and a fresh day of campaign metrics. **None
of this greets you.** The dashboard opens on aggregate KPIs; replies appear only
as a line in an activity feed, indistinguishable from "Search Console sync — 1,284
query rows."

`inbox-monitor` already writes a well-formed event (`kind: "outreach.reply"`,
`entity_type: "enrollment"`) — the plumbing for a real inbox exists and is unused.

## 2. What's manual that arguably shouldn't be

Two of the highest-signal loops only look when you ask them to:

- **Search Console** — `Pull latest` is user-triggered. The app therefore cannot
  say "you dropped off page 1 for *nirf 2026 parameters*", because it only knows
  what you last pulled.
- **Visibility scanner** (AEO) — user-triggered (`visibilityService.js:89`). No
  cron exists. So "a competitor started getting cited instead of you" is
  undetectable.

These two are the product's stated wedge (see `docs/SEO-AEO-REHAUL.md`). Both are
*detectors with no schedule*. A weekly cron on each turns them from things you
remember to check into things that tell you — which is the whole difference
between a tool and a service.

## 3. States that are waiting for a human, and are currently invisible

Every one of these exists in the schema today with nothing surfacing it:

| State | Meaning | Where |
|---|---|---|
| `enrollments.status='stopped_reply'` | **A prospect replied.** Highest-value event in the product. | `migrations/022` |
| `messages.status='bounced'` | Bad address, list decaying | `022` |
| `domains.status='pending'` | Sending domain unverified — nothing can send | `022` |
| `sequences.status` demoted to `'draft'` | **See §4 — silent stop** | `022:110-123` |
| campaign step `pending` with `scheduledDate` in the past | Overdue work | `migrations/012` |
| `content_items.status='generating'` | Possibly stuck mid-generation | `010` |
| `content_items.status='completed'`, never opened | Drafts nobody reviewed | `010` |
| `brand_field_suggestions` unactioned | The system learned something, awaiting your call | `019` |
| brand fields stale 90d+ | Model drifting from reality | `lib/brandHealth.js` |

That list *is* the "what needs me" surface. It requires no new data — only queries.

## 4. The silent-stop bug (highest priority finding)

`sequences_guard_approval` (`migrations/022:110-123`) demotes a sequence to
`draft` whenever its steps, mode, channel, or sending domain change while it is
`approved | scheduled | active | paused`.

The intent is right — edited copy must not send unreviewed. But `send-scheduler`
only processes active enrollments, so the practical effect is:

> You tweak one line of an email in a running sequence. Your outreach stops. Nothing
> tells you. You find out when you notice replies dried up.

For a lean GTM team whose pipeline depends on that sequence, this is a
trust-destroying failure — and trust is the thing retention is actually made of.
It needs an explicit "needs re-approval" state in the UI, not a silent status
change. **I'd fix this regardless of what we decide about the rest.**

## 5. The actual cadences

Mapping the loops to how often they can *produce something new*:

**Daily** — replies, bounces, sends going out, campaign metrics, overdue steps.
Only outreach genuinely earns a daily open, and only while a sequence is running.

**Weekly** — search performance movement, AEO visibility, opportunities worth
actioning, content review, campaign step progress. **This is Kepler's natural
rhythm**, and today nothing schedules or summarises it.

**Monthly/episodic** — brand model refresh, new campaign planning, batch content
generation, competitor teardowns.

*(Inference, not code: I'm reading cadence off what the data can change, not off
observed usage. If you have real session data, it would sharpen or overturn
this — flagged as an open question below.)*

The strategic read: **generation is episodic, so it can't be the return-driver.**
You generate a batch of blogs and you're done for a week. What recurs is
*outcomes* — replies landing, rankings moving, competitors moving. Kepler is
currently architected as a generation tool with measurement bolted on; the
retention surface has to be built on the outcome side.

## 6. What to build, ranked by value ÷ effort

1. **Fix the silent stop.** An explicit "needs re-approval" state + a signal. Days,
   not weeks. Pure trust.
2. **A "needs you" surface.** Queries over §3 — replies, overdue steps, unverified
   domains, unreviewed drafts, proposed learnings. No schema work. This is the
   thing you open the app *for*.
3. **Put the detectors on a schedule.** Weekly cron for Search Console and the
   visibility scanner, writing events on *change* ("position dropped", "competitor
   now cited"). Reuses the existing `pg_cron → pg_net → edge` transport from `023`.
4. **Give the jobs memory.** Page teardown, mention finder, opportunities, Apollo
   searches and bulk research runs currently produce a result and forget it. Retain
   runs, and each becomes a place you return to rather than a form you refill.
   Biggest build; also where "deepen the functionality" lives.
5. **Make the learning legible.** `generation_feedback` + `brand_field_suggestions`
   already accumulate. "Here's what Kepler learned about your voice this month" is
   compounding value made visible — the strongest long-run retention argument, and
   the one thing a competitor can't copy by shipping the same features.

Items 1–3 are mostly wiring over data that already exists. Item 4 is the real
product work.

## 7. What I could not determine

- **Whether anyone actually re-runs these jobs.** No analytics in the repo. If a
  page teardown is genuinely one-and-done, giving it history is wasted effort.
- **Real session cadence.** §5 is derived from the data model, not behaviour.
- **Whether notifications are wanted at all** (email/Slack digest vs in-app only).
  It changes the design significantly and it's a product call.
- **How many workspaces have a sequence actually running.** If most are pre-send,
  the daily loop is theoretical today and the weekly loop is the whole game.

## Open questions

1. Do you have any usage data — even rough (DAU/WAU, which modules get opened)? It
   would confirm or kill §5.
2. Is an out-of-app nudge (email/Slack digest) in scope, or in-app only?
3. Is the current customer base mostly pre-send or actually running sequences?
   This decides whether we design for the daily loop or the weekly one.
