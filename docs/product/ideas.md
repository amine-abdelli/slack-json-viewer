# Ideas

Candidate products and features, each judged on who pays, why, whether Slack's
rules allow it, and how much of it already exists. The constraints are in
[landscape.md](landscape.md); the choice among these ideas is in
[strategy.md](strategy.md).

The thread running through the strongest ideas:

> **A Slack conversation as a record** — faithful, readable by anyone,
> portable, and trustworthy — built from data the customer already holds,
> processed where the customer wants it.

---

## Scoring

Each idea is scored 1–5. Higher is better on every axis — for *effort* and
*competition*, 5 means little effort and little competition.

| # | Idea | Pain × willingness to pay | Allowed by Slack | Fit with what exists | Effort | Competition | **Total** |
| --- | --- | :-: | :-: | :-: | :-: | :-: | :-: |
| A | Evidence packs for legal and HR | 5 | 5 | 5 | 3 | 3 | **21** |
| B | GDPR access-request (DSAR) responder | 5 | 5 | 4 | 3 | 3 | **20** |
| C | Continuous archive for free-plan teams | 3 | 5 | 4 | 3 | 2 | **17** |
| F | Workspace shutdown / migration archive | 3 | 5 | 5 | 4 | 4 | **21** |
| D | Public community archive (SEO) | 2 | 4 | 4 | 3 | 4 | **17** |
| E | Share a conversation outside Slack | 3 | 4 | 5 | 4 | 3 | **19** |
| G | AI over your own export | 4 | 3 | 3 | 3 | 2 | **15** |
| I | Self-hosted enterprise edition (live bridge) | 3 | 2 | 5 | 4 | 3 | **17** |
| M | Other chat sources (WhatsApp, Teams, Discord) | 4 | 5 | 3 | 2 | 3 | **17** |
| H | Incident post-mortem timelines | 2 | 5 | 4 | 4 | 1 | **16** |
| X | Hosted archive fed by the Slack API | 4 | **1** | 4 | 3 | 2 | ruled out |

---

## A. Evidence packs for legal, HR and investigations

**Who.** Employment lawyers, small law firms, HR investigators, in-house legal
at SMBs, forensic and eDiscovery consultants, bailiffs (*commissaires de
justice* in France) who certify digital content.

**Job.** "Produce a readable, faithful and defensible record of what was said
in these Slack conversations, for a file, a court, a tribunal or an internal
investigation."

**Today.** Screenshots, which are incomplete and easy to contest; raw JSON,
which no one can read; or enterprise eDiscovery at $150–900 a month and up,
often needing Enterprise Grid.

**The product.** Open the customer's official Slack export ZIP, select
channels, people and a date range, and produce a pack:

- a **PDF** with page numbers and optional Bates numbering, threads shown in
  place, edits marked, the time zone stated;
- the **standalone HTML** the app already makes — clickable, searchable;
- the **source JSON** of every included message, untouched;
- an **integrity manifest**: SHA-256 of the source ZIP and of every output, the
  tool version, the filters applied, the processing time;
- optional **redaction** of names, e-mails and phone numbers of third parties;
- optional **RSMF** for review platforms (Relativity and others).

**Why it can win.** Rendering fidelity is this project's strength, and in a
dispute the context is the point: who replied to what, in which thread, with
which reaction. **Local-first** is the other edge: the export never leaves the
lawyer's machine, so there is no vendor to vet, no data-processing agreement, no
hosting jurisdiction to argue about. ViewExport sells a $399 desktop edition
for exactly that reason.

**Allowed.** Yes: the customer's own export, processed by the customer.

**Pricing to test.** Per pack (€49–149) for occasional users; a subscription
(€99–299 a month) for firms and consultants.

**Watch out.** Never promise admissibility: say *integrity manifest*, not
*court-certified*. Admissibility depends on the jurisdiction — validate the
format with practising lawyers before selling it.

---

## B. GDPR access-request (DSAR) responder

**Who.** HR, DPOs and legal teams at EU companies on Slack.

**Job.** An employee or ex-employee asks for their personal data (GDPR
Article 15). The company has a month to answer, and Slack is part of it:
messages written by the person, about the person, mentioning them.

**The product.** From an export: find everything by, mentioning or
DM-ing a person; review; redact third parties; produce a pack (as in A) with a
cover index. Everything local.

**Why it can win.** A legal obligation with a deadline is the best reason to
pay; it recurs at every departure that turns sour. It shares 80 % of its code
with A.

**Watch out.** Private channels and DMs are only in Business+ (on approval) and
Enterprise Grid exports. Free and Pro customers can only cover public channels —
say so in the product.

---

## C. Continuous archive for free-plan teams

**Who.** Startups, associations, clubs, small agencies staying on Slack Free.

**Job.** "Don't lose what we wrote more than 90 days ago — and never what is
older than a year, which Slack now deletes."

**The product.** Drop each export (monthly, or scheduled on Business+); the app
merges them into one continuous, de-duplicated archive with search, channel
navigation and names resolved. Local (browser storage, desktop) or hosted.

**Allowed.** Yes when fed by uploaded exports. Not when fed by the API (see X).

**Why it's harder.** Price-sensitive buyers, free competitors (Thread Archive),
and the export is manual on Free and Pro — people forget. Reminders help; the
merge engine is the real work.

**Pricing to test.** €5–15 a month flat per workspace — the pitch is "cheaper
than Pro per seat".

---

## D. Public community archive

**Who.** Open-source projects, developer communities, meetup groups that run on
Slack.

**Job.** Make years of answered questions findable on Google, and keep them when
the community moves off Slack.

**The product.** Publish selected public channels from an export as a static
site: one page per thread, clean URLs, search, SEO metadata. Hosted, or built as
static files the community deploys themselves.

**Watch out.** Members wrote in a closed space: publishing needs a notice, an
opt-out and anonymisation tools. Linen.dev did this with funding and pivoted —
a signal on how much communities pay.

---

## E. Share a conversation outside Slack

**Who.** Agencies and consultants sending a decision thread to a client;
engineers attaching a discussion to a ticket; managers briefing an auditor.

**The product.** What the app does today — a conversation as one standalone,
clickable file — plus **hosted share links**: password, expiry, branding,
access log, revocation.

**Allowed.** From a file the user uploads, yes. As a Slack app with a "share
this thread" shortcut, no: the Marketplace refuses export apps.

**Role.** A free-tier hook and a viral loop (every shared page shows where it
came from) more than a business by itself.

---

## F. Workspace shutdown and migration archive

**Who.** Companies closing a workspace: moving to Teams or Google Chat, after a
merger, winding down a project or a company.

**Job.** "Keep a readable, searchable copy of everything, forever, without
paying Slack."

**The product.** One official export in, one self-contained archive out: an
offline site (HTML plus a search index) for a shared drive, or a hosted
read-only archive. Optionally, conversion to the import format of the
destination (Mattermost bulk import, for instance).

**Why it can win.** A one-off, painful moment with a budget attached — pricing
per workspace, once (€99–499). The offline site is an extension of the existing
standalone export.

---

## G. AI over your own export

**What.** Summaries of long threads, a decision log, a timeline, questions
answered from the archive, relevance tagging for reviewers (A/B).

**Allowed.** The API terms forbid *training* on API data; running a model on a
file the customer uploaded is governed by their own terms and consent. Keep it
opt-in, per document, with a bring-your-own-key or local-model option, and no
training.

**Role.** A premium add-on to A, B, C — not a product by itself: the market is
crowded, and Slack sells its own AI.

---

## I. Self-hosted enterprise edition

**What.** The current app — live API bridge, QR sign-in with the live browser,
per-session isolation — packaged for a large organisation to run on its own
infrastructure, connected through a Slack app the customer creates in its own
workspace (from a manifest supplied with the product).

**Why interesting.** Normal rate limits for internal apps, and data that never
leaves the company. That is what large companies with strict governance want.

**Open question.** Whether software *sold* to run as a customer's internal app
counts as "customer-built" under Slack's terms. Ask Slack or a lawyer before
selling it. Replace the token/cookie and QR paths with the customer's own
OAuth app in this edition.

---

## M. Other chat sources

**What.** The same record-making for WhatsApp exports, Microsoft Teams, Discord,
Google Chat.

**Why.** In employment disputes, WhatsApp is at least as common as Slack. A
legal buyer wants one tool for all chat evidence. Every new source multiplies
the market of A and B.

**When.** After A proves out on Slack. The architecture should be ready for it:
one internal message model, one importer per source.

---

## H. Incident post-mortem timelines

Turn an incident channel into a timeline for a post-mortem document. Useful,
but incident tools (incident.io, FireHydrant, PagerDuty) already do this inside
Slack. A feature of the viewer, not a product.

---

## X. Ruled out: hosted archive fed by the Slack API

"Connect Slack with OAuth, we back up and index everything" is the obvious SaaS
and the one Slack closed in 2025: no persistent copies or indexes of other
organisations' data, no bulk export outside the Discovery API, export apps
refused by the Marketplace, and 15 messages a minute for unlisted apps. Building
it would mean building on a platform that has said no.

---

## Small features worth having whatever the direction

- Import of the **official export ZIP** — multiple channels, day files,
  `users.json`, `channels.json`. The prerequisite for A, B, C, D, F.
- **Virtualised message list** and a **search index in a web worker**, for
  exports with hundreds of thousands of messages.
- **Date range, people and channel filters** that drive what gets exported.
- **Explicit time zone** in every output.
- **Permalinks** to a message inside the standalone HTML.
- **PDF output** with page numbers.
- **Attachments**: exports hold links, not files — embedding them is a
  premium feature to investigate.
