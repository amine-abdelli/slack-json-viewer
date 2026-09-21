# We Left Slack. Then Everyone Asked for Their Conversations Back.

### A weekend project that turns a Slack JSON dump into a single HTML file you can double-click.

---

The decision came down from the top: we were leaving Slack for another collaboration suite. Licenses cancelled at the end of the quarter. Migration guide in the wiki. Fine.

What nobody planned for was the second wave. Within two weeks, the workspace admins were drowning in the same request, worded a dozen different ways:

> "Can you get me the #incident-pricing channel before it goes away?"
>
> "I'm rolling off the project Friday — I need the DM where we agreed on the retry policy."
>
> "Legal wants the thread with the vendor."

Offboarding and platform migration turn out to be the same problem. Someone is leaving — a person, or a whole company — and the reasoning behind six months of decisions lives in a chat app they're about to lose access to.

## What an archive request actually gets you

You run `slackdump`, or you file a ticket with IT and wait. Either way, what lands in your inbox is this:

```json
{
  "channel_id": "C0AE23W6W0J",
  "name": "mpdm-alice--bob--carol-1",
  "messages": [
    { "user": "U09MJ41Q0RJ", "text": "ok on part sur ça", "ts": "1770708541.969069", "blocks": [ ... ] }
  ]
}
```

Technically, that is the archive. Practically, it's useless. Nobody on a handover call is going to read `U09MJ41Q0RJ` and remember it's the architect who left in March. Threads are flattened or nested depending on the export mode. Reactions are IDs. Code blocks are `rich_text` node trees.

The workarounds are all bad:

- **Print to PDF from the Slack app.** Threads collapse, search dies, and you need an active seat — which is precisely what you're losing.
- **Keep one Slack license "for history."** Now the migration has a permanent asterisk and a recurring line in the budget.
- **Paste it into a doc.** You lose the structure, which is the only reason the archive has evidentiary value at all.

So I built the boring missing piece.

## Drop the JSON, get the conversation back

The tool is a single-page Next.js app with no backend. You drag the JSON in, and it renders the conversation with Slack's own design system: aubergine sidebar, messages grouped by author in five-minute windows, day separators, reactions, link previews, mentions, code blocks, the `(edited)` marker. Full-text search with highlighting, and a per-author filter.

Then you hit **Export**, and you get one HTML file.

Not a folder with assets. One file. Double-click it three years from now, offline, on a laptop that never had Slack installed, and the search box still works, the author filter still works, thread panels still open, dark mode still toggles, and Cmd+P gives you something a lawyer can read.

The export is maybe the only clever part of the whole thing:

```tsx
const body = renderToStaticMarkup(
  <MessageList messages={messages} users={users} />
);

const css = [...document.styleSheets]
  .flatMap((sheet) => [...sheet.cssRules].map((r) => r.cssText))
  .join("\n");
```

The same React components that render the live app render the export, and the stylesheets the browser already parsed get inlined as text. The result is pixel-identical by construction, not by a second implementation I'd have to keep in sync. A small vanilla script gets inlined alongside for search, filtering and threads — no framework, no network, no CDN.

One trap worth knowing: thread replies show up twice in Slack exports. `slackdump_thread_replies[0]` is the root message again, and `replies[]` may carry it too. Deduplicate by `ts` or every thread starter appears three times in the archive you just handed to Legal.

## The user directory is the actual product

The rendering was a weekend. Making `U09MJ41Q0RJ` say "Marie Dupont" took longer.

The app accepts the columned `Name / ID / Email` dump from Slack admin exports, plus TSV, CSV, and the `users.json` from a full workspace export. Unresolved IDs get flagged in the UI instead of silently rendering as a raw ID, and you can name them by hand — the app even guesses from the `mpdm-alice--bob--carol-1` channel name. Everything persists in `localStorage`.

That last part sounds like a detail. It isn't. An archive where you can't tell who said what isn't an archive, it's a blob with timestamps.

## Where it ends up

Attached to the handover doc. Zipped into the offboarding folder. Emailed to the person who asked, who opens it without installing anything or asking for a seat on a platform we no longer pay for.

Migrations are always sold as a tooling change. They're really a memory problem. The chat app was never the deliverable — the reasoning inside it was.

---

*The viewer is 100% client-side: nothing is uploaded, no API routes, no database. If your org is mid-migration and you're fielding these requests, it deploys to Vercel with zero configuration.*
