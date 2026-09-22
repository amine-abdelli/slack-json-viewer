/**
 * Per-visitor isolation for the Slack bridge.
 *
 * A deployed instance is shared, and a Slack token grants read access to
 * someone's whole workspace — so nothing may be global. Each browser gets an
 * opaque session id in an httpOnly cookie, and everything it stores goes to
 * `<data>/sessions/<id>`, a directory of its own. Two visitors can never see
 * each other's workspaces.
 *
 * The credentials written there are encrypted with a key derived from the
 * session id and a server secret, so the files are useless without the
 * matching cookie.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const SESSION_COOKIE = "slack-viewer-session";

/** base64url — safe as a directory name, and checked on the way in. */
const SESSION_ID_RE = /^[A-Za-z0-9_-]{32,64}$/;

const SESSION_TTL_MS =
  Number(process.env.SLACK_VIEWER_SESSION_TTL_HOURS ?? 12) * 60 * 60 * 1000;

/** Root for everything this app persists. `/data` in the container image. */
export function dataDir(): string {
  return (
    process.env.SLACK_VIEWER_DATA_DIR ??
    process.env.SLACK_VIEWER_CACHE_DIR ??
    path.join(os.homedir(), ".cache", "slack-viewer")
  );
}

function sessionsRoot(): string {
  return path.join(dataDir(), "sessions");
}

/**
 * Secret used to bind stored credentials to a session cookie.
 *
 * Without `SLACK_VIEWER_SECRET` a random one is generated per boot, which is
 * safe but logs everyone out on restart — fine for local use, set it in
 * production.
 */
let secret: Buffer | null = null;
function serverSecret(): Buffer {
  if (secret) return secret;
  const fromEnv = process.env.SLACK_VIEWER_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    secret = crypto.createHash("sha256").update(fromEnv).digest();
  } else {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[slack-viewer] SLACK_VIEWER_SECRET is not set: stored Slack credentials " +
          "will be discarded on every restart.",
      );
    }
    secret = crypto.randomBytes(32);
  }
  return secret;
}

export interface Session {
  id: string;
  /** true when the caller sent no usable cookie and one must be set */
  isNew: boolean;
}

export function newSessionId(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Reads the session cookie off a request, minting a fresh id when absent. */
export function resolveSession(request: Request): Session {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const value = decodeURIComponent(part.slice(eq + 1).trim());
    if (SESSION_ID_RE.test(value)) return { id: value, isNew: false };
  }
  return { id: newSessionId(), isNew: true };
}

/** The `Set-Cookie` value for a freshly minted session. */
export function sessionCookieHeader(session: Session, secure: boolean): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const parts = [
    `${SESSION_COOKIE}=${session.id}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** True when the request arrived over TLS, directly or through a proxy. */
export function isSecureRequest(request: Request): boolean {
  if (request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https") return true;
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

/** The private directory belonging to a session. */
export function sessionCacheDir(id: string): string {
  if (!SESSION_ID_RE.test(id)) throw new Error("invalid session id");
  return path.join(sessionsRoot(), id);
}

/**
 * Key material this session's stored credentials are encrypted with.
 *
 * Deriving it from the cookie means the files on disk cannot be decrypted by
 * another session, nor by anyone holding only the volume.
 */
export function sessionMachineId(id: string): string {
  if (!SESSION_ID_RE.test(id)) throw new Error("invalid session id");
  return crypto.createHmac("sha256", serverSecret()).update(id).digest("hex");
}

/** Creates the session directory and marks it as recently used. */
export async function touchSession(id: string): Promise<string> {
  const dir = sessionCacheDir(id);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const now = new Date();
  await fs.utimes(dir, now, now).catch(() => {});
  return dir;
}

/** Whether this session has ever stored anything. */
export async function sessionExists(id: string): Promise<boolean> {
  if (!SESSION_ID_RE.test(id)) return false;
  try {
    return (await fs.stat(sessionCacheDir(id))).isDirectory();
  } catch {
    return false;
  }
}

export async function dropSession(id: string): Promise<void> {
  await fs.rm(sessionCacheDir(id), { recursive: true, force: true });
}

/* -------------------------------------------------------------------------- */
/*  Expiry                                                                     */
/* -------------------------------------------------------------------------- */

let lastSweep = 0;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Deletes session directories untouched for longer than the TTL.
 *
 * Called opportunistically from the status route rather than on a timer, so it
 * costs nothing on an idle instance.
 */
export async function sweepExpiredSessions(): Promise<void> {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;

  let entries: string[];
  try {
    entries = await fs.readdir(sessionsRoot());
  } catch {
    return;
  }
  await Promise.all(
    entries.map(async (name) => {
      if (!SESSION_ID_RE.test(name)) return;
      const dir = path.join(sessionsRoot(), name);
      try {
        const stat = await fs.stat(dir);
        if (now - stat.mtimeMs > SESSION_TTL_MS) {
          await fs.rm(dir, { recursive: true, force: true });
        }
      } catch {
        /* raced with another sweep */
      }
    }),
  );
}
