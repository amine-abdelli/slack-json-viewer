# Loquarium for Slack — browser extension

Lets Loquarium import Slack conversations **with the Slack session already open
in the browser**. Nobody has to copy a token or open the developer tools: the
person is signed in to Slack in Chrome or Edge, clicks *Continue with Slack* in
Loquarium, picks a workspace, done.

## Install (until it is on the Chrome Web Store)

1. Download or clone the repository.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on
   **Developer mode**.
3. **Load unpacked** → pick this `extension/` folder.
4. Sign in to Slack at <https://app.slack.com> in the same browser.
5. In Loquarium: **Import → Continue with Slack**.

The unpacked extension's ID is fixed by the `key` in `manifest.json`:
`nfpimaeahmchnlbobgmpioiolegkpmld`. Loquarium looks for that ID by default.

## How it works

```
Loquarium page ──chrome.runtime.sendMessage──▶ extension service worker ──fetch──▶ slack.com/api
      ▲                                              │  (browser's Slack cookie,
      └──────────── Slack's JSON answer ◀────────────┘   client token read from
                                                         app.slack.com's storage)
```

- The Slack web client keeps each signed-in workspace, with its client token,
  in `localStorage["localConfig_v2"]` on app.slack.com. The worker reads it from
  an open Slack tab — or opens one in the background for a second and closes it.
- Loquarium asks for **one API request at a time**; the worker adds the token,
  sends it with the browser's `d` cookie, and returns Slack's answer. All the
  logic (pagination, threads, rate limits, names) runs in the page, shared with
  the server bridge (`lib/slack/api-core.ts`).

## What it can and cannot do

- **Tokens never leave the extension.** The page gets workspace names, IDs and
  domains only.
- **Read-only.** Only these methods are relayed: `auth.test`,
  `users.conversations`, `conversations.list`, `conversations.info`,
  `conversations.history`, `conversations.replies`, `users.info`. Anything else
  is refused.
- **Screenshots.** Since 0.2.0 it can also download one image attached to a
  message, for the copy Loquarium keeps: from Slack's file hosts only
  (`*.slack.com/files-…`), images only, at most 8 MB. After updating the
  folder, reload the extension in `chrome://extensions`.
- **Only listed sites can talk to it** (`externally_connectable` in
  `manifest.json`): `localhost`, `127.0.0.1` and the production domain. Chrome
  enforces the list; no other page can even see the extension.
- **Tokens are kept for the browser session only** (`chrome.storage.session`),
  and re-read from Slack when needed.
- Permissions: `scripting` (read `localConfig_v2` in a Slack tab), `storage`
  (the session cache), and `https://*.slack.com/*`.

## Deploying Loquarium on your own domain

1. Add it to `externally_connectable.matches` in `manifest.json`, e.g.
   `"https://loquarium.example.com/*"`. Chrome refuses wildcards on public
   suffixes such as `*.vercel.app`: list the exact domain.
2. Point the popup's *Open Loquarium* button at it (`loquariumUrl` in
   `config.js`).
3. Reload the extension.

## Publishing on the Chrome Web Store

The store assigns its own ID. Once published, set it in Loquarium's
environment:

```bash
NEXT_PUBLIC_LOQUARIUM_EXTENSION_ID=<store id>
```

and replace the *Install the extension* link in
`components/app/import-view.tsx` (`EXTENSION_HELP_URL`) with the store page.

## A word of caution

This uses Slack's **web client** token (`xoxc-`), not an official Slack app:
workspace admins do not see it as an installed integration, and Slack can
change how its web client stores sessions at any time. It is the same approach
as tools like slackdump — fine for reading your own conversations, not a
sanctioned integration. See `docs/product/landscape.md`.
