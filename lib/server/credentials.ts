/**
 * Keeps a session's Slack credentials so the app can call the Slack Web API
 * directly.
 *
 * Encrypted at rest with a key derived from the visitor's session cookie, so
 * the file is useless to another session, and to anyone holding only the
 * volume. It therefore also survives a restart, unlike an in-memory cache.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { sessionCacheDir, sessionMachineId, touchSession } from "./session";

export interface SlackCredentials {
  /** `xoxc-…` client token, or another `xox…` token */
  token: string;
  /** the `d` cookie value, URL-encoded exactly as Slack set it */
  cookie: string;
}

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function keyFor(session: string): Buffer {
  return crypto.createHash("sha256").update(sessionMachineId(session)).digest();
}

function filePath(session: string, workspace: string): string {
  return path.join(sessionCacheDir(session), `${workspace}.api`);
}

export async function rememberCredentials(
  session: string,
  workspace: string,
  creds: SlackCredentials,
): Promise<void> {
  await touchSession(session);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, keyFor(session), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(creds), "utf8"),
    cipher.final(),
  ]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), body]);
  await fs.writeFile(filePath(session, workspace), payload, { mode: 0o600 });
}

/** Returns null when nothing was stored, or when it can no longer be read. */
export async function recallCredentials(
  session: string,
  workspace: string,
): Promise<SlackCredentials | null> {
  let payload: Buffer;
  try {
    payload = await fs.readFile(filePath(session, workspace));
  } catch {
    return null;
  }
  if (payload.length <= IV_BYTES + TAG_BYTES) return null;
  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      keyFor(session),
      payload.subarray(0, IV_BYTES),
    );
    decipher.setAuthTag(payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const plain = Buffer.concat([
      decipher.update(payload.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plain) as Partial<SlackCredentials>;
    if (!parsed.token || typeof parsed.cookie !== "string") return null;
    return { token: parsed.token, cookie: parsed.cookie };
  } catch {
    // Wrong key (the server secret changed) or a corrupt file — treat both as
    // "not signed in" rather than an error the caller has to handle.
    return null;
  }
}

/** Workspaces this session has signed in to, newest first. */
export async function listStoredWorkspaces(session: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(sessionCacheDir(session));
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.endsWith(".api"))
    .map((name) => name.slice(0, -".api".length))
    .filter(Boolean)
    .sort();
}

export async function forgetCredentials(session: string, workspace: string): Promise<void> {
  await fs.rm(filePath(session, workspace), { force: true });
}
