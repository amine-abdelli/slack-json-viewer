# Strategy

What to build first, for whom, how to charge for it, and what not to do. The
reasoning behind it is in [landscape.md](landscape.md) and
[ideas.md](ideas.md); the execution in [roadmap.md](roadmap.md).

---

## 1. The constraint that decides everything

Since 2025, a third party may not keep copies, archives or indexes of other
organisations' Slack data fetched through the API, may not bulk-export it, and
cannot get an export app into the Marketplace. The obvious SaaS — *connect your
Slack, we archive it* — is closed.

What stays open is **the data customers already hold**: Slack's own export
ZIP, which every plan can produce, and which Slack's API terms do not govern
because it never goes through a third-party app. So the product is not a Slack
integration. It is a **tool for Slack exports** — and, later, for chat exports
in general.

---

## 2. Positioning

> **Turn Slack exports into records people can read, share and rely on —
> without handing your data to anyone.**

Three promises, each backed by something that already exists in the code:

1. **Faithful** — the conversation looks as it did in Slack: threads in place,
   reactions, edits, attachments, who replied to whom. Not a spreadsheet of
   messages.
2. **Portable** — one file that opens anywhere, offline, for someone who has
   never used Slack: a lawyer, a judge, a client, an auditor.
3. **Private by design** — processing happens in the browser. The vendor never
   receives the conversations. The open-source core lets a security team check
   that claim instead of trusting it.

---

## 3. Beachhead: legal and HR records

**First customer:** people who must *produce* Slack conversations for someone
else, under a deadline, with consequences — employment lawyers, HR
investigators, DPOs answering access requests, small law firms, forensic
consultants. Ideas A (evidence packs) and B (DSAR responder) from
[ideas.md](ideas.md), built as one product.

**Why them first:**

- **They pay.** The one visible competitor charges $149–899 a month and $399
  for a desktop edition. Enterprise eDiscovery costs tens of thousands a year.
- **The pain is sharp and dated.** A hearing, a GDPR deadline, an internal
  investigation — not "someday I should back up Slack".
- **Our strengths are their criteria.** Fidelity is context, context is the
  case. Local-first removes the vendor-risk review that slows every legal
  purchase.
- **It is allowed.** The customer's own export, on the customer's machine.
- **It extends naturally** to WhatsApp, Teams and Discord evidence — the same
  buyers, a bigger market (idea M).

**Starting market: France, then the EU.** Employment disputes, GDPR access
requests, a French-speaking founder, a product already in five languages. EU
buyers also value "your data never leaves your machine" more than most.

**Second, cheaper win:** the **workspace shutdown archive** (idea F) — the same
engine producing an offline site from a full export, sold once per workspace.
Little extra code, an obvious buyer at an obvious moment.

**Not first:** free-plan archiving (idea C) — price-sensitive and served by
free tools — and public community archives (idea D). Both can come later on the
same import engine.

---

## 4. Product shape

| Layer | What | Where it runs |
| --- | --- | --- |
| **Viewer (free, open source)** | Open a conversation or a full export, read, search, export one conversation as standalone HTML | Browser |
| **Records (paid)** | Selections across channels, people and dates; evidence packs (PDF, HTML, JSON, integrity manifest); redaction; DSAR mode; RSMF; shutdown archive | Browser — unlocked by a licence key |
| **Account (minimal backend)** | Licence keys, payments, optional hosted share links | Server — never receives conversations unless the user chooses to host a share link |
| **Self-hosted edition (later)** | Today's live Slack bridge, for a company running it on its own infrastructure | Customer's servers |

**Open core.** The viewer stays open source: it is the trust argument, the
acquisition channel (people search for "slack export viewer"), and a proof that
nothing leaves the browser. Paid features live in a separate module.

**Deterministic outputs.** The same export and the same selection always
produce byte-identical files and the same hashes. The other side can re-run the
tool and check. That is worth more to a lawyer than any "certified" badge.

---

## 5. Pricing (hypotheses to test)

| Offer | Price | For |
| --- | --- | --- |
| **Free** | €0 | Reading exports, one standalone HTML at a time |
| **Single pack** | €79 per pack | The occasional case — one dispute, one DSAR |
| **Pro** | €29 per user per month | HR, DPOs, independent consultants: unlimited packs, PDF, redaction, DSAR mode |
| **Firm** | €149 per month, up to 5 users | Law firms: RSMF, saved matters, processing log, priority support |
| **Shutdown archive** | €149 once per workspace | Workspaces closing or migrating |
| **Self-hosted** | from €5 000 per year | Large organisations — only once the legal question is settled (§7) |

Deliberately below ViewExport's entry price, with more usage (no 1-file or
2 GB cap), because we carry no hosting cost.

Payments through a **merchant of record** (Paddle, Lemon Squeezy or similar):
they handle EU VAT and invoicing, which matters for a small company selling
across the EU.

---

## 6. Acquisition

- **Search.** People type "slack export viewer", "open slack export json",
  "read slack export", "export slack conversation pdf", and in French
  "exporter une conversation Slack", "preuve Slack prud'hommes", "demande
  d'accès RGPD Slack". The free viewer is the landing page; one guide per
  question.
- **Direct outreach in France.** Employment lawyers, HR networks, DPO
  associations, commissaires de justice who certify digital content — through
  LinkedIn and professional events.
- **Open source.** GitHub presence, a "Show HN", a listing among Slack export
  tools.
- **Shared files.** Every standalone HTML and pack carries a discreet "Made
  with…" link. Every recipient is a potential user.

---

## 7. What we will not do

- **No hosted archive or index fed by the Slack API.** Slack's terms forbid it
  (see [landscape.md](landscape.md)).
- **No token/cookie scraping or remote-browser sign-in in the hosted product.**
  They are unsanctioned, invisible to workspace admins, and asking for
  corporate SSO passwords in a vendor-hosted browser fails any security review.
  They stay in the self-hosted and personal editions only.
- **No training of models on customer conversations.**
- **No "export your employer's Slack before you leave" marketing.** Personal
  exfiltration of company data is a legal and ethical trap, and would poison
  the legal and HR buyers we want.
- **No "court-certified" claims.** Integrity manifest and reproducibility, yes;
  admissibility is for courts and lawyers.

---

## 8. Moat

Honest assessment: none of this is impossible to copy. What compounds:

1. **Fidelity** across many edge cases (threads, huddles, bots, edits,
   attachments, deleted users) — slow to get right, visible in every output.
2. **Trust** — open-source core, local processing, reproducible hashes.
3. **Formats and sources** — RSMF, PDF with Bates numbering, WhatsApp, Teams,
   Discord. Each one is weeks of work for a competitor.
4. **Distribution in a niche** — being *the* tool French and EU employment
   lawyers and DPOs know for chat evidence.

---

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| Slack changes its export format | One importer module with fixtures from real exports; tests per format version |
| Slack improves native export or eDiscovery for smaller plans | Stay multi-source (WhatsApp, Teams): no single platform can make us irrelevant |
| Legal buyers want certifications (SOC 2, ISO 27001) | Local-first narrows the scope — we host nothing sensitive. Document the architecture and publish the code |
| Admissibility questioned | Validate the format with lawyers before launch; state the method, not a guarantee |
| Competitors cut prices | Our marginal cost is near zero: we can stay under them |
| "Slack" in the product name | Slack's guidelines: "X for Slack", never "Slack X". Pick a brand name that stands without Slack (sources will multiply) |
| Founder bandwidth | Validation before building (roadmap, phase 1); one beachhead at a time |
| Intellectual property | Make sure the code and idea are yours to sell (employment and client contracts, time and equipment used). Remove company-specific references from the code |
| Legal structure | Selling software licences needs a structure that can invoice products. Check yours before the first sale |

---

## 10. Decisions to take

1. **Confirm the beachhead** — legal and HR records (recommended) vs free-plan
   archive.
2. **Name** — a brand not built on "Slack".
3. **Licence of the open core** — MIT (maximum reach) or AGPL (competitors
   cannot fork it into a closed hosted product).
4. **Company and payments** — legal structure, merchant of record.
5. **The self-hosted edition** — ask Slack (or a lawyer) whether software sold
   to run as a customer's internal app is "customer-built" under the API terms,
   before investing in it.
