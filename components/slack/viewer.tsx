"use client";

import * as React from "react";
import {
  ArrowLeft,
  Braces,
  Download,
  FileCode2,
  Hash,
  Loader2,
  Lock,
  Mail,
  MailX,
  Moon,
  Search,
  Sun,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MessageList } from "@/components/slack/message-list";
import { Sidebar } from "@/components/slack/sidebar";
import { ConnectPanel } from "@/components/slack/connect-panel";
import { DropZone } from "@/components/slack/drop-zone";
import {
  buildMeta,
  normalizeMessages,
  parseConversation,
  SlackParseError,
  suggestUnknownNames,
} from "@/lib/slack/parse";
import { parseUserDirectory, resolveUser } from "@/lib/slack/users";
import {
  buildStandaloneHtml,
  downloadHtml,
  downloadJson,
} from "@/lib/export/standalone";
import { fetchStatus } from "@/lib/slack/bridge-client";
import type { BridgeStatus } from "@/lib/slack/bridge-types";
import { Message } from "@/components/slack/message";
import type {
  NormalizedMessage,
  SlackConversation,
  UserDirectory,
} from "@/lib/slack/types";

const LS_DIRECTORY = "slack-viewer:directory";
const LS_DIRECTORY_NAME = "slack-viewer:directory-name";
const LS_OVERRIDES = "slack-viewer:overrides";
const LS_PREFS = "slack-viewer:prefs";

/** Reads a JSON value from localStorage; returns the fallback when unavailable. */
function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function Viewer() {
  const [conversation, setConversation] = React.useState<SlackConversation | null>(
    null
  );
  const [fileName, setFileName] = React.useState<string>("conversation");
  const [directory, setDirectory] = React.useState<UserDirectory>(() =>
    readStorage<UserDirectory>(LS_DIRECTORY, {})
  );
  const [directoryName, setDirectoryName] = React.useState<string | null>(() => {
    try {
      return localStorage.getItem(LS_DIRECTORY_NAME);
    } catch {
      return null;
    }
  });
  const [overrides, setOverrides] = React.useState<Record<string, string>>(() =>
    readStorage<Record<string, string>>(LS_OVERRIDES, {})
  );
  const [query, setQuery] = React.useState("");
  const [author, setAuthor] = React.useState<string | null>(null);
  const [prefs] = React.useState(() =>
    readStorage<{ dark: boolean; showEmail: boolean }>(LS_PREFS, {
      dark: false,
      showEmail: true,
    })
  );
  const [showEmail, setShowEmail] = React.useState(prefs.showEmail !== false);
  const [dark, setDark] = React.useState(prefs.dark === true);
  const [error, setError] = React.useState<string | null>(null);
  const [namesOpen, setNamesOpen] = React.useState(false);
  const [thread, setThread] = React.useState<NormalizedMessage | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

  // The connection panel lives here rather than in the drop zone, so it stays
  // mounted once a conversation is open: reopening it lands back on the channel
  // list, already loaded.
  const [bridge, setBridge] = React.useState<BridgeStatus | null>(null);
  const [connectOpen, setConnectOpen] = React.useState(false);

  const scrollRef = React.useRef<HTMLElement>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  /* ---------------------------------------------------------------- state */

  React.useEffect(() => {
    const controller = new AbortController();
    void fetchStatus(controller.signal).then((next) => {
      if (!controller.signal.aborted) setBridge(next);
    });
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem(LS_PREFS, JSON.stringify({ dark, showEmail }));
    } catch {
      /* ignore */
    }
  }, [dark, showEmail]);

  /* ----------------------------------------------------------- file input */

  const handleFiles = React.useCallback(async (files: File[]) => {
    setError(null);
    for (const file of files) {
      const text = await file.text();
      const isJson =
        file.name.toLowerCase().endsWith(".json") ||
        text.trimStart().startsWith("{") ||
        text.trimStart().startsWith("[");

      if (isJson) {
        try {
          const parsed = JSON.parse(text);
          const conv = parseConversation(parsed, file.name);
          setConversation(conv);
          setFileName(file.name.replace(/\.json$/i, ""));
          continue;
        } catch (err) {
          // maybe it is a users.json rather than a conversation
          const dir = parseUserDirectory(text);
          if (Object.keys(dir).length > 0) {
            applyDirectory(dir, file.name);
            continue;
          }
          setError(
            err instanceof SlackParseError
              ? err.message
              : `« ${file.name} » n'est pas un JSON valide.`
          );
          continue;
        }
      }

      const dir = parseUserDirectory(text);
      if (Object.keys(dir).length > 0) {
        applyDirectory(dir, file.name);
      } else {
        setError(
          `Aucun identifiant Slack reconnu dans « ${file.name} ». Format attendu : Name / ID / Email.`
        );
      }
    }

    function applyDirectory(dir: UserDirectory, name: string) {
      setDirectory(dir);
      setDirectoryName(name);
      try {
        localStorage.setItem(LS_DIRECTORY, JSON.stringify(dir));
        localStorage.setItem(LS_DIRECTORY_NAME, name);
      } catch {
        /* directory too large for storage — kept in memory only */
      }
    }
  }, []);

  /* ------------------------------------------------------------- derived */

  const meta = React.useMemo(
    () => (conversation ? buildMeta(conversation, directory) : null),
    [conversation, directory]
  );

  const messages = React.useMemo(
    () =>
      conversation
        ? normalizeMessages(conversation.messages, directory, overrides)
        : [],
    [conversation, directory, overrides]
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q && !author) return messages;
    return messages.filter(
      (m) =>
        (!q || m.searchText.includes(q)) && (!author || m.userId === author)
    );
  }, [messages, query, author]);

  const unknown = React.useMemo(
    () =>
      conversation
        ? suggestUnknownNames(conversation, directory)
        : { unknownIds: [], candidates: [] },
    [conversation, directory]
  );

  React.useEffect(() => {
    if (!conversation) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation]);

  /* -------------------------------------------------------------- export */

  const handleExport = React.useCallback(async () => {
    if (!meta) return;
    setExporting(true);
    try {
      const html = await buildStandaloneHtml({
        meta,
        messages,
        directory,
        overrides,
        showEmail,
        dark,
      });
      downloadHtml(`${fileName || "slack-conversation"}.html`, html);
    } catch (err) {
      setError(
        `Échec de l'export : ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setExporting(false);
    }
  }, [meta, messages, directory, overrides, showEmail, dark, fileName]);

  /**
   * Going back means the channel list when the bridge is connected, and the
   * home screen otherwise — in both cases, the place the conversation came
   * from.
   */
  const backLabel = bridge?.available
    ? "Retour aux conversations"
    : "Fermer la conversation";

  const goBack = React.useCallback(() => {
    if (bridge?.available) {
      setConnectOpen(true);
      return;
    }
    setConversation(null);
    setThread(null);
    setQuery("");
    setAuthor(null);
  }, [bridge]);

  /*
   * The browser's own back button does the same as the arrow. While a
   * conversation is on screen (and the panel is closed), one history entry is
   * pushed; popping it goes back. The arrow pops that entry too, so the two
   * never drift apart.
   */
  const historyEntryRef = React.useRef(false);
  const conversationOnScreen = Boolean(conversation) && !connectOpen;

  React.useEffect(() => {
    if (!conversationOnScreen || historyEntryRef.current) return;
    window.history.pushState(window.history.state, "");
    historyEntryRef.current = true;
  }, [conversationOnScreen]);

  React.useEffect(() => {
    const onPopState = () => {
      if (!historyEntryRef.current) return;
      historyEntryRef.current = false;
      goBack();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [goBack]);

  const handleBack = React.useCallback(() => {
    if (historyEntryRef.current) window.history.back();
    else goBack();
  }, [goBack]);

  const handleExportJson = React.useCallback(() => {
    if (!conversation) return;
    downloadJson(`${fileName || "slack-conversation"}.json`, conversation);
  }, [conversation, fileName]);

  const saveOverrides = React.useCallback((next: Record<string, string>) => {
    setOverrides(next);
    try {
      localStorage.setItem(LS_OVERRIDES, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  /* --------------------------------------------------------------- views */

  // Rendered first in both branches below, so React keeps the same instance
  // when a conversation opens or closes: the panel keeps its step (the channel
  // list), its channels and its filter. Moving it breaks "back to the list".
  const connectPanel =
    bridge?.available ? (
      <ConnectPanel
        open={connectOpen}
        onOpenChange={setConnectOpen}
        status={bridge}
        onStatusChange={setBridge}
        onFiles={handleFiles}
      />
    ) : null;

  if (!conversation || !meta) {
    return (
      <>
        {connectPanel}
        <DropZone
          onFiles={handleFiles}
          error={error}
          directorySize={Object.keys(directory).length}
          directoryName={directoryName}
          bridge={bridge}
          onConnect={() => setConnectOpen(true)}
        />
      </>
    );
  }

  const filtering = Boolean(query.trim() || author);

  return (
    <>
      {connectPanel}
      <div
        className="flex h-svh overflow-hidden"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <Sidebar
          meta={meta}
          directory={directory}
          overrides={overrides}
          activeUser={author}
          onSelectUser={setAuthor}
          onEditNames={() => setNamesOpen(true)}
          directorySize={Object.keys(directory).length}
        />

        <div
          className="flex min-w-0 flex-1 flex-col"
          style={{ background: "var(--slack-bg)" }}
        >
          {/* Channel header --------------------------------------------- */}
          <header
            className="flex h-[49px] shrink-0 items-center gap-3 border-b px-4"
            style={{ borderColor: "var(--slack-border)" }}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              className="-ml-1 shrink-0"
              title={backLabel}
              aria-label={backLabel}
              onClick={handleBack}
            >
              <ArrowLeft />
            </Button>

            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {meta.kind === "channel" ? (
                <Hash className="size-4 shrink-0" style={{ color: "var(--slack-fg)" }} />
              ) : (
                <Lock className="size-4 shrink-0" style={{ color: "var(--slack-fg)" }} />
              )}
              <h1
                className="min-w-0 truncate text-[18px] font-black"
                style={{ color: "var(--slack-fg)" }}
                title={meta.rawName}
              >
                {meta.displayName}
              </h1>
            </div>
            <span
              className="hidden shrink-0 rounded-full border px-2 py-[2px] text-[11px] font-bold xl:inline"
              style={{
                borderColor: "var(--slack-border)",
                color: "var(--slack-fg-muted)",
              }}
            >
              {filtered.length === messages.length
                ? `${messages.length} messages`
                : `${filtered.length} / ${messages.length} messages`}
            </span>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2"
                  style={{ color: "var(--slack-fg-muted)" }}
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Rechercher dans la conversation"
                  className="h-8 w-40 pl-8 text-[13px] lg:w-52 2xl:w-72"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    aria-label="Effacer"
                  >
                    <X className="size-3.5" style={{ color: "var(--slack-fg-muted)" }} />
                  </button>
                ) : null}
              </div>

              <Button
                variant="ghost"
                size="icon-sm"
                title={showEmail ? "Masquer les e-mails" : "Afficher les e-mails"}
                onClick={() => setShowEmail((v) => !v)}
              >
                {showEmail ? <Mail /> : <MailX />}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title={dark ? "Thème clair" : "Thème sombre"}
                onClick={() => setDark((v) => !v)}
              >
                {dark ? <Sun /> : <Moon />}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Ouvrir un autre fichier"
                onClick={() => fileInput.current?.click()}
              >
                <Upload />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="slack" disabled={exporting}>
                    {exporting ? <Loader2 className="animate-spin" /> : <Download />}
                    <span>Exporter</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem onSelect={() => void handleExport()}>
                    <FileCode2 />
                    <div>
                      <p className="font-medium">Page HTML autonome</p>
                      <p className="text-xs text-muted-foreground">
                        Un seul fichier, cliquable hors ligne
                      </p>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleExportJson}>
                    <Braces />
                    <div>
                      <p className="font-medium">JSON de la conversation</p>
                      <p className="text-xs text-muted-foreground">
                        Les données brutes, rechargeables ici
                      </p>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept=".json,.txt,.tsv,.csv"
                className="hidden"
                onChange={(e) => {
                  void handleFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </div>
          </header>

          {error ? (
            <div
              className="flex items-center gap-2 px-4 py-2 text-[13px]"
              style={{ background: "var(--slack-mention-bg)", color: "var(--slack-red)" }}
            >
              {error}
              <button type="button" onClick={() => setError(null)} className="ml-auto">
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}

          {unknown.unknownIds.length > 0 ? (
            <div
              className="flex flex-wrap items-center gap-2 px-4 py-1.5 text-[12px]"
              style={{
                background: "var(--slack-mention-bg)",
                color: "var(--slack-fg-muted)",
              }}
            >
              {unknown.unknownIds.length} identifiant
              {unknown.unknownIds.length > 1 ? "s" : ""} absent
              {unknown.unknownIds.length > 1 ? "s" : ""} de l&apos;annuaire.
              <button
                type="button"
                className="font-bold underline"
                style={{ color: "var(--slack-blue)" }}
                onClick={() => setNamesOpen(true)}
              >
                Leur attribuer un nom
              </button>
            </div>
          ) : null}

          {/* Messages ---------------------------------------------------- */}
          <main ref={scrollRef} className="slack-scroll flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p
                className="px-6 py-16 text-center text-sm"
                style={{ color: "var(--slack-fg-muted)" }}
              >
                Aucun message ne correspond à cette recherche.
              </p>
            ) : (
              <MessageList
                messages={filtered}
                directory={directory}
                overrides={overrides}
                highlight={query.trim().length > 1 ? query.trim() : undefined}
                showEmail={showEmail}
                filtering={filtering}
                onOpenThread={setThread}
              />
            )}
          </main>
        </div>

        {thread ? (
          <ThreadPanel
            thread={thread}
            channelName={meta.displayName}
            directory={directory}
            overrides={overrides}
            highlight={query.trim().length > 1 ? query.trim() : undefined}
            showEmail={showEmail}
            onClose={() => setThread(null)}
          />
        ) : null}

        {dragging ? (
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="rounded-xl border-2 border-dashed border-white px-10 py-8 text-center text-white">
              <Upload className="mx-auto mb-2 size-7" />
              <p className="font-bold">Déposez un .json ou un annuaire</p>
            </div>
          </div>
        ) : null}

        <NamesDialog
          key={namesOpen ? "names-open" : "names-closed"}
          open={namesOpen}
          onOpenChange={setNamesOpen}
          ids={meta.participants}
          directory={directory}
          overrides={overrides}
          candidates={unknown.candidates}
          onSave={saveOverrides}
        />
      </div>
    </>
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
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      className="flex w-full max-w-[420px] shrink-0 flex-col border-l"
      style={{ background: "var(--slack-bg)", borderColor: "var(--slack-border)" }}
    >
      <header
        className="flex h-[49px] shrink-0 items-center gap-2 border-b px-4"
        style={{ borderColor: "var(--slack-border)" }}
      >
        <div className="min-w-0">
          <p className="text-[15px] font-black" style={{ color: "var(--slack-fg)" }}>
            Fil de discussion
          </p>
          <p className="truncate text-[11px]" style={{ color: "var(--slack-fg-muted)" }}>
            {channelName}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          onClick={onClose}
          title="Fermer le fil (Échap)"
        >
          <X />
        </Button>
      </header>

      <div className="slack-scroll slack-thread-panel flex-1 overflow-y-auto py-3">
        <Message
          message={{ ...thread, grouped: false }}
          directory={directory}
          overrides={overrides}
          highlight={highlight}
          showEmail={showEmail}
          inThread
        />

        <div className="relative my-3 px-4">
          <div
            className="absolute inset-x-4 top-1/2 h-px"
            style={{ background: "var(--slack-border)" }}
          />
          <div className="relative flex">
            <span
              className="pr-3 text-[13px] font-bold"
              style={{ background: "var(--slack-bg)", color: "var(--slack-fg-muted)" }}
            >
              {thread.replyCount} réponse{thread.replyCount > 1 ? "s" : ""}
            </span>
          </div>
        </div>

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
  );
}

/* -------------------------------------------------------------------------- */
/*  Manual name mapping                                                        */
/* -------------------------------------------------------------------------- */

function NamesDialog({
  open,
  onOpenChange,
  ids,
  directory,
  overrides,
  candidates,
  onSave,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  ids: string[];
  directory: UserDirectory;
  overrides: Record<string, string>;
  candidates: string[];
  onSave: (next: Record<string, string>) => void;
}) {
  const [draft, setDraft] = React.useState<Record<string, string>>(overrides);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Noms des participants</DialogTitle>
          <DialogDescription>
            Les identifiants absents de l&apos;annuaire peuvent être nommés à la
            main. Ces noms sont conservés dans ce navigateur et repris dans
            l&apos;export HTML.
          </DialogDescription>
        </DialogHeader>

        <datalist id="name-candidates">
          {candidates.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
          {ids.map((id) => {
            const user = resolveUser(id, directory, draft);
            return (
              <div key={id} className="flex items-center gap-3">
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-[4px] text-[11px] font-bold text-white"
                  style={{ background: user.color }}
                >
                  {user.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <Input
                    value={draft[id] ?? directory[id]?.name ?? ""}
                    placeholder={id}
                    list={directory[id] ? undefined : "name-candidates"}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, [id]: e.target.value }))
                    }
                  />
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {id}
                    {directory[id]?.email ? ` · ${directory[id]?.email}` : ""}
                    {directory[id] ? "" : " · non trouvé dans l'annuaire"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={() => {
              const cleaned = Object.fromEntries(
                Object.entries(draft).filter(([, v]) => v.trim().length > 0)
              );
              onSave(cleaned);
              onOpenChange(false);
            }}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
