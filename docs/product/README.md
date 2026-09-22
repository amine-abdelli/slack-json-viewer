# Product: from viewer to business

Where Slack JSON Viewer could go as a paid product, and how to get there.
Written in September 2026. These are hypotheses to test, not decisions taken.

| Document | What it covers |
| --- | --- |
| [landscape.md](landscape.md) | Slack's rules for third-party apps, what each Slack plan can export, competitors and their prices — with sources |
| [ideas.md](ideas.md) | Ten product ideas, scored on value, legality, fit, effort and competition |
| [strategy.md](strategy.md) | The recommended positioning, first customer, product shape, pricing, what not to do, risks, decisions |
| [roadmap.md](roadmap.md) | Phases with validation steps, work mapped to the code, metrics and go/no-go gates |

## In one page

**The obvious SaaS is closed.** "Connect your Slack, we archive and search it"
is what Slack's 2025 API terms forbid to third parties: no persistent copies or
indexes of other organisations' data, no bulk export outside the Discovery API,
no export apps in the Marketplace, and 15 messages a minute for apps sold
outside it.

**The open door is the export customers already have.** Every Slack plan can
produce an official export ZIP. It is the customer's data, handed over by the
customer, and it is unreadable as it is. This project already turns Slack JSON
into a faithful, readable, portable record — in the browser, without the data
leaving the machine.

**First customer: people who must produce Slack conversations for someone
else** — employment lawyers, HR investigators, DPOs answering GDPR access
requests, small law firms. They pay (the visible competitor charges
$149–899 a month), they have deadlines, and the project's strengths —
fidelity and local-first processing — are their buying criteria.

**The product:** a free, open-source viewer for Slack exports, and paid
**evidence packs** — PDF, standalone HTML, source JSON and an integrity manifest
with reproducible hashes, with redaction, a GDPR access-request mode and RSMF
for review platforms. Then a one-off **workspace shutdown archive**, then other
chat sources (WhatsApp first).

**First step: validate before building** — fifteen interviews and a few
hand-made packs for real cases, while building the one thing every direction
needs: importing Slack's official export ZIP.

**What stays out of the hosted product:** the live Slack bridge (token/cookie,
QR sign-in with the server-side browser). It remains for personal and
self-hosted use.
