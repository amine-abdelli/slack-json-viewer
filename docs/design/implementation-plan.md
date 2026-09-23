# Loquarium UI — implementation plan

The mock-ups in `claude-design-ui-mockups-project/` (Claude Design export) are
the target. This plan moves the app there in phases that each ship on their
own, without rewriting what already works.

## What is kept as is

| Area | Files | Why |
| --- | --- | --- |
| Parsing and normalisation | `lib/slack/parse.ts`, `users.ts`, `emoji.ts`, `types.ts` | Format-agnostic, tested by use; the design changes nothing here. |
| Rich text | `components/slack/rich-text.tsx` | Only restyled through CSS variables. |
| Slack bridge | `lib/server/*`, `app/api/slack/*`, `lib/slack/bridge-*.ts`, `tools/qrauth` | The wizard calls the same jobs (`auth-*`, `channels`, `dump`, `resolve-users`). |
| QR live view | `components/slack/qr-live-view.tsx` | Wrapped in the design's "sign-in browser" frame. |
| i18n | `lib/i18n/*` | New strings go in the same typed catalogues (5 languages). |
| Standalone export | `lib/export/standalone.tsx` | Same builder; it picks up the new tokens because it copies the page CSS. |

## Phases

Each phase ends with `tsc`, `eslint`, a production build and a Playwright pass
against the fake Slack server.

### 1 · Tokens, fonts, theme — done

- `loquarium-tokens.css` is inlined in `app/globals.css`, light and dark.
  Dark applies on `[data-theme="dark"]` **and** `.dark`, so exported pages
  (which toggle `.dark`) keep working.
- The shadcn variables and the old `--slack-*` variables become aliases of the
  Loquarium tokens: every existing component changes colour without edits.
  Note: Loquarium's `--accent` is the brand colour; shadcn's hover "accent"
  is mapped to `--surface-2` instead.
- IBM Plex Sans / Mono for the app, Lato for message text.

### 2 · App shell and routing — done

- 56 px rail (Library, Import, Exports, Settings), a bottom bar on phones, and
  a 52 px header with breadcrumbs, a primary action (Import / Export), the
  theme toggle and the language menu.
- Hash routes (`#/library`, `#/import`, `#/archive/<id>/<conversation>`,
  `#/exports`, `#/settings`): the browser's back button works everywhere.
- Dropping a file anywhere shows the drop overlay and opens it — secondary to
  the Slack path, never in the middle of an empty screen.

### 3 · Library (local persistence) — done

- `lib/library/store.ts`: archives in IndexedDB (`loquarium` database). An
  archive is a Slack workspace or "local files", holding conversations.
- Library screen: empty state (connect Slack, or open a file), recently
  opened conversations, archives table, delete.

### 4 · Archive screen and message — done

- Navigator: archive header, filter (name, ID or link, ⌘K), Conversations /
  People tabs, sections (channels, private, direct messages), the people of
  the open conversation with counts and author filter, unresolved IDs.
- Conversation: header (name, count, search ⌘F, e-mails), unknown-ID
  banner, date range, sticky day dividers, restyled messages, empty states.
- People tab: table with inline naming and suggestions (replaces the names
  dialog), filter chips.
- Thread docked at 420 px, overlay on narrow screens, Esc closes.
- `components/slack/message.tsx` follows `Loquarium Message`; the export uses
  the same component.

### 5 · Import wizard — done

- Stepper aside + 5 steps: source → Slack connection → conversations →
  import → done. The file path: pick files → directory (optional) → import.
- Slack connection: connected workspaces as cards (open, forget), "connect
  another", the sign-in form (workspace, method tabs, help aside) and the
  live sign-in browser.
- Conversations: search (name, ID, link), multi-select, member-only and
  name-resolution options, 400-row cap notice.
- Import: one progress line per conversation, error with retry / skip,
  cancel. Done: stats and "open the archive".

### 6 · Export sheet and history — done

- Side sheet: scope (this conversation), format (HTML, JSON; PDF and evidence
  pack shown as "coming soon"), e-mails switch, light/dark, summary,
  generate / done / error footer.
- Exports screen: history kept in `localStorage` (file, format, scope,
  archive, date, size).

### 7 · Settings — done (minimal)

- Language, theme, e-mails, data on this device (directory, library, reset),
  Slack connections (forget).

## Deferred (needs a backend or a product decision)

| Item from the mock-ups | Why deferred |
| --- | --- |
| Loquarium sign-in (Google, Microsoft, SSO, magic link) and the account menu | No account backend yet — see `docs/product/strategy.md`. |
| Free / Pro plan, "Upgrade", Pro badges | No billing. Pro formats appear as "coming soon". |
| PDF, evidence pack (SHA-256 manifest), redaction | Export engine work: roadmap phase 3. |
| Workspace ZIP import | Parser work: roadmap phase 2 (the file path accepts .json today). |
| Time-zone picker, date-range and multi-channel export scopes | Shown as "coming soon". |
| WhatsApp / Teams / Discord sources | Shown as "coming soon". |
| Toasts | See the known gaps below. The phone bottom bar is implemented. |
| Restyled standalone export page (print layout of `Loquarium Export Page`) | Next pass: the export already inherits tokens and the new message style. |

## Known gaps, for the next pass

- A direct message's title lists every participant, the signed-in person
  included: the bridge does not yet pass "who am I" to the app.
- The library counts replies in a conversation's message total; the
  conversation header counts the main flow only.
- Deleting a single conversation exists in the store (`deleteConversation`)
  but has no button yet — only whole archives can be deleted.
- Toasts (import finished while elsewhere, export done) are not implemented;
  the sheet and the wizard show their own states instead.
