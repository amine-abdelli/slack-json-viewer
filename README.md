# Slack JSON Viewer

Reads a Slack conversation JSON export back in Slack's own interface, then
exports it as a **self-contained HTML page** you open with a double-click,
offline.

Reading and exporting happen entirely in the browser: no conversation is ever
sent to a third party, and no database is involved. The app can also fetch the
conversations for you, straight from the Slack Web API — see
[Connecting to Slack](#connecting-to-slack).

## Connecting to Slack

The home screen offers **Connecter**: the app signs in to your workspace, lists
your conversations, and loads one with its participants' names in a couple of
clicks. Everything runs on the [Slack Web
API](https://api.slack.com/methods) — no `slackdump`, no CLI, no archive to
unzip.

### Signing in

**Token and cookie** — works anywhere, needs nothing installed:

1. Open Slack in a browser (`app.slack.com`), signed in to the workspace.
2. Developer tools → **Network**, then reload.
3. Click any request to `/api/…` → **Payload** → copy the `token` value
   (starts with `xoxc-`).
4. **Application** → **Cookies** → copy the `d` cookie value (starts with
   `xoxd-`).

The credentials are checked against `auth.test` immediately, so a bad paste is
reported at once rather than at the first real request.

**QR code** — shorter, when it works. The code *is* the credential: it encodes
a one-shot sign-in link. Nothing is scanned with a phone: the helper decodes
the link and consumes it in a browser it drives itself, on the server. In a signed-in Slack client: click the **workspace name**
(not the logo) → **Sign in on mobile** → right-click the QR code → **Copy Image
URL**, then paste. The link expires within a minute and is single-use, so copy
a fresh one per attempt.

On a workspace behind SSO, Slack then sends that browser to your company's
sign-in page. The panel shows it live: click and type straight into the picture
to authenticate, and the sign-in completes by itself once Slack sets its
session cookie.

This tab only appears where the helper is available, or can be built because
Go is installed — it is the one part that needs a browser, and therefore the
container image. See [The QR helper](#the-qr-helper).

Once signed in, the workspace appears at the top of the panel under
**Déjà connecté**: one click on its card goes straight to its channels. The
sign-in form is then folded away behind **Connecter un autre espace de
travail**, so it only shows up when you actually want a second workspace.

### What it fetches

| Step | Slack method | Why not the obvious one |
| --- | --- | --- |
| Your conversations | `users.conversations` | `conversations.list` walks every channel in the workspace — thousands, on a large one |
| A conversation | `conversations.history` + `conversations.replies` | history returns thread roots only; each thread costs one more call |
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

Slack's rate limiting is honoured: a `429` is retried after the delay Slack
asks for, and progress is streamed to the panel throughout.

If a conversation comes back with no messages at all, that is reported as an
error rather than loaded as a blank page: on Enterprise Grid a token is tied to
one workspace, so a conversation listed by `users.conversations` is not always
one `conversations.history` will serve.

Once a conversation is open, the back arrow at the left of the header — or the
browser's own back button — returns to the channel list as you left it, filter
included; nothing is fetched again. Without the bridge, both close the
conversation and return to the home screen.

### Credentials

They never reach the front end. They are stored encrypted with AES-256-GCM
under a key derived from your session cookie, so the file is useless to another
session and to anyone holding only the volume — and unlike an in-memory cache,
it survives a restart. The workspace then shows up as *Déjà connecté* on later
visits; the log-out icon deletes the stored credentials.

On a shared instance each visitor gets an opaque session id in an httpOnly
cookie and a directory of its own, so no one can reach anyone else's workspace.
Sessions untouched for the TTL are swept.

### Running it

The token path needs only network access, so a plain `npm run build && npm
start` — or a Vercel deployment — is enough.

The container image adds the QR helper, Chromium and a virtual display:

```bash
docker compose up --build
```

Or without compose:

```bash
docker build -t slack-viewer .
docker run -p 3000:3000 -v slack-viewer-data:/data --shm-size=512m \
  -e SLACK_VIEWER_SECRET=$(openssl rand -hex 32) slack-viewer
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `SLACK_VIEWER_SECRET` | random per boot | binds stored credentials to a session cookie — **set it**, or a restart signs everyone out |
| `SLACK_VIEWER_DATA_DIR` | `/data` in the image | where sessions are kept |
| `SLACK_VIEWER_SESSION_TTL_HOURS` | `12` | how long an idle session keeps its credentials |
| `SLACK_VIEWER_MAX_LOGINS` | `2` | concurrent QR logins; each starts a Chromium |
| `SLACK_VIEWER_QRAUTH_BIN` | found on `PATH` | override the QR helper |
| `CHROME_BIN` | auto-detected | override the browser the QR login drives |
| `SLACK_API_BASE` | `https://slack.com/api` | point the API elsewhere, for tests |

Give the container a real `/dev/shm` (`--shm-size=512m`); Chromium crashes on
the 64 MB default.

### The QR helper

`tools/qrauth` is a small Go program, the one piece that is not pure API: it
decodes the QR code, opens the sign-in link in a browser it drives with
[rod](https://github.com/go-rod/rod), waits for the session `d` cookie — which
Slack sets the moment the link is consumed — and reads the API token off
`/ssb/redirect`.

It deliberately does not use `slackauth.QRAuth`, which instead waits for the
whole Slack web client to boot and then intercepts an `api.features` request:
that depends on an interstitial being dismissed and a heavy SPA loading, and it
hangs indefinitely when either does not happen. While it waits, the helper
reports the page the browser is actually on, and on failure writes a screenshot
of it.

The helper launches a *headful* browser by default, so the container runs an
`Xvfb` display; the app user also gets a writable `$HOME`, which Chromium needs
for its crashpad and XDG directories. Outside Docker on a headless Linux box,
run it under `xvfb-run`, or set `QRAUTH_HEADLESS=1`. On macOS a window opens
briefly — that is normal.

To build it ahead of time (it is compiled on first use otherwise, if Go is
present):

```bash
npm run build:qrauth
```

## Features

- **Loading** by drag and drop, through the file picker, or straight from
  Slack (see [Connecting to Slack](#connecting-to-slack)).
- **Slack design system**: aubergine sidebar, messages grouped by author
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
- **Light / dark theme** (Slack palettes).
- **Five languages** — French, English, Spanish, Chinese and Russian — picked
  from the browser's language, English for any other, and switchable from the
  language menu. The exported page is written in the language on screen.
- **Export**, from the header menu, either way:
  - **a self-contained HTML page** — a single file, CSS and JS included, that
    keeps search, the author filter, the theme, and a printable layout;
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
sessions and credentials, the QR helper — is described in
[docs/architecture.md](docs/architecture.md).

## Deploying

The viewer and the token sign-in need only network access, so any Next.js host
works — Vercel included:

```bash
npm i -g vercel
vercel          # preview
vercel --prod   # production
```

The QR sign-in is the exception: it drives a real browser, so it needs the
container image (see [Running it](#running-it)). Where the helper is absent the
panel simply hides that tab.

## Stack

- Next.js 16 (App Router, Turbopack), React 19
- Tailwind CSS v4 + shadcn/ui (Radix), lucide-react
- `react-dom/server.browser` for the export: the downloaded page is rendered by
  **the same components** as the app, with the app's stylesheet inlined — so the
  exported file is pixel-for-pixel identical.
