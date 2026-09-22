# Slack JSON Viewer

Reads a Slack conversation JSON export back in Slack's own interface, then
exports it as a **self-contained HTML page** you open with a double-click,
offline.

Everything happens in the browser: no file is ever sent to a server, no API
route, no database.

## Preparing the sources

Extract the sources with `slackdump`, then unzip the archive to get the
conversation's JSON file:

```bash
slackdump dump https://<workspace-name>.slack.com/archives/C0AE23W6W0J
```

To get the user list — which is what turns Slack IDs (`U09MJ41Q0RJ`) into
readable names:

```bash
slackdump list users
```

The command writes a **text** file `users-<WORKSPACE_ID>.txt` (for example
`users-T4R6RCZFA.txt`); load it into the viewer as is.

## Features

- **Loading** by drag and drop or through the file picker.
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
- **Full-text search** with highlighting, plus an **author filter**.
- **Light / dark theme** (Slack palettes).
- **Self-contained HTML export**: a single file, CSS and JS included, that
  keeps search, the author filter, the theme, and a printable layout.

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

A **`.txt`** file: the column output of `slackdump list users`, columns aligned
with spaces, header row included (it is ignored).

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

## Deploying on Vercel

The project is a fully static Next.js 16 app (App Router), so no configuration
is needed.

```bash
npm i -g vercel
vercel          # preview
vercel --prod   # production
```

Or through the web UI: *New Project* → import the Git repository → Vercel
detects Next.js and deploys with no extra setup.

## Stack

- Next.js 16 (App Router, Turbopack), React 19
- Tailwind CSS v4 + shadcn/ui (Radix), lucide-react
- `react-dom/server.browser` for the export: the downloaded page is rendered by
  **the same components** as the app, with the app's stylesheet inlined — so the
  exported file is pixel-for-pixel identical.
