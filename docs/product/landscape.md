# Landscape: the rules, the market, the competition

*Research as of September 2026. Every figure below comes from a source listed
at the end; re-check before relying on it — Slack changed its rules twice in
2025.*

This is the ground the product ideas stand on. The short version: **the naive
SaaS — "connect your Slack, we archive and search it for you" — is exactly what
Slack's terms now forbid to third parties.** The value has to be built on paths
Slack still allows.

---

## 1. What Slack allows a third-party product to do

### API terms (effective 10 October 2025)

Three provisions decide most of the strategy:

| Provision | What it says | Consequence |
| --- | --- | --- |
| **No persistent copies** | Third-party apps may handle, cache or store other organisations' API data only "to the extent it is essential for the immediate operation" of the app, and may not create "persistent copies, archives, indexes, or long-term data stores" of it. | A hosted archive or search index fed by the Slack API is out. |
| **No bulk export** | No bulk export of message and file data, "except where expressly allowed by an additional agreement, such as … the Discovery API for approved security and compliance use cases". | Bulk export is reserved to approved compliance partners. |
| **Commercial distribution needs authorisation** | Any app where "users could pay fees" must be authorised — typically through the Slack Marketplace or a partner agreement. | No selling an unlisted app that talks to other people's workspaces. |
| **No LLM training** | Apps offered to outside users cannot "use API Data to train a large language model". | AI features cannot train on API data; inference is a separate question to check. |

### Rate limits for non-Marketplace apps (since 29 May 2025)

`conversations.history` and `conversations.replies` — the two methods a
conversation export lives on — are limited to **1 request per minute and 15
messages per request** for commercially distributed apps outside the
Marketplace (new apps and new installations since 29 May 2025).

**Exempt:** internal, customer-built apps (they keep 50+ requests per minute and
1 000 objects per request), and Marketplace-approved apps.

At 15 messages a minute, a 10 000-message channel takes about 11 hours. An
export product cannot run under these limits.

### Slack Marketplace

The Marketplace guidelines list apps that "export or backup message data" as
**unsuitable: they will not be approved**. The Marketplace also requires at
least 10 active workspaces and 10 weekly active users, a privacy policy stating
how long data is kept, and a support page. App names should read "X for Slack",
not "Slack X".

### What this leaves open

| Route | Status |
| --- | --- |
| Hosted archive or search built on the Slack API | ❌ Forbidden (persistent copies, bulk export) |
| Marketplace app that exports conversations | ❌ Category refused |
| Unlisted paid app that reads other workspaces | ❌ Needs authorisation, and throttled to 15 messages a minute |
| Discovery API (Enterprise Grid, compliance) | ⚠️ Partner programme only; built for large eDiscovery vendors |
| **Customer-built internal app** (the customer creates and owns the Slack app) | ⚠️ Normal limits; whether software *sold* to run as a customer's internal app counts as "customer-built" must be checked with Slack or a lawyer |
| **Files the customer exports themselves** (Slack's own export ZIP) | ✅ Not API data: the customer's own data, handed over by the customer |
| **Local-first processing** (the browser or a desktop app, no vendor server) | ✅ The vendor never holds the data |

The current app's sign-in paths — a client token and cookie copied from the
browser, or the QR code with a live server-side browser — are fine for
personal use and a self-hosted tool. They are **not** a sanctioned integration:
workspace admins cannot see or revoke them, and Slack can break them at any
time. A paid, hosted product cannot be built on them — and asking customers to
type corporate SSO passwords into a vendor-hosted browser would fail any
security review.

---

## 2. What Slack's own plans give customers

### History limits on the free plan

- Messages and files are visible and searchable for **90 days**.
- Since **26 August 2024**, content older than **one year is permanently
  deleted**, on a rolling basis.

### Export by plan (Slack's own export tool, a ZIP of JSON)

| Plan | What an owner can export |
| --- | --- |
| Free | Public channels only; file links for the last 90 days |
| Pro | Public channels only; full file-link history |
| Business+ | Public channels, and — on application, approved by the Primary Owner — private channels and DMs; **scheduled recurring exports** |
| Enterprise Grid | Everything, with filters by type, member or workspace; Discovery API |

So the raw material for a file-based product exists on every plan, and on
Business+ it can arrive on a schedule. What it lacks is readability: a ZIP of
day-by-day JSON files per channel, with user IDs instead of names and threads
scattered across days.

### Price pressure

Slack's paid plans are priced per user. Pro sits at roughly **$7.25–8.75 per
user per month** depending on source and billing (a Q4 2025 increase is
reported), and Business+ at **$12.50–15**. For a 50-person team keeping history
means several hundred dollars a month — hence tools positioned as "stay on
Free, keep your history elsewhere".

---

## 3. Competition

| Player | What it does | Price (public) | Notes |
| --- | --- | --- | --- |
| **ViewExport** | Upload Slack (and O365) exports; search, review, export for eDiscovery, audits, DSARs | Small Business **$149/mo** (1 active file, 2 GB); Professional **$499/mo**; Enterprise **$899/mo**; **Desktop $399 one-time** | Proves legal/HR buyers pay. Desktop edition exists for "data governance or contractual restrictions" — demand for not uploading data. |
| **Backupery for Slack** | Desktop backup and conversion of Slack data | Perpetual licences, Standard/Pro | Desktop, backup-oriented |
| **Thread Archive** | Free backup, export and search tool | Free | Free-plan retention angle |
| **Enterprise eDiscovery** — Hanzo, Smarsh, Mimecast Aware, Global Relay, Onna, Microsoft Purview, Pagefreezer | Collection, legal hold, review for large organisations, usually via the Discovery API | Enterprise; ViewExport cites Onna's median contract at **~$180k/yr** | Out of reach for SMBs and small law firms |
| **Slackdump, slack-export-viewer** | Open-source CLI export and viewing | Free | Technical users only |
| **Linen.dev** | Made Slack and Discord communities Google-searchable (YC) | — | Shows the "public community archive" idea; now an open-source Slack alternative |

**Industry format:** **RSMF** (Relativity Short Message Format) is the
eDiscovery standard for chat data, supported by Relativity and most review
platforms. Exporting RSMF is what lets a legal product plug into the tools law
firms already use.

---

## 4. What this project already has

These are the assets any direction below builds on:

- **Faithful rendering** — Slack's look, threads, reactions, attachments, rich
  text, edits, day dividers, grouping. Most competitors show a generic chat or
  a table.
- **Standalone HTML export** — one file, offline, searchable, with threads and
  author filter. Unusual in this market, and exactly what a recipient without
  Slack needs.
- **Local-first by construction** — dropped files never leave the browser.
  That is a selling point for legal and HR buyers, not just a technical detail.
- **Five languages** — matters in EU legal and HR markets.
- A **Slack bridge** that works for personal and self-hosted use. It cannot be
  the basis of a hosted SaaS (see §1).

What is missing for any paid direction: importing Slack's **official export
ZIP** (several channels, day files, `users.json`) — today the viewer reads one
conversation at a time.

---

## Sources

- [Slack API Terms of Service](https://slack.com/terms-of-service/api) — effective 10 Oct 2025
- [Slack API Terms of Service updates (changelog)](https://docs.slack.dev/changelog/2025/10/13/api-terms-update/)
- [Rate limit changes for non-Marketplace apps](https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps/) and [clarification](https://docs.slack.dev/changelog/2025/06/03/rate-limits-clarity/)
- [Slack rate limits](https://docs.slack.dev/apis/web-api/rate-limits/)
- [Slack Marketplace app guidelines and requirements](https://docs.slack.dev/slack-marketplace/slack-marketplace-app-guidelines-and-requirements/)
- [Computerworld — Salesforce changes Slack API terms to block bulk data access for LLMs](https://www.computerworld.com/article/4005509/salesforce-changes-slack-api-terms-to-block-bulk-data-access-for-llms.html)
- [Slack — Usage limits for free workspaces](https://slack.com/help/articles/115002422943-Usage-limits-for-free-workspaces)
- [Slack — Export your workspace data](https://slack.com/help/articles/201658943-Export-your-workspace-data)
- [Slack — A guide to Slack's Discovery APIs](https://slack.com/help/articles/360002079527-A-guide-to-Slacks-Discovery-APIs)
- [Slack's Real-Time Search API and MCP server](https://slack.com/blog/news/mcp-real-time-search-api-now-available)
- [ViewExport pricing](https://viewexport.com/pricing) and [comparison](https://viewexport.com/compare)
- [ViewExport — Slack free plan limits](https://viewexport.com/post/slack-free-plan-limitations)
- [Backupery for Slack](https://www.backupery.com/products/backupery-for-slack/)
- [Thread Archive](https://threadarchive.com/free-slack-backup-tool-export-history)
- [Hanzo — Slack eDiscovery guide 2026](https://hanzo.co/faq/the-2026-guide-to-slack-ediscovery-all-you-need-to-know-to-collect-preserve-and-review-slack-data/)
- [Relativity — Short Message Format (RSMF)](https://help.relativity.com/RelativityOne/Content/System_Guides/Relativity_Short_Message_Format/Relativity_short_message_format.htm)
- [Y Combinator — Linen.dev](https://www.ycombinator.com/launches/GiF-linen-dev-make-your-slack-and-discord-communities-google-searchable)
- [PricePulse — Slack pricing 2026](https://www.getpricepulse.com/blog/slack-pricing-2026-complete-guide.html) and [ViewExport — Slack pricing 2026](https://viewexport.com/post/slack-pricing)
