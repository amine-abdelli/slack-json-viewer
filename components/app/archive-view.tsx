"use client";

import * as React from "react";
import {
  AtSign,
  CalendarRange,
  ChevronLeft,
  HardDrive,
  ListFilter,
  Pencil,
  SearchX,
  UserRoundX,
  X,
} from "lucide-react";

import { ConversationIcon } from "@/components/app/library-view";
import { PeopleView } from "@/components/app/people-view";
import { ExportSheet } from "@/components/app/export-sheet";
import { IconButton, LqButton, SearchField, Segmented, Tag } from "@/components/app/ui";
import { Message } from "@/components/slack/message";
import { MessageList } from "@/components/slack/message-list";
import { ImagesProvider, useObjectUrls } from "@/components/slack/images";
import { useI18n } from "@/lib/i18n/react";
import type { Route } from "@/lib/app/route";
import type { ExportRecord } from "@/lib/app/exports-history";
import {
  loadConversation,
  loadImages,
  touchConversation,
  type Archive,
  type ConversationSummary,
} from "@/lib/library/store";
import { archiveName, conversationTitle } from "@/lib/library/summary";
import {
  buildMeta,
  normalizeMessages,
  suggestUnknownNames,
  tsToDate,
} from "@/lib/slack/parse";
import { isBuiltinUser, resolveUser } from "@/lib/slack/users";
import type { NormalizedMessage, SlackConversation, UserDirectory } from "@/lib/slack/types";
import { cn } from "@/lib/utils";

type ArchiveRoute = Extract<Route, { name: "archive" }>;

/** Name, ID (`C0123…`) or a pasted Slack link, lower-cased. */
function navQuery(raw: string): string {
  let q = raw.trim();
  const link = q.match(/\/archives\/([A-Za-z0-9]+)/);
  if (link) q = link[1];
  return q.replace(/^[#@]/, "").toLowerCase();
}

/** Messages rendered when a conversation opens, and added per batch as the reader scrolls up. */
const WINDOW_STEP = 150;

export function ArchiveView({
  archives,
  route,
  navigate,
  directory,
  directorySize,
  overrides,
  onSaveOverrides,
  showEmail,
  onShowEmailChange,
  dark,
  exportOpen,
  onExportOpenChange,
  onExported,
  onChanged,
}: {
  archives: Archive[] | null;
  route: ArchiveRoute;
  navigate: (route: Route, options?: { replace?: boolean }) => void;
  directory: UserDirectory;
  directorySize: number;
  overrides: Record<string, string>;
  onSaveOverrides: (next: Record<string, string>) => void;
  showEmail: boolean;
  onShowEmailChange: (value: boolean) => void;
  dark: boolean;
  exportOpen: boolean;
  onExportOpenChange: (open: boolean) => void;
  onExported: (list: ExportRecord[]) => void;
  onChanged: () => void;
}) {
  const { m, t, p, fmt } = useI18n();
  const archive = archives?.find((a) => a.id === route.archiveId) ?? null;
  const summary = archive?.conversations.find((c) => c.id === route.conversationId) ?? null;

  const nameOf = React.useCallback(
    (id: string) => resolveUser(id, directory, overrides).name,
    [directory, overrides],
  );

  /* ------------------------------------------------ pick a conversation */

  // An archive opened without a conversation lands on the last one read.
  React.useEffect(() => {
    if (!archive || route.conversationId || route.tab !== "conversations") return;
    if (typeof window !== "undefined" && window.innerWidth < 768) return; // phones show the list
    const first = [...archive.conversations].sort(
      (a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0),
    )[0];
    if (first) {
      navigate(
        { name: "archive", archiveId: archive.id, conversationId: first.id, tab: "conversations" },
        { replace: true },
      );
    }
  }, [archive, route.conversationId, route.tab, navigate]);

  /* ------------------------------------------------------------ loading */

  const [loaded, setLoaded] = React.useState<{
    key: string;
    data: SlackConversation | null;
    /** Screenshots kept with it, by Slack file ID. */
    images: Map<string, Blob>;
  } | null>(null);
  const loadKey = `${route.archiveId}/${route.conversationId ?? ""}`;

  React.useEffect(() => {
    if (!route.conversationId) return;
    let cancelled = false;
    void Promise.all([
      loadConversation(route.archiveId, route.conversationId),
      loadImages(route.archiveId, route.conversationId).catch(() => new Map<string, Blob>()),
    ]).then(([data, images]) => {
      if (cancelled) return;
      setLoaded({ key: loadKey, data, images });
      if (data) {
        void touchConversation(route.archiveId, route.conversationId!).then(onChanged);
      }
    });
    return () => {
      cancelled = true;
    };
    // `onChanged` refreshes the library; it must not re-trigger a load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey]);

  const conversation = loaded?.key === loadKey ? loaded.data : null;
  const imageBlobs = loaded?.key === loadKey ? loaded.images : null;
  const imageUrls = useObjectUrls(imageBlobs);
  const loading = Boolean(route.conversationId) && loaded?.key !== loadKey;

  /* ------------------------------------------------------------ derived */

  const meta = React.useMemo(
    () => (conversation ? buildMeta(conversation, directory) : null),
    [conversation, directory],
  );
  const messages = React.useMemo(
    () => (conversation ? normalizeMessages(conversation.messages, directory, overrides) : []),
    [conversation, directory, overrides],
  );
  const unknown = React.useMemo(
    () =>
      conversation
        ? suggestUnknownNames(conversation, directory)
        : { unknownIds: [], candidates: [] },
    [conversation, directory],
  );
  const unresolved = unknown.unknownIds.filter((id) => !overrides[id]);

  /** Messages per author, replies included. */
  const counts = React.useMemo(() => {
    const out = new Map<string, number>();
    const add = (msg: NormalizedMessage) => out.set(msg.userId, (out.get(msg.userId) ?? 0) + 1);
    for (const msg of messages) {
      add(msg);
      msg.replies.forEach(add);
    }
    return out;
  }, [messages]);

  /* ------------------------------------------------------------ filters */

  const [query, setQuery] = React.useState("");
  const [author, setAuthor] = React.useState<string | null>(null);
  const [thread, setThread] = React.useState<NormalizedMessage | null>(null);
  const [unknownDismissed, setUnknownDismissed] = React.useState(false);
  const [editing, setEditing] = React.useState<string | null>(null);

  // A different conversation starts clean.
  const [seenKey, setSeenKey] = React.useState(loadKey);
  if (seenKey !== loadKey) {
    setSeenKey(loadKey);
    setQuery("");
    setAuthor(null);
    setThread(null);
    setUnknownDismissed(false);
  }

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q && !author) return messages;
    return messages.filter(
      (msg) => (!q || msg.searchText.includes(q)) && (!author || msg.userId === author),
    );
  }, [messages, query, author]);
  const filtering = Boolean(query.trim() || author);
  const highlight = query.trim().length > 1 ? query.trim() : undefined;

  /* ------------------------------------------------------- windowing */

  // A conversation opens on its latest messages and renders only the last
  // WINDOW_STEP of them; more are added as the reader nears the top. Tens of
  // thousands of messages rendered at once took seconds to open and made every
  // keystroke in the search lag.
  const [limit, setLimit] = React.useState(WINDOW_STEP);
  const windowKey = `${loadKey}|${query.trim()}|${author ?? ""}`;
  const [seenWindowKey, setSeenWindowKey] = React.useState(windowKey);
  if (seenWindowKey !== windowKey) {
    setSeenWindowKey(windowKey);
    setLimit(WINDOW_STEP);
  }
  const visible = React.useMemo(
    () => (filtered.length > limit ? filtered.slice(filtered.length - limit) : filtered),
    [filtered, limit],
  );
  const older = filtered.length - visible.length;

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  /** The scroll geometry just before older messages were added above. */
  const anchor = React.useRef<{ height: number; top: number } | null>(null);

  const showOlder = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el || anchor.current) return;
    anchor.current = { height: el.scrollHeight, top: el.scrollTop };
    setLimit((n) => n + WINDOW_STEP);
  }, []);

  // New conversation or new filter: start from the latest messages.
  React.useLayoutEffect(() => {
    if (!conversation) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation, windowKey]);

  // Older messages were added above: keep the ones on screen where they were.
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    const before = anchor.current;
    if (!el || !before) return;
    anchor.current = null;
    el.scrollTop = before.top + (el.scrollHeight - before.height);
  }, [visible]);

  // Near the top — well before reaching it — add the next batch. Observing
  // again after each batch re-checks at once, in case it did not fill the view.
  React.useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || older === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) showOlder();
      },
      { root, rootMargin: "1200px 0px 0px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [visible, older, showOlder]);

  /* ----------------------------------------------------------- keyboard */

  const navSearch = React.useRef<HTMLInputElement>(null);
  const convSearch = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        navSearch.current?.focus();
        navSearch.current?.select();
      } else if (mod && e.key.toLowerCase() === "f" && convSearch.current) {
        e.preventDefault();
        convSearch.current.focus();
        convSearch.current.select();
      } else if (e.key === "Escape" && !exportOpen && thread) {
        setThread(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exportOpen, thread]);

  /* --------------------------------------------------------------- view */

  if (archives && !archive) {
    return (
      <div className="grid flex-1 place-items-center p-10 text-center text-fg-2">
        <div>
          <p className="font-semibold text-fg">{m.archive.notFound}</p>
          <LqButton variant="secondary" className="mt-3" onClick={() => navigate({ name: "library" })}>
            {m.app.nav.library}
          </LqButton>
        </div>
      </div>
    );
  }
  if (!archive) return <div className="flex-1" />;

  const title = summary ? conversationTitle(summary, nameOf) : "";
  const goConversation = (id: string) =>
    navigate({ name: "archive", archiveId: archive.id, conversationId: id, tab: "conversations" });
  const setTab = (tab: "conversations" | "people") =>
    navigate({ name: "archive", archiveId: archive.id, conversationId: route.conversationId, tab });

  const people = meta
    ? [...meta.participants].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
    : [];
  const hasConversation = Boolean(route.conversationId);

  return (
    <ImagesProvider images={imageUrls}>
    <div className="relative flex min-h-0 flex-1">
      <Navigator
        archive={archive}
        current={route.conversationId}
        tab={route.tab}
        onTab={setTab}
        onOpen={goConversation}
        nameOf={nameOf}
        searchRef={navSearch}
        unresolvedCount={unresolved.length}
        people={people}
        counts={counts}
        author={author}
        onAuthor={setAuthor}
        directory={directory}
        overrides={overrides}
        onFix={(id) => {
          setEditing(id);
          setTab("people");
        }}
        directorySize={directorySize}
        className={cn(hasConversation || route.tab === "people" ? "hidden md:flex" : "flex")}
      />

      {route.tab === "people" ? (
        <PeopleView
          ids={meta ? meta.participants : unionParticipants(archive)}
          scope={meta ? title : archiveName(archive, m.app.localFiles)}
          counts={meta ? counts : null}
          directory={directory}
          overrides={overrides}
          candidates={unknown.candidates}
          onSave={onSaveOverrides}
          editing={editing}
          onEditing={setEditing}
          onBack={() => setTab("conversations")}
        />
      ) : hasConversation ? (
        <section className="flex min-w-0 flex-1 flex-col bg-c-bg">
          <div className="flex min-h-[52px] shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface py-2 pr-3 pl-4">
            <IconButton
              className="md:hidden"
              aria-label={m.archive.backToList}
              onClick={() =>
                navigate({ name: "archive", archiveId: archive.id, tab: "conversations" })
              }
            >
              <ChevronLeft className="!size-[18px]" />
            </IconButton>
            <div className="flex min-w-0 flex-[1_1_180px] items-center gap-2">
              <span className="text-fg-3">
                {summary ? <ConversationIcon kind={summary.kind} className="size-4" /> : null}
              </span>
              <h1 className="m-0 min-w-0 truncate text-[16px] font-semibold" title={summary?.name}>
                {title}
              </h1>
              {summary?.archived ? <Tag>{m.connect.archived}</Tag> : null}
              {meta ? (
                <span
                  className={cn(
                    "rounded-[4px] px-[7px] py-0.5 text-[12px] font-medium whitespace-nowrap tabular-nums",
                    filtering ? "bg-brand-soft text-brand-text" : "bg-surface-2 text-fg-2",
                  )}
                >
                  {filtered.length === messages.length
                    ? p(m.viewer.messages, messages.length)
                    : p(m.viewer.messagesFiltered, messages.length, {
                        shown: fmt.number(filtered.length),
                      })}
                </span>
              ) : null}
            </div>
            <SearchField
              ref={convSearch}
              value={query}
              onChange={setQuery}
              placeholder={m.viewer.search}
              shortcut="⌘F"
              className="min-w-[160px] flex-[0_1_280px]"
            />
            <IconButton
              active={showEmail}
              aria-pressed={showEmail}
              onClick={() => onShowEmailChange(!showEmail)}
              title={showEmail ? m.viewer.hideEmails : m.viewer.showEmails}
              aria-label={showEmail ? m.viewer.hideEmails : m.viewer.showEmails}
            >
              <AtSign />
            </IconButton>
          </div>

          {unresolved.length > 0 && !unknownDismissed ? (
            <div className="flex flex-wrap items-center gap-2.5 border-b border-border bg-warning-soft px-4 py-[9px] text-[13px] text-fg">
              <UserRoundX className="size-[15px] text-warning" />
              <span className="min-w-[200px] flex-1">{p(m.viewer.unknownIds, unresolved.length)}</span>
              <button
                type="button"
                onClick={() => setTab("people")}
                className="border-0 bg-transparent p-0 text-[13px] font-semibold text-warning"
              >
                {m.archive.nameThem}
              </button>
              <button
                type="button"
                onClick={() => setUnknownDismissed(true)}
                aria-label={m.archive.hide}
                className="border-0 bg-transparent text-fg-3"
              >
                <X className="size-[15px]" />
              </button>
            </div>
          ) : null}

          <div
            ref={scrollRef}
            className="slack-scroll min-h-0 flex-1 overflow-auto pt-1 pb-7 [overflow-anchor:none]"
          >
            {loading ? (
              <div aria-busy="true" className="flex flex-col gap-3 px-5 py-6">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-2">
                    <div className="size-9 rounded-[6px] bg-surface-2" />
                    <div className="flex-1 space-y-2">
                      <div className="lq-shimmer h-3 w-40 rounded" />
                      <div className="h-3 w-3/4 rounded bg-surface-2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !conversation ? (
              <p className="px-5 py-16 text-center text-fg-3">{m.archive.missing}</p>
            ) : messages.length === 0 ? (
              <p className="px-5 py-16 text-center text-fg-3">{m.archive.empty}</p>
            ) : (
              <>
                {meta?.firstTs && meta.lastTs ? (
                  <div className="flex flex-wrap items-center gap-1.5 px-5 pt-3.5 pb-1.5 text-[12px] text-c-muted">
                    <CalendarRange className="size-[13px]" />
                    {fmt.range(tsToDate(meta.firstTs), tsToDate(meta.lastTs))}
                    {summary?.threadCount ? ` · ${p(m.archive.threads, summary.threadCount)}` : ""}
                  </div>
                ) : null}
                {filtered.length === 0 ? (
                  <div className="px-5 py-16 text-center">
                    <div className="mx-auto mb-3 grid size-10 place-items-center rounded-[10px] bg-surface-2 text-fg-3">
                      <SearchX className="size-[18px]" />
                    </div>
                    <div className="font-semibold">{m.viewer.noMatch}</div>
                    <div className="mt-1 text-[13px] text-fg-3">
                      {query.trim() ? `« ${query.trim()} »` : ""}
                      {author ? ` · ${t(m.archive.byAuthor, { name: nameOf(author) })}` : ""}
                    </div>
                    <LqButton
                      variant="secondary"
                      size="sm"
                      className="mt-3.5"
                      onClick={() => {
                        setQuery("");
                        setAuthor(null);
                      }}
                    >
                      {m.archive.clearSearch}
                    </LqButton>
                  </div>
                ) : (
                  <>
                  {older > 0 ? (
                    <div ref={sentinelRef} className="flex justify-center px-5 pt-2 pb-1">
                      <button
                        type="button"
                        onClick={showOlder}
                        className="rounded-full border border-border bg-surface px-3 py-1 text-[12px] font-medium text-fg-2 hover:bg-surface-2"
                      >
                        {p(m.archive.olderMessages, Math.min(WINDOW_STEP, older))}
                      </button>
                    </div>
                  ) : null}
                  <MessageList
                    messages={visible}
                    directory={directory}
                    overrides={overrides}
                    highlight={highlight}
                    showEmail={showEmail}
                    filtering={filtering}
                    onOpenThread={setThread}
                    className="pt-0 pb-0"
                  />
                  </>
                )}
              </>
            )}
          </div>
        </section>
      ) : (
        <div className="hidden flex-1 place-items-center text-fg-3 md:grid">{m.archive.pick}</div>
      )}

      {thread && route.tab === "conversations" ? (
        <ThreadPanel
          thread={thread}
          channelName={title}
          directory={directory}
          overrides={overrides}
          highlight={highlight}
          showEmail={showEmail}
          onClose={() => setThread(null)}
        />
      ) : null}

      {conversation && meta && summary ? (
        <ExportSheet
          open={exportOpen}
          onOpenChange={onExportOpenChange}
          title={title}
          archiveLabel={archiveName(archive, m.app.localFiles)}
          meta={meta}
          conversation={conversation}
          messages={messages}
          images={imageBlobs}
          directory={directory}
          overrides={overrides}
          showEmail={showEmail}
          dark={dark}
          onExported={onExported}
          onHistory={() => {
            onExportOpenChange(false);
            navigate({ name: "exports" });
          }}
        />
      ) : null}
    </div>
    </ImagesProvider>
  );
}

function unionParticipants(archive: Archive): string[] {
  return [...new Set(archive.conversations.flatMap((c) => c.participants ?? []))];
}

/* -------------------------------------------------------------------------- */
/*  Navigator                                                                  */
/* -------------------------------------------------------------------------- */

function Navigator({
  archive,
  current,
  tab,
  onTab,
  onOpen,
  nameOf,
  searchRef,
  unresolvedCount,
  people,
  counts,
  author,
  onAuthor,
  directory,
  overrides,
  onFix,
  directorySize,
  className,
}: {
  archive: Archive;
  current?: string;
  tab: "conversations" | "people";
  onTab: (tab: "conversations" | "people") => void;
  onOpen: (id: string) => void;
  nameOf: (id: string) => string;
  searchRef: React.Ref<HTMLInputElement>;
  unresolvedCount: number;
  people: string[];
  counts: Map<string, number>;
  author: string | null;
  onAuthor: (id: string | null) => void;
  directory: UserDirectory;
  overrides: Record<string, string>;
  onFix: (id: string) => void;
  directorySize: number;
  className?: string;
}) {
  const { m, p, fmt } = useI18n();
  const [q, setQ] = React.useState("");
  const needle = navQuery(q);

  const match = (c: ConversationSummary) =>
    !needle ||
    c.id.toLowerCase().includes(needle) ||
    conversationTitle(c, nameOf).toLowerCase().includes(needle) ||
    c.name.toLowerCase().includes(needle);

  const byTitle = (a: ConversationSummary, b: ConversationSummary) =>
    conversationTitle(a, nameOf).localeCompare(conversationTitle(b, nameOf));
  const visible = archive.conversations.filter(match);
  const sections = [
    {
      key: "channels",
      title: m.archive.channels,
      items: visible.filter((c) => (c.kind === "channel" || c.kind === "private") && !c.archived),
    },
    {
      key: "dms",
      title: m.archive.directMessages,
      items: visible.filter((c) => c.kind === "dm" || c.kind === "group-dm"),
    },
    {
      key: "archived",
      title: m.archive.archivedChannels,
      items: visible.filter((c) => (c.kind === "channel" || c.kind === "private") && c.archived),
    },
  ].filter((s) => s.items.length > 0);

  return (
    <aside
      aria-label={m.archive.navigator}
      className={cn(
        "min-h-0 w-full shrink-0 flex-col border-r border-border bg-surface md:w-[272px]",
        className,
      )}
    >
      <div className="flex flex-col gap-2.5 border-b border-border px-3 pt-3 pb-2.5">
        <div className="flex items-center gap-2.5 px-1 py-0.5">
          <span className="grid size-7 place-items-center rounded-[6px] bg-surface-3 font-semibold uppercase">
            {archiveName(archive, m.app.localFiles).charAt(0)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate leading-tight font-semibold">
              {archiveName(archive, m.app.localFiles)}
            </span>
            <span className="truncate font-mono text-[11px] text-fg-3">
              {archive.source === "slack"
                ? `${archive.workspace}.slack.com · Slack`
                : m.app.fileSource}
            </span>
          </span>
        </div>
        <SearchField
          ref={searchRef}
          value={q}
          onChange={setQ}
          placeholder={m.archive.filter}
          label={m.archive.filterLabel}
          shortcut="⌘K"
        />
        <Segmented
          stretch
          size="sm"
          value={tab}
          onChange={onTab}
          options={[
            { value: "conversations", label: m.archive.tabConversations },
            {
              value: "people",
              label: (
                <>
                  {m.archive.tabPeople}
                  {unresolvedCount > 0 ? (
                    <span className="grid h-4 min-w-4 place-items-center rounded-[8px] bg-warning-soft px-1 text-[10.5px] text-warning">
                      {unresolvedCount}
                    </span>
                  ) : null}
                </>
              ),
            },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pt-1.5 pb-3">
        {sections.map((s) => (
          <div key={s.key}>
            <div className="flex justify-between px-2 pt-2.5 pb-1 text-[11.5px] font-semibold text-fg-3">
              <span>{s.title}</span>
              <span className="font-normal">{s.items.length}</span>
            </div>
            {[...s.items].sort(byTitle).map((c) => {
              const selected = c.id === current;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onOpen(c.id)}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "flex h-[30px] w-full items-center gap-2 rounded-[6px] px-2 text-left text-[13.5px]",
                    selected
                      ? "bg-brand-soft font-medium text-brand-text"
                      : "text-fg-2 hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <span className="w-[15px] opacity-75">
                    <ConversationIcon kind={c.kind} className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{conversationTitle(c, nameOf)}</span>
                  {c.archived ? (
                    <span className="rounded-[3px] bg-surface-3 px-[5px] py-px text-[10.5px] text-fg-3">
                      {m.connect.archived}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
        {sections.length === 0 ? (
          <div className="px-3 py-6 text-center text-[13px] text-fg-3">{m.archive.noConversation}</div>
        ) : null}

        {people.length > 0 ? (
          <>
            <div className="flex items-center justify-between px-2 pt-3.5 pb-1 text-[11.5px] font-semibold text-fg-3">
              <span>{m.archive.peopleHere}</span>
              {author ? (
                <button
                  type="button"
                  onClick={() => onAuthor(null)}
                  className="border-0 bg-transparent p-0 text-[11.5px] font-medium text-brand-text"
                >
                  {m.archive.showAll}
                </button>
              ) : null}
            </div>
            {people.map((id) => {
              const user = resolveUser(id, directory, overrides);
              const active = author === id;
              const unknownId = !user.known && !isBuiltinUser(id);
              return (
                <div
                  key={id}
                  className={cn("flex items-center rounded-[6px]", active && "bg-brand-soft")}
                >
                  <button
                    type="button"
                    onClick={() => onAuthor(active ? null : id)}
                    aria-pressed={active}
                    title={user.email ?? id}
                    className={cn(
                      "flex h-[30px] min-w-0 flex-1 items-center gap-2 rounded-[6px] px-2 text-left text-[13px]",
                      active ? "font-medium text-brand-text" : "text-fg-2 hover:bg-surface-2",
                    )}
                  >
                    <span
                      className="grid size-[18px] shrink-0 place-items-center rounded-[4px] font-read text-[8.5px] font-bold text-white"
                      style={{ background: user.color }}
                    >
                      {user.initials}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate", unknownId && "font-mono text-[12px]")}>
                      {user.name}
                    </span>
                    {active ? <ListFilter className="size-[13px]" /> : null}
                    <span className="text-[11.5px] text-fg-3 tabular-nums">
                      {fmt.number(counts.get(id) ?? 0)}
                    </span>
                  </button>
                  {unknownId ? (
                    <button
                      type="button"
                      onClick={() => onFix(id)}
                      title={m.people.name}
                      aria-label={`${m.people.name} — ${id}`}
                      className="mr-0.5 grid size-[26px] place-items-center rounded-[5px] text-warning hover:bg-warning-soft"
                    >
                      <Pencil className="size-[13px]" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </>
        ) : null}
      </div>

      <div className="flex justify-between gap-2 border-t border-border px-4 py-2.5 text-[12px] text-fg-3">
        <span>{p(m.sidebar.directory, directorySize)}</span>
        <span title={m.app.onDeviceTitle} className="flex items-center gap-1">
          <HardDrive className="size-3" />
          {m.app.local}
        </span>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/*  Thread panel                                                               */
/* -------------------------------------------------------------------------- */

function ThreadPanel({
  thread,
  channelName,
  directory,
  overrides,
  highlight,
  showEmail,
  onClose,
}: {
  thread: NormalizedMessage;
  channelName: string;
  directory: UserDirectory;
  overrides: Record<string, string>;
  highlight?: string;
  showEmail: boolean;
  onClose: () => void;
}) {
  const { m, p } = useI18n();
  return (
    <div
      className="absolute inset-0 z-20 flex justify-end bg-scrim lg:static lg:z-auto lg:bg-transparent"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        aria-label={m.thread.title}
        className="flex h-full w-full max-w-[420px] flex-col border-l border-border bg-c-bg shadow-3 lg:w-[420px] lg:shadow-none"
      >
        <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border bg-surface pr-2.5 pl-[18px]">
          <span className="text-[15px] font-semibold">{m.thread.title}</span>
          <span className="min-w-0 truncate text-[13px] text-fg-3">{channelName}</span>
          <span className="flex-1" />
          <IconButton onClick={onClose} title={m.thread.close} aria-label={m.thread.close}>
            <X className="!size-[17px]" />
          </IconButton>
        </div>
        <div className="slack-scroll slack-thread-panel min-h-0 flex-1 overflow-auto pt-1.5 pb-5">
          <Message
            message={{ ...thread, grouped: false }}
            directory={directory}
            overrides={overrides}
            highlight={highlight}
            showEmail={showEmail}
            inThread
          />
          <div className="slack-thread-divider">{p(m.thread.replies, thread.replyCount)}</div>
          {thread.replies.map((reply) => (
            <Message
              key={reply.key}
              message={reply}
              directory={directory}
              overrides={overrides}
              highlight={highlight}
              showEmail={showEmail}
              inThread
            />
          ))}
        </div>
      </aside>
    </div>
  );
}

