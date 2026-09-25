"use client";

import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Circle,
  CircleAlert,
  CircleCheck,
  FileText,
  FolderOpen,
  HardDrive,
  Info,
  Loader,
  LogOut,
  Plug,
  Plus,
  Puzzle,
  RefreshCw,
  ShieldCheck,
  SkipForward,
  Upload,
  Users,
} from "lucide-react";

import { ConversationIcon } from "@/components/app/library-view";
import {
  CheckBox,
  CheckboxRow,
  ErrorBanner,
  LqButton,
  PageTitle,
  SearchField,
  SectionTitle,
  Tag,
} from "@/components/app/ui";
import { readFiles, type ReadFiles } from "@/lib/app/files";
import { rememberUnresolvable, unresolvableIds } from "@/lib/app/unresolvable";
import { INTL_TAGS } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages";
import { useI18n } from "@/lib/i18n/react";
import {
  FILES_ARCHIVE_ID,
  loadConversation,
  loadImages,
  saveConversations,
  saveImage,
  slackArchiveId,
  updateImageStats,
  type Archive,
} from "@/lib/library/store";
import { toImported } from "@/lib/library/summary";
import { knownThreads, reuseReplies } from "@/lib/slack/api-core";
import { collectScreenshots } from "@/lib/slack/screenshots";
import {
  BridgeClientError,
  fetchStatus,
  logoutWorkspace,
  runJob,
} from "@/lib/slack/bridge-client";
import type { BridgeStatus, ChannelSummary, RunRequest } from "@/lib/slack/bridge-types";
import {
  ExtensionError,
  extensionTeams,
  extensionVersion,
  type ExtensionTeam,
} from "@/lib/slack/extension-client";
import { bridgeSource, extensionSource, type SlackSource } from "@/lib/slack/sources";
import { parseConversation } from "@/lib/slack/parse";
import { parseUserDirectory } from "@/lib/slack/users";
import type { SlackConversation, UserDirectory } from "@/lib/slack/types";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Helpers (kept from the former connection panel)                            */
/* -------------------------------------------------------------------------- */

type Step = "source" | "slack" | "pick" | "run" | "done" | "files";

/** Slack IDs as they appear in a dump: quoted fields, and `<@U…>` mentions. */
const QUOTED_ID = /"([UWB][A-Z0-9]{6,})"/g;
const MENTION_ID = /<@([UWB][A-Z0-9]{6,})[|>]/g;

/**
 * Collects the people who actually appear in a conversation, so only they get
 * resolved — the workspace directory has tens of thousands of accounts.
 */
function collectUserIds(conversation: unknown, into: Set<string>) {
  const raw = JSON.stringify(conversation) ?? "";
  for (const m of raw.matchAll(QUOTED_ID)) into.add(m[1]);
  for (const m of raw.matchAll(MENTION_ID)) into.add(m[1]);
}

/** A DM is named after the other person, as in Slack, once the directory knows them. */
function channelLabel(c: ChannelSummary, m: Messages, directory: UserDirectory): string {
  if (c.name) return c.name;
  if (c.isIM) {
    if (!c.user) return m.connect.directMessage;
    return directory[c.user]?.name ?? `${m.connect.directMessage} · ${c.user}`;
  }
  return c.id;
}

/** How to install the browser extension, until it is on the Chrome Web Store. */
const EXTENSION_HELP_URL =
  "https://github.com/amine-abdelli/slack-json-viewer/blob/main/extension/README.md";

/** The list renders at most this many rows; the filter narrows the rest. */
const MAX_VISIBLE_CHANNELS = 400;

/** Name (`#general`), ID (`C0123ABCD`) or a pasted Slack link, lower-cased. */
function channelQuery(raw: string): string {
  let q = raw.trim();
  const link = q.match(/\/archives\/([A-Za-z0-9]+)/);
  if (link) q = link[1];
  return q.replace(/^[#@]/, "").toLowerCase();
}

/** 0 = exact ID, 1 = name starts with the query, 2 = contains it, -1 = no match. */
function channelRank(c: ChannelSummary, q: string, m: Messages, directory: UserDirectory): number {
  const id = c.id.toLowerCase();
  const label = channelLabel(c, m, directory).toLowerCase();
  if (id === q) return 0;
  if (label.startsWith(q)) return 1;
  if (label.includes(q) || id.includes(q) || (c.user?.toLowerCase().includes(q) ?? false)) return 2;
  return -1;
}

function kindOf(c: ChannelSummary) {
  return c.isIM ? "dm" : c.isMPIM ? "group-dm" : c.isPrivate ? "private" : "channel";
}

interface RunLine {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error" | "skipped";
  right?: string;
}

interface DoneStats {
  archiveId: string;
  firstId?: string;
  workspace: string;
  conversations: number;
  messages: number;
  threads: number;
  people: number;
  /** Screenshots kept, when the import fetched any. */
  images?: number;
  bytes: number;
  at: number;
}

/* -------------------------------------------------------------------------- */
/*  Import wizard                                                              */
/* -------------------------------------------------------------------------- */

/** Screenshots downloaded a few at a time: files are not Web API calls, but Slack still paces them. */
const IMAGE_CONCURRENCY = 4;

/**
 * Downloads the screenshots of one conversation that the library does not
 * have yet — an update only fetches the new ones. One that Slack will not serve
 * is counted as missing; the message keeps its card and link.
 */
async function importImages(
  src: SlackSource,
  archiveId: string,
  conversationId: string,
  raw: unknown,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<{ total: number; kept: number; missing: number; outdated: boolean }> {
  const refs = collectScreenshots((raw ?? {}) as { messages?: unknown });
  if (refs.length === 0) return { total: 0, kept: 0, missing: 0, outdated: false };
  const have = await loadImages(archiveId, conversationId).catch(() => new Map<string, Blob>());
  const todo = refs.filter((r) => !have.has(r.id));
  let kept = refs.length - todo.length;
  let missing = 0;
  let done = kept;
  let outdated = false;
  onProgress(done, refs.length);

  let next = 0;
  const worker = async () => {
    while (!outdated && !signal.aborted) {
      const ref = todo[next++];
      if (!ref) return;
      try {
        const blob = await src.image(ref.url, signal);
        if (blob) {
          await saveImage(archiveId, conversationId, ref.id, blob);
          kept += 1;
        } else {
          missing += 1;
        }
      } catch (err) {
        if (signal.aborted) throw err;
        // An extension from before images existed answers "unknown_message".
        if (err instanceof ExtensionError && /unknown_message/.test(err.message)) outdated = true;
        else missing += 1;
      }
      done += 1;
      onProgress(done, refs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, todo.length) }, worker));
  if (signal.aborted) throw new Error("aborted");
  return { total: refs.length, kept, missing, outdated };
}

/** DM partners looked up per request while the channel list is shown. */
const DM_BATCH = 25;

export function ImportView({
  bridge,
  onBridgeChange,
  archives,
  pendingFiles,
  onPendingConsumed,
  onPickFiles,
  directory,
  applyDirectory,
  onImported,
  onOpen,
}: {
  bridge: BridgeStatus | null;
  onBridgeChange: (status: BridgeStatus) => void;
  /** To flag the conversations already imported: those are updated, not refetched. */
  archives: Archive[];
  pendingFiles: File[] | null;
  onPendingConsumed: () => void;
  onPickFiles: () => void;
  /** People already known: not asked of Slack again. */
  directory: UserDirectory;
  applyDirectory: (dir: UserDirectory, name: string) => void;
  onImported: () => Promise<Archive[]>;
  onOpen: (archiveId: string, conversationId?: string) => void;
}) {
  const i18n = useI18n();
  const { locale, m, t, p, fmt } = i18n;
  const directorySize = Object.keys(directory).length;
  const [step, setStep] = React.useState<Step>("source");
  const [path, setPath] = React.useState<"slack" | "file">("slack");

  /* ------------------------------------------------------ busy & errors */

  const [busy, setBusy] = React.useState<string | null>(null);
  const [logs, setLogs] = React.useState<string[]>([]);
  const [error, setError] = React.useState<{ message: string; detail?: string } | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => abortRef.current?.abort(), []);

  const pushLog = React.useCallback((line: string) => {
    setLogs((prev) => (prev.length > 200 ? [...prev.slice(-200), line] : [...prev, line]));
  }, []);

  const toError = React.useCallback(
    (err: unknown) =>
      err instanceof BridgeClientError
        ? { message: err.message, detail: err.detail }
        : err instanceof ExtensionError
          ? { message: t(m.importer.extError, { error: err.message }) }
          : { message: err instanceof Error ? err.message : m.common.unexpectedError },
    [m, t],
  );

  /** Wraps a job with the shared busy / log / error handling. */
  const withBusy = React.useCallback(
    async <T,>(label: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T | null> => {
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(label);
      setError(null);
      setLogs([]);
      try {
        return await fn(controller.signal);
      } catch (err) {
        if (controller.signal.aborted) return null;
        setError(toError(err));
        return null;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setBusy(null);
      }
    },
    [toError],
  );

  /* ------------------------------------------------------------- Slack */

  const [workspace, setWorkspace] = React.useState("");
  const [addingWorkspace, setAddingWorkspace] = React.useState(false);
  const connected = (bridge?.workspaces.length ?? 0) > 0;
  const showSignInForm = !connected || addingWorkspace;
  const [token, setToken] = React.useState("");
  const [cookie, setCookie] = React.useState("");

  const [channels, setChannels] = React.useState<ChannelSummary[]>([]);
  const [filter, setFilter] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [withUsers, setWithUsers] = React.useState(true);
  const [withImages, setWithImages] = React.useState(true);
  const [imagesNotice, setImagesNotice] = React.useState<string | null>(null);
  const [memberOnly, setMemberOnly] = React.useState(true);

  /** Where the conversations are read from, once a workspace is picked. */
  const [source, setSource] = React.useState<SlackSource | null>(null);

  /** The latest directory, for callbacks that must not re-run when it changes. */
  const directoryRef = React.useRef(directory);
  React.useEffect(() => {
    directoryRef.current = directory;
  }, [directory]);

  /*
   * DMs only carry the other person's ID. Those the directory does not know
   * yet are looked up in the background, a batch at a time, so names replace
   * IDs in the list as they arrive. Asked once: found names join the
   * directory, unknown IDs are remembered as unresolvable.
   */
  const dmLookup = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => dmLookup.current?.abort(), []);
  const resolveDmNames = React.useCallback(
    (src: SlackSource, list: ChannelSummary[]) => {
      dmLookup.current?.abort();
      const skip = unresolvableIds(src.workspace);
      const ids = [
        ...new Set(list.filter((c) => c.isIM && c.user).map((c) => c.user!)),
      ].filter((id) => !directoryRef.current[id] && !skip.has(id));
      if (ids.length === 0) return;
      const controller = new AbortController();
      dmLookup.current = controller;
      void (async () => {
        for (let i = 0; i < ids.length && !controller.signal.aborted; i += DM_BATCH) {
          const batch = ids.slice(i, i + DM_BATCH);
          try {
            const users = await src.users(batch, () => {}, controller.signal);
            const dir = parseUserDirectory(JSON.stringify(users ?? []));
            if (Object.keys(dir).length > 0) applyDirectory(dir, `${src.workspace}.slack.com`);
            rememberUnresolvable(
              src.workspace,
              batch.filter((id) => !dir[id]),
            );
          } catch {
            return; // signed out, rate limited for good, or left the page: IDs stay
          }
        }
      })();
    },
    [applyDirectory],
  );

  const loadChannels = React.useCallback(
    async (src: SlackSource, onlyMine: boolean) => {
      const list = await withBusy(m.connect.busyChannels, (signal) =>
        src.channels(onlyMine, pushLog, signal),
      );
      if (!list) return;
      setSource(src);
      setWorkspace(src.workspace);
      setChannels(list);
      resolveDmNames(src, list);
      setFilter("");
      setStep("pick");
    },
    [m, pushLog, withBusy, resolveDmNames],
  );

  /* ---------------------------------------------------------- extension */

  type ExtState =
    | { state: "checking" }
    | { state: "missing" }
    | { state: "reading" }
    | { state: "ready"; teams: ExtensionTeam[] }
    | { state: "empty" }
    | { state: "error"; message: string };
  const [ext, setExt] = React.useState<ExtState>({ state: "checking" });

  /** Looks for the extension, then for the Slack workspaces signed in to this browser. */
  const checkExtension = React.useCallback(async () => {
    setExt({ state: "checking" });
    const version = await extensionVersion();
    if (!version) return setExt({ state: "missing" });
    setExt({ state: "reading" });
    try {
      let teams = await extensionTeams(false);
      // No Slack tab open: the extension opens one in the background to read it.
      if (teams.length === 0) teams = await extensionTeams(true);
      setExt(teams.length ? { state: "ready", teams } : { state: "empty" });
    } catch (err) {
      setExt({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const openTeam = (team: ExtensionTeam) => {
    setSelected(new Set());
    void loadChannels(extensionSource(team, i18n), memberOnly);
  };

  const handleAuth = React.useCallback(async () => {
    const wsp = workspace.trim();
    if (!wsp) return setError({ message: m.connect.missingWorkspace });
    if (!token.trim()) return setError({ message: m.connect.missingToken });
    const job: RunRequest = {
      action: "auth-token",
      workspace: wsp,
      token: token.trim(),
      cookie: cookie.trim(),
    };
    const res = await withBusy(m.connect.busySignIn, (signal) =>
      runJob<{ workspace: string }>(job, pushLog, signal),
    );
    if (!res) return;
    setToken("");
    setCookie("");
    setAddingWorkspace(false);
    const next = await fetchStatus();
    if (next) onBridgeChange(next);
    await loadChannels(bridgeSource(res.workspace), memberOnly);
  }, [m, workspace, token, cookie, memberOnly, withBusy, pushLog, onBridgeChange, loadChannels]);

  const openWorkspace = (wsp: string) => {
    setSelected(new Set());
    void loadChannels(bridgeSource(wsp), memberOnly);
  };

  const forget = async (wsp: string) => {
    await logoutWorkspace(wsp);
    const next = await fetchStatus();
    if (next) onBridgeChange(next);
  };

  const { visibleChannels, matchCount } = React.useMemo(() => {
    const q = channelQuery(filter);
    const ranked = channels
      .map((c) => ({ c, rank: q ? channelRank(c, q, m, directory) : 2 }))
      .filter(({ rank }) => rank >= 0)
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        if (a.c.isArchived !== b.c.isArchived) return a.c.isArchived ? 1 : -1;
        return channelLabel(a.c, m, directory).localeCompare(
          channelLabel(b.c, m, directory),
          INTL_TAGS[locale],
        );
      });
    return {
      visibleChannels: ranked.slice(0, MAX_VISIBLE_CHANNELS).map(({ c }) => c),
      matchCount: ranked.length,
    };
  }, [channels, filter, m, locale, directory]);


  const inLibrary = React.useMemo(() => {
    const archive = source ? archives.find((a) => a.id === slackArchiveId(source.workspace)) : null;
    return new Set(archive?.conversations.map((c) => c.id) ?? []);
  }, [archives, source]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* --------------------------------------------------------- import run */

  const [lines, setLines] = React.useState<RunLine[]>([]);
  const [runError, setRunError] = React.useState<{ label: string; message: string; detail?: string } | null>(
    null,
  );
  const decision = React.useRef<((choice: "retry" | "skip") => void) | null>(null);
  const [done, setDone] = React.useState<DoneStats | null>(null);

  const setLine = (id: string, patch: Partial<RunLine>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const startImport = async () => {
    const src = source;
    if (!src) return;
    const wsp = src.workspace;
    const picked = channels.filter((c) => selected.has(c.id));
    if (picked.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    const initial: RunLine[] = picked.map((c) => ({ id: c.id, label: channelLabel(c, m, directory), status: "pending" }));
    if (withUsers) initial.push({ id: "__users", label: m.importer.resolving, status: "pending" });
    setLines(initial);
    setRunError(null);
    setError(null);
    setStep("run");

    const ids = new Set<string>();
    const imported: { id: string; data: SlackConversation }[] = [];
    let archive: Archive | null = null;
    /** Turned off for the rest of the run when the extension is too old to fetch files. */
    let imagesAllowed = true;
    setImagesNotice(null);

    try {
      for (const channel of picked) {
        let finished = false;
        while (!finished) {
          setLine(channel.id, { status: "running", right: undefined });
          try {
            // Already in the library: only the threads that moved are fetched.
            const previous = await loadConversation(slackArchiveId(wsp), channel.id).catch(
              () => null,
            );
            const known = previous ? knownThreads(previous) : undefined;
            const raw = await src.dump(
              channel.id,
              (line) => setLine(channel.id, { right: line }),
              signal,
              known && Object.keys(known).length > 0 ? known : undefined,
            );
            if (previous && raw && typeof raw === "object") {
              reuseReplies(raw as Parameters<typeof reuseReplies>[0], previous);
            }
            const data = parseConversation(raw, `${channel.name || channel.id}.json`);
            if (!data.channel_id || data.channel_id === "unknown") data.channel_id = channel.id;
            if (!data.name) data.name = channel.name || channel.user || channel.id;
            collectUserIds(raw, ids);
            archive = await saveConversations(
              { id: slackArchiveId(wsp), source: "slack", workspace: wsp },
              [toImported(data, channel)],
            );
            imported.push({ id: data.channel_id, data });
            let right = p(m.viewer.messages, data.messages.length);
            if (withImages && imagesAllowed) {
              const images = await importImages(src, archive.id, channel.id, raw, signal, (done, total) =>
                setLine(channel.id, { right: t(m.importer.imagesProgress, { done, total }) }),
              );
              if (images.outdated) {
                imagesAllowed = false;
                setImagesNotice(m.importer.extensionOutdated);
              }
              if (images.total > 0) {
                archive = (await updateImageStats(archive.id, channel.id)) ?? archive;
                right += ` · ${p(m.importer.images, images.kept)}`;
                if (images.missing > 0) right += ` · ${p(m.importer.imagesMissing, images.missing)}`;
              }
            }
            setLine(channel.id, { status: "done", right });
            finished = true;
          } catch (err) {
            if (signal.aborted) throw err;
            setLine(channel.id, { status: "error", right: undefined });
            setRunError({ label: channelLabel(channel, m, directory), ...toError(err) });
            const choice = await new Promise<"retry" | "skip">((resolve) => {
              decision.current = resolve;
            });
            decision.current = null;
            setRunError(null);
            if (choice === "skip") {
              setLine(channel.id, { status: "skipped", right: m.importer.skipped });
              finished = true;
            }
          }
        }
      }

      if (withUsers && ids.size > 0) {
        // Only the IDs never seen: people already in the directory (deactivated
        // accounts included — they will not change) and IDs Slack could not
        // resolve last time are not asked again.
        const skip = unresolvableIds(wsp);
        const wanted = [...ids].filter((id) => !directory[id] && !skip.has(id));
        const known = ids.size - wanted.length;
        const summary = (fetched: number) =>
          [
            fetched > 0 || known === 0 ? p(m.importer.people, fetched) : null,
            known > 0 ? p(m.importer.peopleKnown, known) : null,
          ]
            .filter(Boolean)
            .join(" · ");
        setLine("__users", { status: "running" });
        try {
          if (wanted.length === 0) {
            setLine("__users", { status: "done", right: summary(0) });
          } else {
            const users = await src.users(
              wanted,
              (line) => setLine("__users", { right: line }),
              signal,
            );
            const dir = parseUserDirectory(JSON.stringify(users ?? []));
            if (Object.keys(dir).length > 0) applyDirectory(dir, `${wsp}.slack.com`);
            rememberUnresolvable(
              wsp,
              wanted.filter((id) => !dir[id]),
            );
            setLine("__users", { status: "done", right: summary(Object.keys(dir).length) });
          }
        } catch (err) {
          if (signal.aborted) throw err;
          setLine("__users", { status: "error", right: toError(err).message });
        }
      } else if (withUsers) {
        setLine("__users", { status: "skipped" });
      }

      await onImported();
      const people = new Set(imported.flatMap(({ data }) => toImported(data).summary.participants));
      const final = archive as Archive | null;
      setDone({
        archiveId: slackArchiveId(wsp),
        firstId: imported[0]?.id,
        workspace: wsp,
        conversations: imported.length,
        messages: imported.reduce((s, c) => s + c.data.messages.length, 0),
        threads: imported.reduce((s, c) => s + toImported(c.data).summary.threadCount, 0),
        people: people.size,
        bytes: final
          ? final.conversations
              .filter((c) => imported.some((i) => i.id === c.id))
              .reduce((s, c) => s + c.bytes + (c.imageBytes ?? 0), 0)
          : 0,
        images: final
          ? final.conversations
              .filter((c) => imported.some((i) => i.id === c.id))
              .reduce((s, c) => s + (c.imageCount ?? 0), 0)
          : 0,
        at: Date.now(),
      });
      setStep("done");
    } catch {
      // cancelled: whatever was imported so far is kept
      await onImported();
      setStep("pick");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const cancelImport = () => {
    abortRef.current?.abort();
    decision.current?.("skip");
  };

  /* -------------------------------------------------------------- files */

  const [files, setFiles] = React.useState<ReadFiles | null>(null);
  const [dirState, setDirState] = React.useState<"none" | "skipped">("none");
  const dirInput = React.useRef<HTMLInputElement>(null);

  /** Sorts what was read: conversations go to the directory step. */
  const showFiles = React.useCallback(
    (read: ReadFiles) => {
      setPath("file");
      setError(null);
      if (read.conversations.length === 0 && read.directories.length === 0) {
        setFiles(read);
        setStep("source");
        return;
      }
      setFiles((prev) =>
        prev && step === "files"
          ? {
              conversations: [...prev.conversations, ...read.conversations],
              directories: [...prev.directories, ...read.directories],
              errors: [...prev.errors, ...read.errors],
            }
          : read,
      );
      setDirState("none");
      setStep("files");
    },
    [step],
  );

  const takeFiles = async (list: File[]) => showFiles(await readFiles(list));

  React.useEffect(() => {
    if (!pendingFiles) return;
    // Consuming the files clears them in the parent, which re-runs this
    // effect: the read must survive that, so it is not cancelled.
    onPendingConsumed();
    void readFiles(pendingFiles).then(showFiles);
    // Only new files matter; `showFiles` changes with the step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFiles, onPendingConsumed]);

  const importFiles = async () => {
    if (!files) return;
    for (const d of files.directories) applyDirectory(d.directory, d.file);
    if (files.conversations.length === 0) {
      setFiles(null);
      setStep("source");
      return;
    }
    const archive = await saveConversations(
      { id: FILES_ARCHIVE_ID, source: "file", workspace: "" },
      files.conversations.map((c) => toImported(c.data)),
    );
    await onImported();
    const convs = files.conversations.map((c) => toImported(c.data).summary);
    setDone({
      archiveId: archive.id,
      firstId: convs[0]?.id,
      workspace: "",
      conversations: convs.length,
      messages: convs.reduce((s, c) => s + c.messageCount, 0),
      threads: convs.reduce((s, c) => s + c.threadCount, 0),
      people: new Set(convs.flatMap((c) => c.participants)).size,
      bytes: files.conversations.reduce((s, c) => s + c.bytes, 0),
      at: Date.now(),
    });
    setFiles(null);
    setStep("done");
  };

  /* ------------------------------------------------------------ stepper */

  const slackSteps: { key: Step; label: string; sub?: string }[] = [
    { key: "source", label: m.importer.stepSource, sub: "Slack" },
    { key: "slack", label: m.importer.stepConnection, sub: workspace ? `${workspace}.slack.com` : undefined },
    {
      key: "pick",
      label: m.importer.stepConversations,
      sub: selected.size ? p(m.importer.selectedCount, selected.size) : undefined,
    },
    {
      key: "run",
      label: m.importer.stepImport,
      sub: lines.length
        ? `${lines.filter((l) => l.status === "done").length}/${lines.length}`
        : undefined,
    },
    { key: "done", label: m.importer.stepDone },
  ];
  const fileSteps: { key: Step; label: string; sub?: string }[] = [
    { key: "source", label: m.importer.stepSource, sub: m.app.fileSource },
    { key: "files", label: m.importer.stepDirectory, sub: m.importer.optional },
    { key: "done", label: m.importer.stepDone },
  ];
  const steps = path === "file" ? fileSteps : slackSteps;
  const currentIndex = Math.max(0, steps.findIndex((s) => s.key === step));

  const lastLog = logs[logs.length - 1];
  const busyBox = busy ? (
    <div className="rounded-[8px] border border-border bg-surface px-3.5 py-2.5">
      <p className="m-0 flex items-center gap-2 text-[13px] font-medium">
        <Loader className="size-4 animate-spin text-brand-text" />
        {busy}
      </p>
      {lastLog ? (
        <p className="mt-1 mb-0 line-clamp-2 font-mono text-[12px] break-all text-fg-3" title={lastLog}>
          {lastLog}
        </p>
      ) : null}
    </div>
  ) : null;
  const errorBox = error ? <ErrorBanner title={error.message} detail={error.detail} /> : null;

  /* --------------------------------------------------------------- view */

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-[248px] shrink-0 flex-col gap-[22px] border-r border-border bg-surface px-5 py-7 lg:flex">
        <div className="text-[12px] font-semibold text-fg-3">
          {path === "file" ? m.importer.pathFile : m.importer.pathSlack}
        </div>
        <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
          {steps.map((s, i) => {
            const isDone = i < currentIndex || step === "done";
            const isCurrent = i === currentIndex && step !== "done";
            return (
              <li key={s.key} className="flex gap-3 py-1.5">
                <span
                  className={cn(
                    "grid size-[22px] shrink-0 place-items-center rounded-full border-[1.5px] text-[11px] font-semibold",
                    isDone && "border-success bg-success-soft text-success",
                    isCurrent && "border-brand bg-brand text-brand-fg",
                    !isDone && !isCurrent && "border-border-strong bg-surface text-fg-3",
                  )}
                >
                  {isDone ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className="flex min-w-0 flex-col pt-px">
                  <span className={cn("text-[13px]", isCurrent ? "font-semibold text-fg" : "text-fg-2")}>
                    {s.label}
                  </span>
                  {s.sub ? <span className="truncate text-[12px] text-fg-3">{s.sub}</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="flex-1" />
        <p className="m-0 flex gap-2 text-[12px] leading-normal text-fg-3">
          <ShieldCheck className="mt-px size-3.5 shrink-0" />
          {m.importer.privacy}
        </p>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto">
        <div className="flex max-w-[780px] flex-col gap-6 px-4 py-6 sm:px-10 sm:py-8">
          {/* ---------------------------------------------------- source */}
          {step === "source" ? (
            <>
              <PageTitle title={m.importer.sourceTitle} subtitle={m.importer.sourceSubtitle} />
              {files?.errors.map((e) => (
                <ErrorBanner
                  key={e.file}
                  title={e.message(i18n)}
                  onDismiss={() => setFiles(null)}
                  dismissLabel={m.common.clear}
                />
              ))}
              <div className="flex flex-col gap-[18px] rounded-[12px] border-[1.5px] border-brand bg-surface p-6 shadow-1">
                <div className="flex items-start gap-4">
                  <div className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-brand-soft text-brand-text">
                    <Plug className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="m-0 text-[17px] font-semibold">{m.importer.slackTitle}</h2>
                      <Tag tone="brand">{m.importer.recommended}</Tag>
                    </div>
                    <p className="mt-1.5 mb-0 text-fg-2 [text-wrap:pretty]">{m.importer.slackBody}</p>
                  </div>
                </div>
                <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-5 gap-y-2 p-0 text-[13px] text-fg-2">
                  {m.importer.slackPoints.map((point) => (
                    <li key={point} className="flex items-center gap-2">
                      <Check className="size-3.5 text-success" />
                      {point}
                    </li>
                  ))}
                </ul>
                <div>
                  <LqButton
                    size="lg"
                    onClick={() => {
                      setPath("slack");
                      setError(null);
                      setStep("slack");
                      void checkExtension();
                    }}
                  >
                    {m.importer.continueSlack}
                    <ArrowRight />
                  </LqButton>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-3">
                <span>{m.importer.soon}</span>
                <Tag tone="dashed">WhatsApp</Tag>
                <Tag tone="dashed">Microsoft Teams</Tag>
                <Tag tone="dashed">Discord</Tag>
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-[18px]">
                <LqButton variant="secondary" size="sm" onClick={onPickFiles}>
                  <FolderOpen />
                  {m.importer.openFile}
                </LqButton>
                <span className="text-[12px] text-fg-3">{m.importer.openFileHint}</span>
              </div>
            </>
          ) : null}

          {/* ----------------------------------------------------- Slack */}
          {step === "slack" ? (
            <>
              <BackLink onClick={() => setStep("source")} label={m.common.back} />
              <PageTitle title={m.importer.connectTitle} subtitle={m.importer.connectSubtitle} />

              <ExtensionCard
                ext={ext}
                busy={Boolean(busy)}
                onRetry={() => void checkExtension()}
                onOpen={openTeam}
              />

              <section className="flex flex-col gap-5">
                <header>
                  <h2 className="m-0 text-[13px] font-semibold text-fg-2">{m.importer.otherMethods}</h2>
                  <p className="m-0 text-[12px] text-fg-3">{m.importer.otherMethodsHint}</p>
                </header>
                {!bridge?.available ? (
                  <p className="m-0 rounded-[6px] bg-info-soft px-3 py-2 text-[13px] text-fg-2">
                    {m.importer.bridgeOff}
                  </p>
                ) : (
                  <>
                  {connected ? (
                    <section className="flex flex-col gap-2.5">
                      <SectionTitle>{m.importer.connectedTitle}</SectionTitle>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2.5">
                        {bridge!.workspaces.map((w) => (
                          <div key={w} className="relative">
                            <button
                              type="button"
                              disabled={Boolean(busy)}
                              onClick={() => openWorkspace(w)}
                              className="flex w-full items-center gap-3 rounded-[10px] border border-border bg-surface py-3.5 pr-11 pl-3.5 text-left text-fg transition-shadow hover:border-brand-line hover:shadow-2 disabled:opacity-60"
                            >
                              <span className="grid size-10 shrink-0 place-items-center rounded-[8px] bg-surface-3 text-[17px] font-semibold uppercase">
                                {w.charAt(0)}
                              </span>
                              <span className="flex min-w-0 flex-col gap-px">
                                <span className="flex items-center gap-1.5 font-semibold">
                                  <span className="size-1.5 rounded-full bg-success" />
                                  {w}
                                </span>
                                <span className="font-mono text-[12px] text-fg-3">{w}.slack.com</span>
                                <span className="mt-1 text-[13px] font-medium text-brand-text">
                                  {m.connect.viewChannels} →
                                </span>
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void forget(w)}
                              title={m.connect.forget}
                              aria-label={t(m.connect.forgetNamed, { workspace: w })}
                              className="absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-[6px] text-fg-3 hover:bg-danger-soft hover:text-danger"
                            >
                              <LogOut className="size-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {!showSignInForm ? (
                    <LqButton
                      variant="dashed"
                      size="sm"
                      className="self-start"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        setWorkspace("");
                        setAddingWorkspace(true);
                      }}
                    >
                      <Plus />
                      {m.connect.addWorkspace}
                    </LqButton>
                  ) : (
                    <section className="overflow-hidden rounded-[12px] border border-border bg-surface">
                      <div className="flex flex-col gap-4 px-5 pt-5">
                        {connected ? (
                          <div className="flex items-center justify-between">
                            <span className="text-[13px] font-semibold text-fg-2">{m.connect.newWorkspace}</span>
                            <button
                              type="button"
                              onClick={() => setAddingWorkspace(false)}
                              className="text-[12px] text-fg-3 underline-offset-2 hover:text-fg hover:underline"
                            >
                              {m.connect.hide}
                            </button>
                          </div>
                        ) : null}
                        <label className="flex max-w-[420px] flex-col gap-1.5">
                          <span className="text-[13px] font-medium">{m.connect.workspace}</span>
                          <span className="flex h-9 items-center overflow-hidden rounded-[6px] border border-border-strong bg-surface focus-within:border-focus">
                            <input
                              value={workspace}
                              disabled={Boolean(busy)}
                              onChange={(e) => setWorkspace(e.target.value)}
                              placeholder="acme"
                              className="h-full min-w-0 flex-1 border-0 bg-transparent px-2.5 font-mono text-[14px] text-fg outline-none focus-visible:outline-none"
                            />
                            <span className="grid h-full place-items-center border-l border-border bg-surface-2 px-2.5 font-mono text-[13px] text-fg-3">
                              .slack.com
                            </span>
                          </span>
                        </label>
                      </div>
                      <div className="grid grid-cols-1 gap-5 px-5 pt-4 pb-5 md:grid-cols-[minmax(0,1fr)_260px]">
                        <div className="flex min-w-0 flex-col gap-3">
                              <span className="text-[13px] font-medium">{m.connect.tokenLabel}</span>
                              <input
                                className="h-9 rounded-[6px] border border-border-strong bg-surface px-2.5 font-mono text-[13px] text-fg outline-none focus:border-focus"
                                placeholder="xoxc-…"
                                autoComplete="off"
                                spellCheck={false}
                                value={token}
                                disabled={Boolean(busy)}
                                onChange={(e) => setToken(e.target.value)}
                                aria-label={m.connect.tokenLabel}
                              />
                              <input
                                className="h-9 rounded-[6px] border border-border-strong bg-surface px-2.5 font-mono text-[13px] text-fg outline-none focus:border-focus"
                                placeholder={m.connect.cookiePlaceholder}
                                autoComplete="off"
                                spellCheck={false}
                                value={cookie}
                                disabled={Boolean(busy)}
                                onChange={(e) => setCookie(e.target.value)}
                                aria-label={m.connect.cookiePlaceholder}
                              />
                              <p className="m-0 text-[12px] text-fg-3">{m.connect.tokenNotice}</p>
                          <div>
                            <LqButton disabled={Boolean(busy)} onClick={() => void handleAuth()}>
                              {m.connect.signIn}
                              <ArrowRight />
                            </LqButton>
                          </div>
                        </div>
                        <aside className="rounded-[8px] bg-surface-2 px-4 py-3.5 text-[13px] text-fg-2">
                          <div className="mb-2 flex items-center gap-1.5 font-semibold text-fg">
                            <Info className="size-3.5" />
                            {m.importer.howTo}
                          </div>
                          <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-[18px] leading-normal">
                            {m.connect.tokenHelp.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ol>
                        </aside>
                      </div>
                    </section>
                  )}
                  </>
                )}
              </section>
              {busy ? busyBox : null}
              {errorBox}
            </>
          ) : null}

          {/* ------------------------------------------------------ pick */}
          {step === "pick" ? (
            <>
              <BackLink onClick={() => setStep("slack")} label={m.common.back} />
              <PageTitle
                title={m.importer.pickTitle}
                subtitle={
                  <>
                    <span className="font-mono text-[13px]">{workspace}.slack.com</span>
                    <span>
                      · {p(memberOnly ? m.importer.countMember : m.importer.countAll, channels.length)}
                    </span>
                  </>
                }
              />
              <div className="flex flex-col gap-2">
                <SearchField
                  size="lg"
                  autoFocus
                  value={filter}
                  onChange={setFilter}
                  placeholder={m.importer.pickPlaceholder}
                  label={m.connect.filterLabel}
                  describedBy="lq-channel-hint"
                />
                <p id="lq-channel-hint" aria-live="polite" className="m-0 flex flex-wrap items-center gap-1.5 text-[12px] text-fg-3">
                  {filter.trim() ? (
                    p(m.connect.filterCount, matchCount, { total: fmt.number(channels.length) })
                  ) : (
                    <>
                      {m.importer.tryLabel}
                      <button
                        type="button"
                        onClick={() => setFilter("#general")}
                        className="rounded-[4px] border border-border bg-surface-2 px-[7px] py-0.5 font-mono text-[12px] text-fg-2"
                      >
                        #general
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilter("C0123ABCD")}
                        className="rounded-[4px] border border-border bg-surface-2 px-[7px] py-0.5 font-mono text-[12px] text-fg-2"
                      >
                        C0123ABCD
                      </button>
                      {m.importer.tryLink}
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-6">
                <CheckboxRow
                  checked={memberOnly}
                  disabled={Boolean(busy)}
                  onChange={(v) => {
                    setMemberOnly(v);
                    if (source) void loadChannels(source, v);
                  }}
                  label={m.connect.memberOnly}
                  hint={m.importer.memberOnlyHint}
                />
                <CheckboxRow
                  checked={withUsers}
                  onChange={setWithUsers}
                  label={m.connect.resolveNames}
                  hint={m.importer.resolveHint}
                />
                <CheckboxRow
                  checked={withImages}
                  onChange={setWithImages}
                  label={m.importer.withImages}
                  hint={m.importer.withImagesHint}
                />
              </div>
              {matchCount > MAX_VISIBLE_CHANNELS ? (
                <div className="flex items-center gap-2 rounded-[6px] bg-info-soft px-3 py-[9px] text-[13px] text-fg-2">
                  <Info className="size-3.5" />
                  {t(m.importer.capNotice, {
                    total: fmt.number(matchCount),
                    max: fmt.number(MAX_VISIBLE_CHANNELS),
                  })}
                </div>
              ) : null}
              {busyBox}
              {errorBox}
              <div className="overflow-hidden rounded-[10px] border border-border bg-surface">
                {visibleChannels.length === 0 ? (
                  <div className="px-5 py-10 text-center text-fg-2">
                    <div className="font-semibold text-fg">{m.connect.noChannel}</div>
                    <div className="mt-1 text-[13px]">{m.importer.noChannelHint}</div>
                  </div>
                ) : (
                  visibleChannels.map((c) => {
                    const on = selected.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        disabled={Boolean(busy)}
                        onClick={() => toggle(c.id)}
                        className={cn(
                          "flex min-h-11 w-full items-center gap-3 border-b border-border px-3.5 py-1.5 text-left text-fg last:border-b-0 disabled:opacity-60",
                          on ? "bg-brand-soft" : "hover:bg-surface-2",
                        )}
                      >
                        <CheckBox checked={on} />
                        <span className="w-4 text-center text-fg-3">
                          <ConversationIcon kind={kindOf(c)} />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5">
                          <span className="font-medium break-words">{channelLabel(c, m, directory)}</span>
                          <span className="font-mono text-[11.5px] text-fg-3">{c.id}</span>
                        </span>
                        {inLibrary.has(c.id) ? (
                          <span title={m.importer.inLibraryHint}>
                            <Tag tone="brand">{m.importer.inLibrary}</Tag>
                          </span>
                        ) : null}
                        {c.isArchived ? <Tag>{m.connect.archived}</Tag> : null}
                        {c.memberCount > 0 ? (
                          <span className="text-[12px] whitespace-nowrap text-fg-3 tabular-nums">
                            {p(m.importer.members, c.memberCount)}
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="sticky bottom-0 flex items-center gap-3 bg-bg py-3">
                <span className="flex-1 text-[13px] text-fg-2">
                  {selected.size ? p(m.importer.selectedCount, selected.size) : m.importer.noneSelected}
                  {visibleChannels.length > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          const all = visibleChannels.every((c) => next.has(c.id));
                          for (const c of visibleChannels) {
                            if (all) next.delete(c.id);
                            else next.add(c.id);
                          }
                          return next;
                        })
                      }
                      className="ml-3 text-[13px] font-medium text-brand-text"
                    >
                      {visibleChannels.every((c) => selected.has(c.id))
                        ? m.importer.unselectVisible
                        : m.importer.selectVisible}
                    </button>
                  ) : null}
                </span>
                <LqButton disabled={selected.size === 0 || Boolean(busy)} onClick={() => void startImport()}>
                  {p(m.importer.importButton, selected.size)}
                  <ArrowRight />
                </LqButton>
              </div>
            </>
          ) : null}

          {/* ------------------------------------------------------- run */}
          {step === "run" ? (
            <>
              <PageTitle
                title={m.importer.runTitle}
                subtitle={t(m.importer.runSubtitle, { workspace: `${workspace}.slack.com` })}
              />
              <div className="flex flex-col gap-4 rounded-[12px] border border-border bg-surface p-5">
                {(() => {
                  const finished = lines.filter((l) => l.status === "done" || l.status === "skipped").length;
                  const pct = lines.length ? Math.round((finished / lines.length) * 100) : 0;
                  return (
                    <div
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="h-1.5 overflow-hidden rounded-[3px] bg-surface-3"
                    >
                      <div
                        className={cn("h-full rounded-[3px] transition-[width]", runError ? "bg-danger" : "bg-brand")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  );
                })()}
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[13px]">
                  {lines.map((l) => (
                    <li
                      key={l.id}
                      className={cn(
                        "flex items-center gap-2.5",
                        l.status === "pending" ? "text-fg-3" : l.status === "error" ? "text-danger" : "text-fg",
                      )}
                    >
                      {l.status === "done" ? (
                        <CircleCheck className="size-[15px] shrink-0 text-success" />
                      ) : l.status === "running" ? (
                        <Loader className="size-[15px] shrink-0 animate-spin text-brand-text" />
                      ) : l.status === "error" ? (
                        <CircleAlert className="size-[15px] shrink-0" />
                      ) : l.status === "skipped" ? (
                        <SkipForward className="size-[15px] shrink-0 text-fg-3" />
                      ) : (
                        <Circle className="size-[15px] shrink-0 text-border-strong" />
                      )}
                      <span className="flex-1 tabular-nums">
                        {l.id === "__users" ? (
                          <Users className="mr-1.5 inline size-3.5 align-[-2px]" />
                        ) : null}
                        {l.label}
                      </span>
                      {l.right ? (
                        <span className="max-w-[50%] truncate font-mono text-[12px] text-fg-3" title={l.right}>
                          {l.right}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {imagesNotice ? (
                  <div className="flex items-center gap-2 rounded-[6px] bg-info-soft px-3 py-[9px] text-[13px] text-fg-2">
                    <Info className="size-3.5" />
                    {imagesNotice}
                  </div>
                ) : null}
                {runError ? (
                  <ErrorBanner
                    title={t(m.importer.runErrorTitle, { name: runError.label })}
                    detail={runError.detail}
                  >
                    <div className="mt-1 text-[13px] text-fg [text-wrap:pretty]">{runError.message}</div>
                    <div className="mt-2 flex gap-2">
                      <LqButton size="sm" onClick={() => decision.current?.("retry")}>
                        {m.importer.retry}
                      </LqButton>
                      <LqButton variant="secondary" size="sm" onClick={() => decision.current?.("skip")}>
                        {m.importer.skip}
                      </LqButton>
                    </div>
                  </ErrorBanner>
                ) : null}
                <div className="flex items-center justify-between gap-3 border-t border-border pt-3.5">
                  <span className="flex items-center gap-1.5 text-[12px] text-fg-3">
                    <HardDrive className="size-[13px]" />
                    {m.importer.writing}
                  </span>
                  <LqButton variant="secondary" size="sm" onClick={cancelImport}>
                    {m.importer.cancel}
                  </LqButton>
                </div>
              </div>
            </>
          ) : null}

          {/* ----------------------------------------------------- files */}
          {step === "files" && files ? (
            <>
              <BackLink
                onClick={() => {
                  setFiles(null);
                  setStep("source");
                }}
                label={m.common.back}
              />
              <PageTitle
                title={m.importer.filesTitle}
                badge={<Tag>{m.importer.optional}</Tag>}
                subtitle={m.importer.filesSubtitle}
              />
              {files.conversations.map((c) => (
                <div
                  key={c.file}
                  className="flex items-center gap-3 rounded-[8px] border border-border bg-surface px-3.5 py-3"
                >
                  <FileText className="size-[18px] text-fg-3" />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[13px] font-medium break-words">{c.file}</div>
                    <div className="text-[12px] text-fg-3">
                      {fmt.size(c.bytes)} · {p(m.viewer.messages, c.data.messages.length)}
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 text-[12px] text-success">
                    <CircleCheck className="size-[13px]" />
                    {m.importer.readable}
                  </span>
                </div>
              ))}
              {files.errors.map((e) => (
                <ErrorBanner key={e.file} title={e.message(i18n)} />
              ))}

              {files.directories.length > 0 ? (
                files.directories.map((d) => (
                  <div
                    key={d.file}
                    className="flex items-center gap-3 rounded-[8px] bg-success-soft px-4 py-3.5 text-success"
                  >
                    <Users className="size-[18px]" />
                    <div className="flex-1">
                      <div className="font-semibold">{m.importer.dirDetected}</div>
                      <div className="text-[13px] text-fg-2">
                        <span className="font-mono">{d.file}</span> ·{" "}
                        {p(m.importer.people, Object.keys(d.directory).length)}
                      </div>
                    </div>
                  </div>
                ))
              ) : dirState === "skipped" ? (
                <div className="flex items-center gap-3 rounded-[8px] bg-surface-2 px-4 py-3.5 text-fg-2">
                  <SkipForward className="size-4" />
                  <div className="flex-1 text-[13px]">{m.importer.dirSkipped}</div>
                  <button
                    type="button"
                    onClick={() => dirInput.current?.click()}
                    className="text-[13px] font-medium text-brand-text"
                  >
                    {m.importer.dirAddAnyway}
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3.5 rounded-[8px] border border-dashed border-border-strong p-4">
                  <div className="min-w-[240px] flex-1">
                    <div className="font-semibold">
                      {directorySize > 0
                        ? p(m.importer.dirKnown, directorySize)
                        : m.importer.dirNone}
                    </div>
                    <div className="text-[13px] text-fg-2">{m.importer.dirNoneHint}</div>
                  </div>
                  <LqButton variant="secondary" size="sm" onClick={() => dirInput.current?.click()}>
                    <Upload />
                    {m.importer.dirAdd}
                  </LqButton>
                </div>
              )}

              <div className="flex items-center gap-2.5">
                <LqButton onClick={() => void importFiles()}>
                  {files.conversations.length > 0 ? m.importer.importArchive : m.importer.addDirectory}
                  <ArrowRight />
                </LqButton>
                {files.directories.length === 0 && dirState !== "skipped" && files.conversations.length > 0 ? (
                  <LqButton variant="ghost" onClick={() => setDirState("skipped")}>
                    {m.importer.skipStep}
                  </LqButton>
                ) : null}
              </div>
              <input
                ref={dirInput}
                type="file"
                multiple
                accept=".json,.txt,.tsv,.csv"
                className="hidden"
                onChange={(e) => {
                  void takeFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </>
          ) : null}

          {/* ------------------------------------------------------ done */}
          {step === "done" && done ? (
            <>
              <div className="flex items-center gap-3.5">
                <div className="grid size-11 place-items-center rounded-full bg-success-soft text-success">
                  <Check className="size-[22px]" />
                </div>
                <div>
                  <h1 className="m-0 text-[22px] font-semibold tracking-[-.01em]">{m.importer.doneTitle}</h1>
                  <p className="mt-1 mb-0 text-fg-2">
                    {t(m.importer.doneSubtitle, {
                      archive: done.workspace || m.app.localFiles,
                      date: fmt.dayShort(new Date(done.at)),
                    })}
                  </p>
                </div>
              </div>
              <dl className="m-0 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] overflow-hidden rounded-[10px] border border-border bg-surface">
                {[
                  { k: m.importer.statConversations, v: fmt.number(done.conversations) },
                  { k: m.importer.statMessages, v: fmt.number(done.messages) },
                  { k: m.importer.statThreads, v: fmt.number(done.threads) },
                  { k: m.importer.statPeople, v: fmt.number(done.people) },
                  ...(done.images ? [{ k: m.importer.statImages, v: fmt.number(done.images) }] : []),
                  { k: m.importer.statSize, v: fmt.size(done.bytes) || "—" },
                  { k: m.importer.statWhere, v: m.app.onDevice },
                ].map((s) => (
                  <div key={s.k} className="-mr-px -mb-px border-r border-b border-border px-4 py-3.5">
                    <dt className="text-[12px] text-fg-3">{s.k}</dt>
                    <dd className="m-0 mt-1 text-[16px] font-semibold tabular-nums">{s.v}</dd>
                  </div>
                ))}
              </dl>
              {imagesNotice ? (
                <div className="flex items-center gap-2 rounded-[6px] bg-info-soft px-3 py-[9px] text-[13px] text-fg-2">
                  <Info className="size-3.5" />
                  {imagesNotice}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2.5">
                <LqButton size="lg" onClick={() => onOpen(done.archiveId, done.firstId)}>
                  {m.importer.openArchive}
                  <ArrowRight />
                </LqButton>
                <LqButton
                  variant="secondary"
                  size="lg"
                  onClick={() => {
                    setSelected(new Set());
                    setDone(null);
                    setStep(path === "slack" && channels.length ? "pick" : "source");
                  }}
                >
                  {m.importer.importMore}
                </LqButton>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}

/** The recommended way in: the Slack session already open in this browser. */
function ExtensionCard({
  ext,
  busy,
  onRetry,
  onOpen,
}: {
  ext:
    | { state: "checking" }
    | { state: "missing" }
    | { state: "reading" }
    | { state: "ready"; teams: ExtensionTeam[] }
    | { state: "empty" }
    | { state: "error"; message: string };
  busy: boolean;
  onRetry: () => void;
  onOpen: (team: ExtensionTeam) => void;
}) {
  const { m, t, p } = useI18n();
  const linkClass =
    "inline-flex h-9 items-center gap-2 rounded-[6px] px-4 text-[13px] font-medium whitespace-nowrap [&_svg]:size-3.5";

  return (
    <section className="flex flex-col gap-4 rounded-[12px] border-[1.5px] border-brand bg-surface p-5 shadow-1">
      <div className="flex items-start gap-3.5">
        <div className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-brand-soft text-brand-text">
          <Puzzle className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-[16px] font-semibold">{m.importer.extTitle}</h2>
            <Tag tone="brand">{m.importer.recommended}</Tag>
          </div>
          <p className="mt-1 mb-0 text-[13px] text-fg-2 [text-wrap:pretty]">{m.importer.extBody}</p>
        </div>
      </div>

      {ext.state === "checking" || ext.state === "reading" ? (
        <p className="m-0 flex items-center gap-2 text-[13px] text-fg-2">
          <Loader className="size-4 animate-spin text-brand-text" />
          {ext.state === "checking" ? m.importer.extChecking : m.importer.extReading}
        </p>
      ) : ext.state === "missing" ? (
        <>
          <ol className="m-0 flex list-decimal flex-col gap-1.5 rounded-[8px] bg-surface-2 py-3 pr-4 pl-8 text-[13px] leading-normal text-fg-2">
            {m.importer.extSteps.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <a
              href={EXTENSION_HELP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(linkClass, "bg-brand text-brand-fg hover:bg-brand-hover")}
            >
              <Puzzle />
              {m.importer.extInstall}
            </a>
            <LqButton variant="secondary" onClick={onRetry}>
              <RefreshCw />
              {m.importer.extRetry}
            </LqButton>
          </div>
        </>
      ) : ext.state === "empty" || ext.state === "error" ? (
        <>
          <div className="rounded-[8px] bg-warning-soft px-3.5 py-3 text-[13px]">
            <div className="font-semibold text-warning">
              {ext.state === "empty"
                ? m.importer.extNoSession
                : t(m.importer.extError, { error: ext.message })}
            </div>
            {ext.state === "empty" ? <div className="mt-0.5 text-fg-2">{m.importer.extNoSessionHint}</div> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {ext.state === "empty" ? (
              <a
                href="https://app.slack.com/client"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(linkClass, "bg-brand text-brand-fg hover:bg-brand-hover")}
              >
                {m.importer.extOpenSlack}
                <ArrowRight />
              </a>
            ) : null}
            <LqButton variant="secondary" onClick={onRetry}>
              <RefreshCw />
              {m.importer.extRetry}
            </LqButton>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-fg-3">{p(m.importer.extFound, ext.teams.length)}</span>
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1.5 text-[12px] text-fg-3 hover:text-fg"
            >
              <RefreshCw className="size-3" />
              {m.importer.extRefresh}
            </button>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2.5">
            {ext.teams.map((team) => (
              <button
                key={team.id}
                type="button"
                disabled={busy}
                onClick={() => onOpen(team)}
                className="flex w-full items-center gap-3 rounded-[10px] border border-border bg-surface p-3.5 text-left text-fg transition-shadow hover:border-brand-line hover:shadow-2 disabled:opacity-60"
              >
                {team.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={team.icon} alt="" className="size-10 shrink-0 rounded-[8px]" />
                ) : (
                  <span className="grid size-10 shrink-0 place-items-center rounded-[8px] bg-surface-3 text-[17px] font-semibold uppercase">
                    {team.name.charAt(0)}
                  </span>
                )}
                <span className="flex min-w-0 flex-col gap-px">
                  <span className="flex items-center gap-1.5 truncate font-semibold">
                    <span className="size-1.5 shrink-0 rounded-full bg-success" />
                    {team.name}
                  </span>
                  <span className="truncate font-mono text-[12px] text-fg-3">
                    {team.domain ? `${team.domain}.slack.com` : team.id}
                  </span>
                  <span className="mt-1 text-[13px] font-medium text-brand-text">
                    {m.connect.viewChannels} →
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mb-3 flex items-center gap-1.5 self-start text-[13px] text-fg-3 hover:text-fg"
    >
      <ArrowLeft className="size-3.5" />
      {label}
    </button>
  );
}
