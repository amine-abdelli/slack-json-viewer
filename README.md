# Slack JSON Viewer

Reads a Slack conversation JSON export back in Slack's own interface, then
exports it as a **self-contained HTML page** you open with a double-click,
offline.

Reading and exporting happen entirely in the browser: no conversation is ever
sent to a third party, and no database is involved. The app can also fetch the
conversations for you, straight from the Slack Web API — see
[Connecting to Slack](#connecting-to-slack).

## Connecting to Slack

**Import → Continue with Slack**: the app signs in to your workspace, lists
your conversations, and imports the ones you tick — with their participants'
names — into the library. Everything runs on the [Slack Web
API](https://api.slack.com/methods) — no `slackdump`, no CLI, no archive to
unzip.

### Signing in

**Browser extension — recommended.** Install the Loquarium extension in Chrome
or Edge (see [`extension/README.md`](extension/README.md)), sign in to Slack
at `app.slack.com` in the same browser, then **Continue with Slack**: the
workspaces signed in to the browser show up as cards. Nothing to copy, no
password to type, and the messages go straight from Slack to the page — no
server in between, so it works on any host, Vercel included.

The fallback below sits under **Other ways to connect**.

**Token and cookie** — works anywhere, needs nothing installed:

1. Open Slack in a browser (`app.slack.com`), signed in to the workspace.
2. Developer tools → **Network**, then reload.
3. Click any request to `/api/…` → **Payload** → copy the `token` value
   (starts with `xoxc-`).
4. **Application** → **Cookies** → copy the `d` cookie value (starts with
   `xoxd-`).

The credentials are checked against `auth.test` immediately, so a bad paste is
reported at once rather than at the first real request.

Once signed in, the workspace appears as a card under **Connected
workspaces**: one click goes straight to its channels. The sign-in form is then
folded away behind **Connect another workspace**, so it only shows up when you
actually want a second workspace.

### What it fetches

| Step | Slack method | Why not the obvious one |
| --- | --- | --- |
| Your conversations | `users.conversations` | `conversations.list` walks every channel in the workspace — thousands, on a large one |
| A conversation | `conversations.history` + `conversations.replies` | history returns thread roots only; each thread costs one more call |
| Its members | `conversations.members` | skipped above 500 members: a crowd, not a list worth showing |
| Participants' names | `users.info` on the IDs in the dump | `users.list` walks tens of thousands of accounts for the few dozen involved |

The channel list defaults to **the conversations you are a member of**; untick
the box to browse everything visible, which is slow by nature.

The search field above it filters by **name** (`general`, `#general`) or by
**ID** (`C0AE23W6W0J`, or any part of it), and also accepts a pasted Slack link
(`https://acme.slack.com/archives/C0AE23W6W0J`). Each row shows its ID, exact ID
matches come first, then names that start with the query. A counter shows how
many channels match; the list renders the first 400.

Names are resolved *after* the dump: the panel collects the IDs actually
present — message authors, thread repliers, reaction voters, `<@…>` mentions,
bots — and resolves exactly those, eight requests in flight. Unknown or
deactivated accounts are skipped rather than failing the batch.

Only IDs never seen before are asked for: people already in the directory —
deactivated accounts included, since they no longer change — are skipped, and
so are the IDs Slack answered `user_not_found` for (bots, people from another
organisation), remembered per workspace in the browser for 30 days. A second
import of the same channels usually makes no `users.info` call at all.

Slack's rate limiting is honoured: the first `429` pauses every request of that
kind for the delay Slack asks for — announced once, "resuming in N s" — and
progress is streamed to the panel throughout. History and threads are read 999
messages a page, the most Slack serves, so a long conversation costs five times
fewer requests than at the usual 200.

**Updating a conversation already imported** — ticked again in the picker,
where it shows as *Imported* — refetches the history (cheap, and how edits and
reactions come through) but only the threads that changed since: a thread
whose `reply_count` and `latest_reply` are the same as in the stored copy keeps
its replies from the library. On a busy channel with hundreds of threads, an
update takes a handful of requests instead of hundreds. Edits or reactions on
replies in an otherwise untouched thread are not picked up by an update.

If a conversation comes back with no messages at all, that is reported as an
error rather than loaded as a blank page: on Enterprise Grid a token is tied to
one workspace, so a conversation listed by `users.conversations` is not always
one `conversations.history` will serve.

Several conversations are imported one after another, each saved as soon as it
arrives. One that fails pauses the import with **Retry** / **Skip and
continue**. Imported conversations stay in the library: reopening one fetches
nothing.

### Credentials

They never reach the page. Each workspace is one httpOnly cookie in **your own
browser**, holding the token and `d` cookie encrypted with AES-256-GCM under a
key derived from `SLACK_VIEWER_SECRET`. The server keeps nothing between
requests — no database, no files — so it runs on any stateless host, and no
visitor can ever reach another's workspace. The log-out icon clears the cookie.

### Running it

```bash
npm install
npm run dev        # or: npm run build && npm start
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `SLACK_VIEWER_SECRET` | a key made at each build | encrypts the credential cookies (16+ characters) — set it, or each new deployment signs everyone out |
| `SLACK_VIEWER_SESSION_TTL_HOURS` | `12` | how long a token sign-in lasts |
| `NEXT_PUBLIC_LOQUARIUM_EXTENSION_ID` | the unpacked extension's ID | the browser extension to talk to (set it once it is on the Chrome Web Store) |
| `SLACK_API_BASE` | `https://slack.com/api` | point the API elsewhere, for tests |
| `SLACK_FILES_ORIGIN` | — | fetch Slack files from another origin, for tests |

## Features

- **Import** straight from Slack — several conversations at once — (see
  [Connecting to Slack](#connecting-to-slack)), or open / drop `.json` files.
- **Library** kept in the browser (IndexedDB): archives per workspace,
  recently opened conversations, nothing sent to a server.
- **Screenshots kept**: the images attached to messages are downloaded with the
  conversation (Slack's thumbnail up to 1024 px — legible, a fraction of the
  original's weight), shown in the messages, enlarged on click, and embedded in
  the exported HTML page. Other attachments stay a card with a link to Slack.
  An update only downloads the new ones. Untick *Import screenshots* to skip them.
- **Who is in a conversation**: the sidebar lists the *participants* — those
  who wrote, with their message count (click one to filter) — then those who
  only *reacted or were mentioned*. Slack's member list is stored at import
  (up to 500) but not shown.
- **Large conversations stay fluid**: a conversation opens on its latest 150
  messages, and older ones are added as you scroll up (or with the button at
  the top). Search and the author filter still cover the whole conversation.
- **Faithful rendering**: messages grouped by author
  (5-minute window), day separators, reactions, link previews, file
  attachments, mentions, lists, quotes, code blocks, `(edited)`.
- **Full `rich_text` block rendering** (sections, lists, quotes, preformatted,
  links, `@user` / `#channel` / `@here` mentions, emoji), falling back to
  `mrkdwn` when a message has no blocks.
- **User directory**: maps Slack IDs (`U09MJ41Q0RJ`) to a name and an email.
  Unresolved IDs are flagged and can be named by hand (with a suggestion
  derived from the `mpdm-…` channel name). The directory and the manual names
  are remembered in the browser.
- **Threads**: a reply bar under each thread root, opening the replies in a
  side panel, as in Slack.
- **Full-text search** with highlighting, plus an **author filter**. A thread
  is found by any of its messages.
- **Light / dark theme** (Loquarium tokens, see `docs/design/`).
- **Five languages** — French, English, Spanish, Chinese and Russian — picked
  from the browser's language, English for any other, and switchable from the
  language menu. The exported page is written in the language on screen.
- **Export**, from the header menu, either way:
  - **a self-contained HTML page** — a single file, CSS and JS included, that
    opens on the latest messages (an arrow goes back to the top) and keeps
    search, the author filter, the theme, and a printable layout;
  - **the conversation as JSON** — the raw data, indented, and reloadable by
    this viewer.

## Accepted formats

### Conversation (required)

```jsonc
{
  "channel_id": "C0AE23W6W0J",
  "name": "mpdm-alice--bob--carol-1",
  "messages": [
    {
      "client_msg_id": "…",
      "type": "message",
      "user": "U09MJ41Q0RJ",
      "text": "Hello",
      "ts": "1770708541.969069",
      "blocks": [/* rich_text */],
      "reactions": [{ "name": "+1", "count": 1, "users": ["UCR66AFS4"] }],
      "attachments": [/* link previews */],
      "edited": { "user": "…", "ts": "…" }
    }
  ]
}
```

A bare array of messages is accepted too.

### Directory (optional)

A **`.txt`** file with space-aligned columns, header row included (it is
ignored) — the shape `slackdump list users` and similar tools produce.

```
Name                   ID           Bot?  Email                          Deleted?  Restricted?
alice_martin           U09MJ41Q0RJ        alice.martin@example.com
bob.durand             UCR66AFS4          bob.durand@example.com
bot_deploy             U03J6FZM55F        bot.deploy@rpa.example.com
```

Only two columns matter: the **ID** (the cell that looks like `U…` / `W…` /
`B…`) and the **email** (the cell containing an `@`); the rest of the row
supplies the display name. Empty columns (`Bot?`, `Deleted?`, `Restricted?`)
and rows without an ID are ignored.

Also recognized: TSV, CSV, and the `users.json` of a full Slack export.

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
```

How the pieces fit together — the viewer, the bridge, the `run` protocol,
credentials, the browser extension — is described in
[docs/architecture.md](docs/architecture.md). Where the project could go as a
product — market, ideas, strategy, roadmap — is in [docs/product/](docs/product/README.md).

## Deploying

The viewer, the extension path and the token sign-in need only network access,
so any Next.js host works — Vercel included. List the production domain in the
extension's `externally_connectable` (see [`extension/README.md`](extension/README.md)).

```bash
npm i -g vercel
vercel          # preview
vercel --prod   # production
```

Set `SLACK_VIEWER_SECRET` in the project's environment variables, so that a
new deployment does not sign everyone out. Imports run
as serverless functions limited to 300 s; the extension path does not go
through the server at all.

## Stack

- Next.js 16 (App Router, Turbopack), React 19
- Tailwind CSS v4 + shadcn/ui (Radix), lucide-react
- `react-dom/server.browser` for the export: the downloaded page is rendered by
  **the same components** as the app, with the app's stylesheet inlined — so the
  exported file is pixel-for-pixel identical.
