/**
 * The bridge between the app and Slack.
 *
 * Everything runs on the Slack Web API (see `./slack-api`). The only thing
 * that still spawns a process is the QR login, because decoding a sign-in QR
 * code and consuming its one-shot link needs a browser — that is
 * `tools/qrauth`, and it is optional.
 *
 * Credentials never travel back to the browser: they are stored encrypted per
 * session by `./credentials`, bound to the visitor's session cookie, so a
 * shared deployment never lets one visitor reach another's workspace.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import crypto from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { sm, sp, st } from "@/lib/i18n/server";

import {
  QR_INPUT_KEYS,
  QR_VIEWPORT,
  type BridgeStatus,
  type ChannelSummary,
  type QrauthAvailability,
  type QrInput,
} from "@/lib/slack/bridge-types";

import {
  forgetCredentials,
  listStoredWorkspaces,
  recallCredentials,
  rememberCredentials,
  type SlackCredentials,
} from "./credentials";
import {
  ALL_CHANNEL_TYPES,
  authTest,
  type Conversation,
  conversationsList,
  dumpConversation,
  isAuthError,
  type RawChannel,
  type RawUser,
  SlackApiError,
  usersConversations,
  usersInfo,
} from "./slack-api";

export type { BridgeStatus, ChannelSummary, QrauthAvailability };
export { SlackApiError };

export type LogFn = (line: string) => void;

export class BridgeError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "BridgeError";
  }
}

/* -------------------------------------------------------------------------- */
/*  Validation                                                                 */
/* -------------------------------------------------------------------------- */

const WORKSPACE_RE = /^[a-z0-9][a-z0-9._-]*$/;
const CHANNEL_RE = /^[A-Z][A-Z0-9]{2,}$/;

/** Accepts `acme`, `acme.slack.com` or `https://acme.slack.com/` → `acme`. */
export function normaliseWorkspace(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  const cut = s.search(/[/?#]/);
  if (cut >= 0) s = s.slice(0, cut);
  return s.replace(/\.slack\.com$/, "");
}

export function assertWorkspace(raw: string): string {
  const wsp = normaliseWorkspace(raw);
  if (!WORKSPACE_RE.test(wsp)) {
    throw new BridgeError(
      st(sm().invalidWorkspace, { value: raw }),
    );
  }
  return wsp;
}

export function assertChannel(raw: string): string {
  const id = raw.trim();
  if (!CHANNEL_RE.test(id)) {
    throw new BridgeError(st(sm().invalidChannel, { value: raw }));
  }
  return id;
}

/* -------------------------------------------------------------------------- */
/*  The QR login helper                                                        */
/* -------------------------------------------------------------------------- */

const QRAUTH_DIR = path.join(process.cwd(), "tools", "qrauth");
const QRAUTH_BIN = path.join(QRAUTH_DIR, process.platform === "win32" ? "qrauth.exe" : "qrauth");

async function isExecutable(p: string): Promise<boolean> {
  try {
    await fs.access(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Directories worth looking in beyond `PATH`. */
function extraBinDirs(): string[] {
  const home = os.homedir();
  return [path.join(home, "go", "bin"), "/opt/homebrew/bin", "/usr/local/bin"];
}

async function which(name: string): Promise<string | null> {
  const dirs = [
    ...(process.env.PATH ?? "").split(path.delimiter).filter(Boolean),
    ...extraBinDirs(),
  ];
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    if (await isExecutable(candidate)) return candidate;
  }
  return null;
}

export async function qrauthStatus(): Promise<QrauthAvailability> {
  const override = process.env.SLACK_VIEWER_QRAUTH_BIN;
  if (override) {
    return (await isExecutable(override))
      ? { ready: true, buildable: false }
      : {
          ready: false,
          buildable: false,
          reason: st(sm().qrBinMissing, { path: override }),
        };
  }
  if (await isExecutable(QRAUTH_BIN)) return { ready: true, buildable: false };
  if (await which("qrauth")) return { ready: true, buildable: false };

  if (!(await which("go"))) {
    return {
      ready: false,
      buildable: false,
      reason: sm().qrUnavailableReason,
    };
  }
  return { ready: false, buildable: true };
}

async function ensureQrauth(onLog?: LogFn): Promise<string> {
  const override = process.env.SLACK_VIEWER_QRAUTH_BIN;
  if (override) {
    if (await isExecutable(override)) return override;
    throw new BridgeError(st(sm().qrBinNotExecutable, { path: override }));
  }
  if (await isExecutable(QRAUTH_BIN)) return QRAUTH_BIN;
  const onPath = await which("qrauth");
  if (onPath) return onPath;

  const go = await which("go");
  if (!go) {
    throw new BridgeError(sm().qrUnavailable, sm().qrUnavailableDetail);
  }
  onLog?.(sm().qrBuilding);
  try {
    await fs.access(path.join(QRAUTH_DIR, "go.sum"));
  } catch {
    await run(go, ["mod", "tidy"], { cwd: QRAUTH_DIR, onLog, env: { GOFLAGS: "-mod=mod" } });
  }
  await run(go, ["build", "-o", QRAUTH_BIN, "."], { cwd: QRAUTH_DIR, onLog });
  return QRAUTH_BIN;
}

/* -------------------------------------------------------------------------- */
/*  Process helper (only the QR helper needs it)                               */
/* -------------------------------------------------------------------------- */

interface RunOptions {
  env?: Record<string, string>;
  stdin?: string;
  /** Leave stdin open after `stdin` is written, for further input. */
  keepStdinOpen?: boolean;
  /** Receives `@@frame` lines (the QR helper's live view) instead of `onLog`. */
  onFrame?: (base64: string) => void;
  /** Called once the process exists — to talk to it while it runs. */
  onSpawn?: (child: ChildProcessWithoutNullStreams) => void;
  onLog?: LogFn;
  label?: string;
  cwd?: string;
  signal?: AbortSignal;
}

function run(bin: string, args: string[], opts: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderrTail = "";
    let pending = "";

    const abort = () => child.kill("SIGTERM");
    opts.signal?.addEventListener("abort", abort, { once: true });
    opts.onSpawn?.(child);
    // Writing to a helper that already exited must not crash the server.
    child.stdin.on("error", () => {});

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      pending += chunk;
      const lines = pending.split(/\r\n|\r|\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith(FRAME_PREFIX)) {
          opts.onFrame?.(line.slice(FRAME_PREFIX.length));
          continue;
        }
        const clean = line.trim();
        if (!clean) continue;
        stderrTail = (stderrTail + clean + "\n").slice(-4000);
        opts.onLog?.(clean);
      }
    });

    child.on("error", (err) => {
      opts.signal?.removeEventListener("abort", abort);
      reject(new BridgeError(st(sm().spawnFailed, { bin: path.basename(bin), error: err.message })));
    });

    child.on("close", (code) => {
      opts.signal?.removeEventListener("abort", abort);
      if (pending.trim() && !pending.startsWith(FRAME_PREFIX)) {
        stderrTail = (stderrTail + pending.trim()).slice(-4000);
        opts.onLog?.(pending.trim());
      }
      if (code === 0) {
        resolve(stdout);
        return;
      }
      const what = opts.label ?? `${path.basename(bin)} ${args[0] ?? ""}`.trim();
      reject(
        new BridgeError(st(sm().processFailed, { what, code: String(code) }), stderrTail.trim() || undefined),
      );
    });

    if (opts.keepStdinOpen) child.stdin.write(opts.stdin ?? "");
    else child.stdin.end(opts.stdin ?? "");
  });
}

/* -------------------------------------------------------------------------- */
/*  Status                                                                     */
/* -------------------------------------------------------------------------- */

export async function status(session: string): Promise<BridgeStatus> {
  return {
    // The API path needs nothing but network, so the panel is always offered.
    available: true,
    qrauth: await qrauthStatus(),
    workspaces: await listStoredWorkspaces(session),
  };
}

/* -------------------------------------------------------------------------- */
/*  Authentication                                                             */
/* -------------------------------------------------------------------------- */

/** Validates credentials against Slack, then stores them for this session. */
async function registerWorkspace(
  session: string,
  workspace: string,
  creds: SlackCredentials,
  onLog?: LogFn,
  signal?: AbortSignal,
): Promise<void> {
  onLog?.(sm().checking);
  const who = await authTest(creds, signal);
  onLog?.(st(sm().signedIn, { user: who.user ?? "?", team: who.team ?? workspace }));
  await rememberCredentials(session, workspace, creds);
}

/* -------------------------------------------------------------------------- */
/*  QR sign-in live view                                                       */
/* -------------------------------------------------------------------------- */

const FRAME_PREFIX = "@@frame ";

/**
 * QR sign-ins in progress, by live-view id. The browser the helper drives runs
 * here, out of sight; when Slack hands over to an identity provider (SSO), the
 * person has to act on that page. The panel shows its frames and sends clicks
 * and keystrokes back through `sendQrInput`. Each entry belongs to the session
 * that started it and to no one else.
 */
const liveLogins = new Map<string, { session: string; child: ChildProcessWithoutNullStreams }>();

export type LiveEvent = { t: "live"; id: string } | { t: "frame"; data: string };

const MAX_INPUT_TEXT = 2000;

function isQrInput(value: unknown): value is QrInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  switch (v.t) {
    case "click":
      return (
        finite(v.x) && finite(v.y) &&
        v.x >= 0 && v.y >= 0 && v.x <= QR_VIEWPORT.width && v.y <= QR_VIEWPORT.height
      );
    case "text":
      return typeof v.v === "string" && v.v.length <= MAX_INPUT_TEXT;
    case "key":
      return (QR_INPUT_KEYS as readonly unknown[]).includes(v.k);
    case "scroll":
      return finite(v.dy) && Math.abs(v.dy) <= 5000;
    default:
      return false;
  }
}

/**
 * Forwards one input to a QR sign-in's browser. Never logged: it may be a
 * password typed into an identity provider.
 */
export function sendQrInput(session: string, id: unknown, input: unknown): void {
  const login = typeof id === "string" ? liveLogins.get(id) : undefined;
  if (!login || login.session !== session) throw new BridgeError(sm().liveGone);
  if (!isQrInput(input)) throw new BridgeError(sm().invalidRequest);
  const line: QrInput =
    input.t === "click"
      ? { t: "click", x: input.x, y: input.y }
      : input.t === "text"
        ? { t: "text", v: input.v }
        : input.t === "key"
          ? { t: "key", k: input.k }
          : { t: "scroll", dy: input.dy };
  login.child.stdin.write(JSON.stringify(line) + "\n");
}

/** Exchanges a QR code image for credentials, then registers the workspace. */
export async function authenticateWithQr(
  session: string,
  rawWorkspace: string,
  qrImage: string,
  onLog?: LogFn,
  signal?: AbortSignal,
  onLive?: (event: LiveEvent) => void,
): Promise<{ workspace: string }> {
  const workspace = assertWorkspace(rawWorkspace);
  const image = qrImage.trim();
  if (!image.startsWith("data:image/")) {
    throw new BridgeError(
      sm().qrNotDataUrl,
      sm().qrNotDataUrlDetail,
    );
  }

  const bin = await ensureQrauth(onLog);
  const liveId = crypto.randomBytes(18).toString("base64url");
  let raw: string;
  try {
    raw = await withLoginSlot(onLog, () => {
      onLog?.(sm().readingQr);
      return run(bin, ["-workspace", workspace, "-qr", "-"], {
        // The QR code on the first line; stdin then stays open for live-view input.
        stdin: image.replace(/\s+/g, "") + "\n",
        keepStdinOpen: true,
        label: sm().signInLabel,
        onLog,
        signal,
        onSpawn: (child) => {
          liveLogins.set(liveId, { session, child });
          onLive?.({ t: "live", id: liveId });
        },
        onFrame: (data) => onLive?.({ t: "frame", data }),
      });
    });
  } finally {
    liveLogins.get(liveId)?.child.stdin.end();
    liveLogins.delete(liveId);
  }

  let creds: { token?: string; cookie?: string };
  try {
    creds = JSON.parse(raw.trim());
  } catch {
    throw new BridgeError(sm().qrBadOutput, raw.slice(0, 500));
  }
  if (!creds.token || !creds.cookie) {
    throw new BridgeError(sm().qrNoToken);
  }

  await registerWorkspace(session, workspace, { token: creds.token, cookie: creds.cookie }, onLog, signal);
  return { workspace };
}

/** Registers credentials the caller read from their own developer tools. */
export async function authenticateWithToken(
  session: string,
  rawWorkspace: string,
  rawToken: string,
  rawCookie: string,
  onLog?: LogFn,
  signal?: AbortSignal,
): Promise<{ workspace: string }> {
  const workspace = assertWorkspace(rawWorkspace);
  const token = rawToken.trim();
  const cookie = rawCookie.trim().replace(/^d=/, "");

  if (!/^xox[a-z]-/.test(token)) {
    throw new BridgeError(sm().tokenPrefix);
  }
  // Browser (client) tokens are only valid alongside the session cookie.
  if (/^xox[ce]-/.test(token) && !cookie.startsWith("xoxd-")) {
    throw new BridgeError(sm().cookieRequired);
  }

  await registerWorkspace(session, workspace, { token, cookie }, onLog, signal);
  return { workspace };
}

export async function logout(session: string, rawWorkspace: string): Promise<void> {
  await forgetCredentials(session, assertWorkspace(rawWorkspace));
}

/**
 * Each QR login starts a headless Chromium, which costs a few hundred MB. On a
 * shared instance that has to be bounded, so logins queue past this many.
 */
const MAX_CONCURRENT_LOGINS = Number(process.env.SLACK_VIEWER_MAX_LOGINS ?? 2);
let activeLogins = 0;
const loginQueue: (() => void)[] = [];

async function withLoginSlot<T>(onLog: LogFn | undefined, fn: () => Promise<T>): Promise<T> {
  if (activeLogins >= MAX_CONCURRENT_LOGINS) {
    onLog?.(sm().waitingSlot);
    await new Promise<void>((resolve) => loginQueue.push(resolve));
  }
  activeLogins += 1;
  try {
    return await fn();
  } finally {
    activeLogins -= 1;
    loginQueue.shift()?.();
  }
}

/* -------------------------------------------------------------------------- */
/*  Operations                                                                 */
/* -------------------------------------------------------------------------- */

/** Loads this session's credentials, or explains that it has to sign in. */
async function credentialsFor(session: string, workspace: string): Promise<SlackCredentials> {
  const creds = await recallCredentials(session, workspace);
  if (!creds) {
    throw new BridgeError(
      st(sm().noCredentials, { workspace }),
    );
  }
  return creds;
}

function toChannelSummary(c: RawChannel & { id: string }): ChannelSummary {
  return {
    id: c.id,
    name: c.name || c.name_normalized || "",
    isPrivate: Boolean(c.is_private),
    isIM: Boolean(c.is_im),
    isMPIM: Boolean(c.is_mpim),
    isArchived: Boolean(c.is_archived),
    memberCount: c.num_members ?? 0,
    topic: c.topic?.value || c.purpose?.value || undefined,
    user: c.user || undefined,
  };
}

function summarise(raw: RawChannel[]): ChannelSummary[] {
  return raw
    .filter((c): c is RawChannel & { id: string } => Boolean(c?.id))
    .map(toChannelSummary);
}

/**
 * Lists conversations.
 *
 * `memberOnly` matters enormously on a large workspace: ADEO's has thousands of
 * channels and the user belongs to a few dozen, so that case uses
 * `users.conversations` — one request. The full listing walks
 * `conversations.list`, which is slow by nature.
 */
export async function listChannels(
  session: string,
  rawWorkspace: string,
  memberOnly = true,
  onLog?: LogFn,
  signal?: AbortSignal,
): Promise<ChannelSummary[]> {
  const workspace = assertWorkspace(rawWorkspace);
  const creds = await credentialsFor(session, workspace);
  const list = memberOnly ? usersConversations : conversationsList;
  onLog?.(memberOnly ? sm().listingMine : sm().listingAll);
  return summarise(await list(creds, ALL_CHANNEL_TYPES, onLog, signal));
}

/**
 * Resolves just the people who appear in a conversation.
 *
 * Not `users.list`: that walks the whole workspace directory — tens of
 * thousands of accounts for a conversation involving a few dozen.
 */
export async function resolveUsers(
  session: string,
  rawWorkspace: string,
  ids: string[],
  onLog?: LogFn,
  signal?: AbortSignal,
): Promise<RawUser[]> {
  const workspace = assertWorkspace(rawWorkspace);
  const creds = await credentialsFor(session, workspace);
  onLog?.(sp(sm().resolving, ids.length));
  return usersInfo(creds, ids, onLog, signal);
}

/** Dumps one conversation, threads included. */
export async function dumpChannel(
  session: string,
  rawWorkspace: string,
  rawChannel: string,
  onLog?: LogFn,
  signal?: AbortSignal,
): Promise<Conversation> {
  const workspace = assertWorkspace(rawWorkspace);
  const channel = assertChannel(rawChannel);
  const creds = await credentialsFor(session, workspace);
  return dumpConversation(creds, channel, onLog, signal);
}

export { isAuthError };
