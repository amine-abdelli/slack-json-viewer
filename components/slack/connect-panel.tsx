"use client";

import * as React from "react";
import {
  ArrowLeft,
  Check,
  Hash,
  Loader2,
  Lock,
  LogOut,
  MessageSquare,
  Search,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BridgeClientError,
  fetchStatus,
  logoutWorkspace,
  runJob,
} from "@/lib/slack/bridge-client";
import type {
  BridgeStatus,
  ChannelSummary,
  RunRequest,
} from "@/lib/slack/bridge-types";
import { cn } from "@/lib/utils";

export interface ConnectPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: BridgeStatus;
  onStatusChange: (status: BridgeStatus) => void;
  /** Receives the freshly dumped JSON as files, for the normal load pipeline. */
  onFiles: (files: File[]) => void;
}

type Step = "auth" | "channels";
/** The QR login drives a browser; the token login needs none. */
type AuthMode = "qr" | "token";

const TOKEN_HELP = [
  "Ouvrez Slack dans un navigateur (app.slack.com), connecté à l'espace de travail.",
  "Outils de développement → onglet Réseau, puis rechargez la page.",
  "Cliquez une requête vers « /api/… » → Charge utile → copiez la valeur « token ».",
  "Onglet Application → Cookies → copiez la valeur du cookie « d ».",
];

const QR_HELP = [
  "Ouvrez Slack (application de bureau ou navigateur), connecté à l'espace de travail.",
  "Cliquez sur le nom de l'espace de travail, en haut à gauche — pas sur le logo.",
  "Choisissez « Se connecter sur mobile ».",
  "Clic droit sur le QR code → « Copier l'adresse de l'image », puis collez-la ci-dessous.",
];

/** Slack IDs as they appear in a dump: quoted fields, and `<@U…>` mentions. */
const QUOTED_ID = /"([UWB][A-Z0-9]{6,})"/g;
const MENTION_ID = /<@([UWB][A-Z0-9]{6,})[|>]/g;

/**
 * Collects the people who actually appear in a conversation, so only they get
 * resolved — the workspace directory has tens of thousands of accounts.
 */
function collectUserIds(conversation: unknown): string[] {
  const raw = JSON.stringify(conversation) ?? "";
  const ids = new Set<string>();
  for (const m of raw.matchAll(QUOTED_ID)) ids.add(m[1]);
  for (const m of raw.matchAll(MENTION_ID)) ids.add(m[1]);
  return [...ids];
}

function jsonFile(name: string, value: unknown): File {
  return new File([JSON.stringify(value)], name, { type: "application/json" });
}

function channelLabel(c: ChannelSummary): string {
  if (c.name) return c.name;
  if (c.isIM) return c.user ? `Message direct · ${c.user}` : "Message direct";
  return c.id;
}

/** The list renders at most this many rows; the filter narrows the rest. */
const MAX_VISIBLE_CHANNELS = 400;

/**
 * Turns what the user typed into a lower-cased needle.
 *
 * Accepts a name (`#general`, `general`), an ID (`C0123ABCD`, or part of one),
 * or a pasted Slack link (`https://acme.slack.com/archives/C0123ABCD`).
 */
function channelQuery(raw: string): string {
  let q = raw.trim();
  const link = q.match(/\/archives\/([A-Za-z0-9]+)/);
  if (link) q = link[1];
  return q.replace(/^[#@]/, "").toLowerCase();
}

/** 0 = exact ID, 1 = name starts with the query, 2 = contains it, -1 = no match. */
function channelRank(c: ChannelSummary, q: string): number {
  const id = c.id.toLowerCase();
  const label = channelLabel(c).toLowerCase();
  if (id === q) return 0;
  if (label.startsWith(q)) return 1;
  if (label.includes(q) || id.includes(q) || (c.user?.toLowerCase().includes(q) ?? false)) {
    return 2;
  }
  return -1;
}

/** An inline sample of what the channel filter accepts. */
function FilterExample({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border bg-muted/60 px-1 py-px font-mono text-[11px] text-foreground/80">
      {children}
    </code>
  );
}

function ChannelIcon({ channel }: { channel: ChannelSummary }) {
  const className = "size-4 shrink-0 text-muted-foreground";
  if (channel.isIM) return <MessageSquare className={className} />;
  if (channel.isMPIM) return <Users className={className} />;
  if (channel.isPrivate) return <Lock className={className} />;
  return <Hash className={className} />;
}

export function ConnectPanel({
  open,
  onOpenChange,
  status,
  onStatusChange,
  onFiles,
}: ConnectPanelProps) {
  const [step, setStep] = React.useState<Step>("auth");
  const [workspace, setWorkspace] = React.useState("");
  const [authMode, setAuthMode] = React.useState<AuthMode>("token");
  // The QR login needs a helper binary and a browser, which a plain host (e.g.
  // Vercel) does not have: offer it only where it can actually run.
  const qrAvailable = status.qrauth.ready || status.qrauth.buildable;
  const activeMode: AuthMode = qrAvailable ? authMode : "token";
  const [qrImage, setQrImage] = React.useState("");
  const [token, setToken] = React.useState("");
  const [cookie, setCookie] = React.useState("");
  const [channels, setChannels] = React.useState<ChannelSummary[]>([]);
  const [filter, setFilter] = React.useState("");
  const [selected, setSelected] = React.useState<string | null>(null);
  const [withUsers, setWithUsers] = React.useState(true);
  // ADEO's workspace has thousands of channels; the ones you are in are a few
  // dozen. Default to those.
  const [memberOnly, setMemberOnly] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [logs, setLogs] = React.useState<string[]>([]);
  const [error, setError] = React.useState<{ message: string; detail?: string } | null>(null);

  const abortRef = React.useRef<AbortController | null>(null);

  // Abort any command still running if the panel goes away.
  React.useEffect(() => () => abortRef.current?.abort(), []);

  /** Closing cancels whatever is running and clears the transient state. */
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) {
        abortRef.current?.abort();
        abortRef.current = null;
        setBusy(null);
        setLogs([]);
        setError(null);
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const pushLog = React.useCallback((line: string) => {
    setLogs((prev) => (prev.length > 200 ? [...prev.slice(-200), line] : [...prev, line]));
  }, []);

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
        setError(
          err instanceof BridgeClientError
            ? { message: err.message, detail: err.detail }
            : { message: err instanceof Error ? err.message : "Erreur inattendue." },
        );
        return null;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setBusy(null);
      }
    },
    [],
  );

  const loadChannels = React.useCallback(
    async (wsp: string, onlyMine: boolean) => {
      const list = await withBusy("Récupération des canaux…", (signal) =>
        runJob<ChannelSummary[]>(
          { action: "channels", workspace: wsp, memberOnly: onlyMine },
          pushLog,
          signal,
        ),
      );
      if (!list) return;
      setChannels(list);
      setSelected(null);
      setFilter("");
      setStep("channels");
    },
    [pushLog, withBusy],
  );

  const toggleMemberOnly = React.useCallback(
    (onlyMine: boolean) => {
      setMemberOnly(onlyMine);
      void loadChannels(workspace.trim(), onlyMine);
    },
    [workspace, loadChannels],
  );

  const handleAuth = React.useCallback(async () => {
    const wsp = workspace.trim();
    if (!wsp) {
      setError({ message: "Renseignez l'espace de travail." });
      return;
    }
    let job: RunRequest;
    if (activeMode === "qr") {
      if (!qrImage.trim()) {
        setError({ message: "Collez l'image du QR code." });
        return;
      }
      job = { action: "auth-qr", workspace: wsp, qrImage: qrImage.trim() };
    } else {
      if (!token.trim()) {
        setError({ message: "Collez le jeton." });
        return;
      }
      job = {
        action: "auth-token",
        workspace: wsp,
        token: token.trim(),
        cookie: cookie.trim(),
      };
    }

    const res = await withBusy("Connexion à Slack…", (signal) =>
      runJob<{ workspace: string }>(job, pushLog, signal),
    );
    if (!res) return;
    setQrImage("");
    setToken("");
    setCookie("");
    setWorkspace(res.workspace);
    const next = await fetchStatus();
    if (next) onStatusChange(next);
    await loadChannels(res.workspace, memberOnly);
  }, [
    workspace,
    activeMode,
    qrImage,
    token,
    cookie,
    memberOnly,
    withBusy,
    pushLog,
    onStatusChange,
    loadChannels,
  ]);

  const handleOpenChannel = React.useCallback(async () => {
    if (!selected) return;
    const wsp = workspace.trim();
    const channel = channels.find((c) => c.id === selected);

    const result = await withBusy("Récupération de la conversation…", async (signal) => {
      const conversation = await runJob<unknown>(
        { action: "dump", workspace: wsp, channel: selected },
        pushLog,
        signal,
      );

      const files: File[] = [];
      // The directory goes first: the viewer applies it, then the conversation.
      if (withUsers) {
        const userIds = collectUserIds(conversation);
        if (userIds.length > 0) {
          const users = await runJob<unknown[]>(
            { action: "resolve-users", workspace: wsp, userIds },
            pushLog,
            signal,
          );
          if (Array.isArray(users) && users.length > 0) {
            files.push(jsonFile("users.json", users));
          }
        }
      }

      const name = channel ? channelLabel(channel).replace(/[^\w.-]+/g, "-") : selected;
      files.push(jsonFile(`${name || selected}.json`, conversation));
      return files;
    });

    if (!result) return;
    onFiles(result);
    handleOpenChange(false);
  }, [selected, workspace, channels, withUsers, withBusy, pushLog, onFiles, handleOpenChange]);

  const handleUseWorkspace = React.useCallback(
    async (wsp: string) => {
      setWorkspace(wsp);
      await loadChannels(wsp, memberOnly);
    },
    [loadChannels, memberOnly],
  );

  const handleForget = React.useCallback(
    async (wsp: string) => {
      await logoutWorkspace(wsp);
      const next = await fetchStatus();
      if (next) onStatusChange(next);
    },
    [onStatusChange],
  );

  /** Accepts an image pasted straight from the clipboard, not just its URL. */
  const handlePaste = React.useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const item = Array.from(event.clipboardData.items).find((i) => i.type.startsWith("image/"));
    const blob = item?.getAsFile();
    if (!blob) return;
    event.preventDefault();
    const reader = new FileReader();
    reader.onload = () => setQrImage(String(reader.result ?? ""));
    reader.readAsDataURL(blob);
  }, []);

  const { visibleChannels, matchCount } = React.useMemo(() => {
    const q = channelQuery(filter);
    const ranked = channels
      .map((c) => ({ c, rank: q ? channelRank(c, q) : 2 }))
      .filter(({ rank }) => rank >= 0)
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        if (a.c.isArchived !== b.c.isArchived) return a.c.isArchived ? 1 : -1;
        return channelLabel(a.c).localeCompare(channelLabel(b.c), "fr");
      });
    return {
      visibleChannels: ranked.slice(0, MAX_VISIBLE_CHANNELS).map(({ c }) => c),
      matchCount: ranked.length,
    };
  }, [channels, filter]);

  const lastLog = logs[logs.length - 1];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90svh] gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            {step === "channels" ? (
              <button
                type="button"
                onClick={() => setStep("auth")}
                className="-ml-1 rounded p-1 hover:bg-muted"
                aria-label="Retour"
              >
                <ArrowLeft className="size-4" />
              </button>
            ) : null}
            {step === "auth" ? "Se connecter à Slack" : `Canaux · ${workspace}`}
          </DialogTitle>
          <DialogDescription>
            {step === "auth"
              ? "Récupère vos conversations directement depuis Slack, via son API."
              : `${channels.length.toLocaleString("fr-FR")} ${
                memberOnly ? "canaux dont vous êtes membre" : "canaux accessibles"
              } — choisissez celui à ouvrir.`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {step === "auth" ? (
            <div className="space-y-5">
              {status.workspaces.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Déjà connecté
                  </p>
                  {status.workspaces.map((wsp) => (
                    <div key={wsp} className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 justify-start"
                        disabled={Boolean(busy)}
                        onClick={() => void handleUseWorkspace(wsp)}
                      >
                        <Check className="size-4 text-[var(--slack-green)]" />
                        {wsp}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Oublier cet espace de travail"
                        disabled={Boolean(busy)}
                        onClick={() => void handleForget(wsp)}
                      >
                        <LogOut className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="sd-workspace">
                  Espace de travail
                </label>
                <Input
                  id="sd-workspace"
                  placeholder="acme"
                  value={workspace}
                  disabled={Boolean(busy)}
                  onChange={(e) => setWorkspace(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Le sous-domaine, sans « .slack.com ».
                </p>
              </div>

              {qrAvailable ? (
              <div className="flex gap-1 rounded-md bg-muted p-1">
                {(
                  [
                    ["token", "Jeton + cookie"],
                    ["qr", "QR code"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => setAuthMode(mode)}
                    className={cn(
                      "flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60",
                      activeMode === mode
                        ? "bg-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              ) : null}

              {activeMode === "token" ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="sd-token">
                    Jeton et cookie
                  </label>
                  <ol className="list-decimal space-y-1 rounded-md bg-muted/50 py-3 pl-8 pr-3 text-xs text-muted-foreground">
                    {TOKEN_HELP.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ol>
                  <Input
                    id="sd-token"
                    className="font-mono text-xs"
                    placeholder="xoxc-…"
                    autoComplete="off"
                    spellCheck={false}
                    value={token}
                    disabled={Boolean(busy)}
                    onChange={(e) => setToken(e.target.value)}
                  />
                  <Input
                    className="font-mono text-xs"
                    placeholder="xoxd-… (cookie « d »)"
                    autoComplete="off"
                    spellCheck={false}
                    value={cookie}
                    disabled={Boolean(busy)}
                    onChange={(e) => setCookie(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Ces valeurs donnent accès à votre Slack. Elles ne passent pas par le
                    navigateur : elles sont chiffrées côté serveur, liées à votre session.
                  </p>
                </div>
              ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="sd-qr">
                  Image du QR code
                </label>
                <ol className="list-decimal space-y-1 rounded-md bg-muted/50 py-3 pl-8 pr-3 text-xs text-muted-foreground">
                  {QR_HELP.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
                <textarea
                  id="sd-qr"
                  rows={3}
                  spellCheck={false}
                  disabled={Boolean(busy)}
                  value={qrImage}
                  onChange={(e) => setQrImage(e.target.value)}
                  onPaste={handlePaste}
                  placeholder="data:image/png;base64,…"
                  className="w-full resize-none rounded-md border bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                />
                {qrImage.startsWith("data:image/") ? (
                  <p className="text-xs text-[var(--slack-green)]">
                    Image reconnue ({Math.round(qrImage.length / 1024)} Ko). Le code expire vite —
                    connectez-vous maintenant. Aucune fenêtre ne s&apos;ouvrira : le navigateur
                    tourne côté serveur.
                  </p>
                ) : null}
              </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  className="pl-8"
                  placeholder="Rechercher un canal…"
                  aria-label="Filtrer les canaux par nom ou par ID"
                  aria-describedby="channel-filter-hint"
                  value={filter}
                  disabled={Boolean(busy)}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              {/* One line under the field: how to filter while it is empty, what matched once it is not. */}
              <p
                id="channel-filter-hint"
                aria-live="polite"
                className="min-h-5 px-0.5 text-xs leading-5 text-muted-foreground"
              >
                {filter.trim() ? (
                  <>
                    <span className="font-medium text-foreground">
                      {matchCount.toLocaleString("fr-FR")}
                    </span>{" "}
                    sur {channels.length.toLocaleString("fr-FR")} canaux
                  </>
                ) : (
                  <>
                    Par nom <FilterExample>#general</FilterExample> ou par ID{" "}
                    <FilterExample>C0123ABCD</FilterExample> — un lien Slack marche aussi.
                  </>
                )}
                {matchCount > MAX_VISIBLE_CHANNELS
                  ? ` · ${MAX_VISIBLE_CHANNELS} premiers affichés, affinez la recherche`
                  : ""}
              </p>

              <div className="max-h-[38svh] overflow-y-auto rounded-md border">
                {visibleChannels.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Aucun canal ne correspond.
                  </p>
                ) : (
                  visibleChannels.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => setSelected(c.id)}
                      className={cn(
                        "flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 disabled:opacity-60",
                        selected === c.id
                          ? "bg-[var(--slack-mention-bg)]"
                          : "hover:bg-muted/60",
                      )}
                    >
                      <ChannelIcon channel={c} />
                      <span className="min-w-0 flex-1 truncate">{channelLabel(c)}</span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {c.id}
                      </span>
                      {c.isArchived ? (
                        <span className="shrink-0 text-xs text-muted-foreground">archivé</span>
                      ) : c.memberCount > 0 ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {c.memberCount}
                        </span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={memberOnly}
                  disabled={Boolean(busy)}
                  onChange={(e) => toggleMemberOnly(e.target.checked)}
                  className="size-4 accent-[var(--slack-green)]"
                />
                Seulement les canaux dont je suis membre
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={withUsers}
                  disabled={Boolean(busy)}
                  onChange={(e) => setWithUsers(e.target.checked)}
                  className="size-4 accent-[var(--slack-green)]"
                />
                Résoudre les noms des participants
              </label>
            </div>
          )}

          {busy ? (
            <div className="mt-4 rounded-md border bg-muted/40 px-3 py-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="size-4 animate-spin" />
                {busy}
              </p>
              {lastLog ? (
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground" title={lastLog}>
                  {lastLog}
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div
              className="mt-4 rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--slack-red)", color: "var(--slack-red)" }}
            >
              <p className="font-medium">{error.message}</p>
              {error.detail ? (
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono text-xs opacity-80">
                  {error.detail}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          {busy ? (
            <Button variant="outline" onClick={() => abortRef.current?.abort()}>
              Annuler
            </Button>
          ) : step === "auth" ? (
            <Button variant="slack" onClick={() => void handleAuth()}>
              Se connecter
            </Button>
          ) : (
            <Button variant="slack" disabled={!selected} onClick={() => void handleOpenChannel()}>
              Ouvrir la conversation
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
