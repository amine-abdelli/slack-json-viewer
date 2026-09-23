# Design brief: Loquarium (working name) — the application

Redesign my app **as one coherent SaaS product**: a single visual identity, one navigation model, one journey through the application. Today's UI grew feature by feature (a drop zone in the middle of the screen, then a modal to connect to Slack, then a viewer) and feels like three tools stitched together. Start over.

**Design the application itself, not the marketing site.** No landing page, no pricing page, no marketing sections — a signed-in product from the first screen. I care about the app: its shell, its navigation, its screens and states, and how a user moves from importing a conversation to reading, searching and exporting it. Keep **every existing capability** (checklist in §8). Challenge my structure where you see something better.

---

## 1. The product

Loquarium turns Slack conversations into records people can **read, search, share and rely on**:

- Conversations appear **exactly as they looked in Slack**: threads, reactions, attachments, edits, who replied to whom.
- The main way in is **connecting a Slack workspace** and picking conversations. Opening an export file someone already has (a workspace ZIP, or conversation JSON files) is a **secondary** path.
- Conversations export as a **single self-contained HTML page** that opens offline with a double-click, or as JSON. PDF and legal "evidence packs" come next.
- **Privacy is the core promise.** Conversations are displayed and stored on the user's device; opened files never leave the browser. Make this quietly visible in the app (import, library, settings), never as a marketing slogan.

**Who it's for, by priority:** legal / HR / compliance people who must hand Slack conversations to someone else (lawyers, HR investigators, DPOs answering GDPR access requests); teams keeping history a free plan would delete; anyone holding an unreadable Slack export.

**Tone:** trustworthy, precise, calm, premium. A professional records tool, not a chat app and not a Slack clone. The name must never contain "Slack"; nothing should look like an official Slack product (no Slack logo, no copy of Slack's aubergine chrome).

## 2. The rule that matters most

Two layers, kept distinct:

1. **The application** (shell, navigation, import, library, exports, settings) carries our own identity, designed from scratch.
2. **The conversation rendering** (messages, threads, reactions, attachments) stays **faithful to Slack's reading experience**: same density, grouping, avatars, names, timestamps, reaction pills, thread bars. Refine spacing, typography and contrast — but no chat bubbles, no tables. A lawyer must recognise the conversation as it happened.

## 3. Application shell and navigation (my proposal; improve it)

One shell around everything: persistent left navigation, a consistent top bar, the primary action always in the same place.

```
App shell
├── Library            ← the app's home: every imported archive
│   └── Archive        ← one workspace or one import
│       ├── Conversations   (channels, DMs, group DMs — a persistent navigator, not a modal)
│       ├── Conversation    (messages + thread panel)
│       └── People          (directory: resolved / unresolved, fix names)
├── Import             ← one wizard for every source
├── Exports            ← history of what was exported (evidence packs later)
└── Settings
    ├── Preferences        (language, theme, time zone, e-mail display)
    ├── Data on this device (storage used, delete archives)
    ├── Slack connections  (connected workspaces)
    └── Plan & billing

Account menu (plan badge, log out) in the top bar.
Shared with a recipient → the exported standalone HTML page (design it too).
```

Principles to apply everywhere: multi-step tasks are a **stepper/wizard**, never stacked modals; **breadcrumbs** inside an archive (Library › acme › #product-launch); one set of patterns for lists, empty states, progress, errors and locked-feature prompts; simple by default, power features one click away.

## 4. Screens and every state to design

### 4.1 Import wizard (one flow for every source)

**Step 1 — Choose a source**
- **Connect to Slack**, the **primary** path and default: it fills the step.
- **Open an export file**, **secondary**: a workspace ZIP, or one or more `.json` files. Not a big centre-screen drop zone — a discreet link or small button ("Already have an export? Open a file"), off to the side or at the bottom. Files dragged **anywhere in the app** are still accepted, with a full-window drop overlay. States: drag-over, invalid file (e.g. "'x.json' is not valid JSON", "Missing or invalid `messages` key…").

**Step 2 — Sign in (Connect path)**
- **Workspace** field (the subdomain, e.g. "acme").
- A sign-in step: design it as a UI container only — a method switch, a short help panel, input fields, a "recognised/validated" state. I'll supply the exact copy for the methods.
- **Already-connected workspaces** as prominent cards at the top: square initial avatar, name, `acme.slack.com`, "View channels →" on the whole card, and a separate forget/log-out action. When cards exist, the sign-in form folds behind "+ Connect another workspace".
- **Live sign-in browser** for SSO workspaces: when Slack redirects to a company identity provider, the wizard shows a live picture of a browser running on the server (1280×800 ratio, refreshed several times a second); the user clicks and types into the picture to finish. Design: a "Sign-in browser" title and explanation, an "Opening the browser…" placeholder, a focus ring when the picture has keyboard focus and a hint when it doesn't, progress and Cancel always visible. It must inspire confidence, not look like a hack.

**Step 2 — People directory (export-file path), optional**
- Auto-detected in a ZIP. Otherwise the user adds a `users.json` or a `.txt/.tsv/.csv` (Name / ID / Email) so IDs become names. States: detected / added ("1,284 people") / skipped.

**Step 3 — Choose conversations (Connect path)**
- A channel list with search by **name** (`general`, `#general`), **ID** (`C0AE23W6W0J` or part of it) or a pasted **Slack link**.
- Under the field: a hint with two example chips when empty, a match count while typing ("12 of 248 channels"), and a "first 400 shown" notice past the cap.
- Rows: type icon (public #, private lock, DM, group DM), name (DMs show "Direct message · U123…"), ID in small monospace, member count or an "archived" tag. States: hover, selected, no results.
- Options: "Only channels I'm a member of" (on by default; off loads a much longer, slower list) and "Resolve participant names" (on).

**Step 4 — Processing**
- Live progress lines: "1,200 messages fetched", "38 threads to fetch…", "12/38 threads fetched", "24/24 members resolved" (or parse/index counts for a ZIP). Cancel available.
- Error states with a message and an optional monospace detail, e.g. "Slack returned no message for this conversation. If it's not empty, this token can't read it…".

**Step 5 — Done**
- Summary: channels, messages, date range, people, "Stored on this device". Primary action "Open archive".

### 4.2 Library (the app's home)

- **Archive cards/rows:** workspace name, source (Slack connection / export ZIP / files), date range, channels, messages, size, last opened, an "on this device" badge.
- **Recently opened conversations.**
- **Empty state:** "Connect your Slack workspace" as the main invitation, "or open an export file" as a small secondary link.

### 4.3 Archive: conversations and conversation view (the main working screen)

**Left — the archive navigator (persistent, replaces the old modal)**
- Sections Channels / Direct messages / Group DMs, with the same name/ID/link search.
- **People list that doubles as an author filter:** click a person to show only their messages (toggle, active state). A pencil action opens name-fixing.
- Footer: "Directory: 1,284 people".

**Top bar**
- Breadcrumbs.
- Conversation name + count badge: "342 messages" or "12 / 342 messages" while filtering.
- "Search the conversation" with a clear (×) button.
- Options: show/hide e-mails, light/dark theme, time-zone indicator, language (icon-only menu).
- **"Export"** primary button (see 4.4).
- Back affordance and the browser back button return to the navigator exactly where it was.

**Banners under the top bar**
- Dismissible error (e.g. "Export failed: …").
- Unknown IDs: "3 IDs missing from the directory — Give them a name" → People tab.

**Message list — design every variant**
- Day dividers as a centred pill: "Today", "Yesterday", "Tuesday 10 February 2026".
- Full message: avatar (photo or coloured initials), bold name, optional **APP** badge for bots, optional e-mail, optional **"unresolved"** badge (tooltip), time (tooltip = full date/time).
- Grouped message (same author within 5 minutes): no header; time in the gutter on hover; header reappears while searching or filtering.
- Rich text: bold, italic, strike, inline code, code blocks, quotes, bulleted/numbered lists, links, @user / #channel / @here mentions, emoji; "(edited)"; **search highlighting**.
- Reactions: emoji + count pills, tooltip listing who reacted.
- Link preview: coloured left bar, service icon + name, title link, text, image or thumbnail.
- File cards: image, document (4-letter type badge), and code snippet with a preview — each with name, type, size, "open in Slack".
- Huddle card.
- Thread bar: up to 5 replier avatars, "3 replies", "Last reply on 10 Feb 2026, 08:31", "View thread" on hover.
- Orphan reply note: "Reply in a thread whose original message is missing from the export".
- Empty search: "No message matches this search."
- Full-window drop overlay when a file is dragged in.

**Thread panel (right, ~420 px):** title "Thread" + conversation name, close on Esc; the root message, a "3 replies" divider, then the replies.

**People tab:** each participant with avatar, name, ID, e-mail, status (resolved / unresolved); inline name editing with suggestions, kept on the device and used in exports.

### 4.4 Export flow

A side sheet or dedicated page, not a tiny menu.
- **Scope:** this conversation (later: a selection, a date range, several channels).
- **Formats:** Standalone HTML page ("a single file, clickable offline", free) and JSON ("raw data, reloadable", free); PDF, Evidence pack (PDF + HTML + JSON + integrity manifest with SHA-256 fingerprints) and Redaction shown with a Pro lock/badge and an upgrade path.
- **Options:** include e-mails, theme, time zone.
- **States:** preview summary, generating (spinner), downloaded, error.
- The **Exports** section lists past exports (format, scope, date, size).

### 4.5 The exported standalone HTML page (the recipient's view)

Opened offline by someone who may never have used Slack — a first-class screen.
- Sticky toolbar: conversation name + message counter, search, author filter ("All authors" + participants), "Clear", theme toggle, "Print / PDF", "Back to top".
- A date-range line: "Tuesday 10 February 2026, 08:29 → Friday 13 March 2026, 17:02".
- The same message rendering, with a thread side panel.
- Print layout: no toolbar, messages never split across pages.
- A discreet "Made with Loquarium" footer.

### 4.6 Settings and system states

- Preferences (5 languages + browser language, theme, time zone, e-mail display); Data on this device (storage per archive, delete an archive, clear all, with a plain explanation of what's stored where); Slack connections (forget, connect another); Plan & billing (plan, usage vs limits, invoices).
- A **paywall sheet** when a locked feature is chosen: what it unlocks, plan options, dismiss.
- Loading skeletons, offline notice, generic error, session expired, storage-quota warning, toasts.

## 5. Technical constraints

- **Stack:** Next.js (App Router), React 19, Tailwind CSS v4, shadcn/ui (Radix), lucide-react. Design with components that map to shadcn/ui: Button, Input, Dialog, Sheet, DropdownMenu, Tooltip, Badge, Avatar, Tabs, Checkbox, Breadcrumb, Progress, ScrollArea, Toast.
- **Theming:** everything as CSS variables, light + dark. Two token families: application tokens, and conversation tokens (message background, hover, muted text, mention highlight, reaction pill, code, quote bar, link, divider).
- **Five languages:** French, English, Spanish, Chinese (simplified), Russian. Layouts must hold Russian/Spanish strings ~30–40 % longer than English, and Chinese text. Mockups can use English or French copy.
- **Accessibility:** WCAG AA contrast in both themes, visible focus states, full keyboard use, Esc closes panels.
- **Responsive:** desktop first (1280–1440 px), plus tablet and phone versions of the library, the archive navigator and the conversation view.
- **Typography:** propose an application typeface (free, Google Fonts), a reading typeface for conversations (today it's Lato, like Slack), and a monospace for IDs and code.

## 6. Where the product is heading (leave room; no full design needed)

Filters by date range / people / channels across an archive; evidence packs with redaction of names, e-mails and phone numbers; a GDPR access-request mode (pick a person → everything they wrote or that mentions them); matters (saved cases); more sources later (WhatsApp, Microsoft Teams, Discord) — the library and import wizard should accept new source types.

## 7. Sample content for the mockups (fictional)

- Workspace **acme**. Conversations: `#general`, `#product-launch`, `#incident-2026-03-12`, a DM with Sarah Lemaire, a group DM "Marc, Inès, Tom".
- People: Sarah Lemaire, Marc Dubois, Inès Haddad, Tom Becker; a bot "Deploy Bot" (APP badge); one unresolved ID `U09MJ41Q0RJ`.
- Show: a thread with 3 replies; reactions (👍 3, 🎉 2, 👀 1); an edited message; a code snippet; a link preview; a PDF file card; a huddle; a long message with a list and a quote; @mentions.

## 8. Feature checklist (all must appear somewhere)

- [ ] Connect a Slack workspace (primary), with already-connected workspaces and forgetting one
- [ ] Live sign-in browser for SSO workspaces
- [ ] Channel list with search by name, ID or Slack link; member-only toggle; resolve-names toggle; ID per row; archived tag; member count
- [ ] Open export files (ZIP or one/several .json) — a secondary path, never the centre of a screen; drop anywhere accepted
- [ ] Optional people directory (users.json, .txt/.tsv/.csv), with count and file name
- [ ] Fix unresolved names by hand (with suggestions), kept on device and used in exports
- [ ] Progress lines while fetching or importing, with Cancel; errors with details
- [ ] Faithful message rendering (every variant in 4.3), day dividers, grouping, threads + thread panel
- [ ] Conversation search with highlighting; author filter via the people list; filtered/total counter
- [ ] Show/hide e-mails; light/dark theme; five languages + browser language; time zone
- [ ] Export as standalone HTML page and as JSON; export history
- [ ] Standalone page with search, author filter, thread panel, theme toggle, print layout, date range
- [ ] Back navigation returns to the navigator as it was (also with the browser's back button)

## 9. What I'd like back

1. **Design system:** colour tokens (application + conversation, light + dark), type scale, spacing, radii, shadows, icon usage, and component specs (buttons, inputs, cards, list rows, badges, pills, banners, sheets/dialogs, menus, tabs, steppers, progress, empty states, locked-feature prompts).
2. **High-fidelity screens, light and dark:** the app shell; every import step and state (connect, live sign-in browser, already-connected, channel list with/without search, processing, done, export-file path); library (empty and filled); archive with the conversation view (default, searching with highlights, filtered by author, thread open, unknown-ID banner, export sheet open, empty search); people tab; exported HTML page and its print layout; settings; paywall sheet.
3. **A flow diagram** through the app: import → library → conversation → export, showing the free path and where the paid features gate.
4. **Responsive** versions of the library, navigator and conversation view.
5. **Interaction notes:** transitions, hover/focus, keyboard shortcuts (Esc, ⌘/Ctrl+K, ⌘/Ctrl+F), how state survives back navigation, how the live sign-in browser shows focus.
6. **Your recommendations** where the structure could be simpler or clearer.
