/**
 * Talks to the Loquarium browser extension (`extension/`).
 *
 * The extension reads the Slack workspaces signed in to this browser and
 * makes read-only API requests with that session. This page never sees a
 * token: it asks for one request at a time and gets Slack's answer back.
 */

import type { ReadMethod, TransportResponse } from "./api-core";

/**
 * The extension's ID. Fixed by the `key` in its manifest for an unpacked
 * install; a store listing gets its own, set with this variable.
 */
export const EXTENSION_ID =
  process.env.NEXT_PUBLIC_LOQUARIUM_EXTENSION_ID || "nfpimaeahmchnlbobgmpioiolegkpmld";

export interface ExtensionTeam {
  id: string;
  name: string;
  /** The workspace subdomain: `acme` for acme.slack.com. */
  domain: string;
  /** The signed-in person's Slack ID in that workspace. */
  userId?: string;
  icon?: string;
}

export class ExtensionError extends Error {
  constructor(
    message: string,
    /** `missing` when the extension is not installed or not reachable. */
    readonly code: "missing" | "failed",
  ) {
    super(message);
    this.name = "ExtensionError";
  }
}

interface ChromeRuntime {
  sendMessage: (id: string, message: unknown, callback: (response: unknown) => void) => void;
  lastError?: { message?: string };
}

function runtime(): ChromeRuntime | null {
  const chrome = (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome;
  return chrome?.runtime?.sendMessage ? chrome.runtime : null;
}

function send<T>(message: unknown, timeoutMs = 60_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const rt = runtime();
    // Chrome only exposes `chrome.runtime` to a page some installed extension
    // lists as allowed to talk to it — its absence means "not installed".
    if (!rt) return reject(new ExtensionError("not installed", "missing"));
    const timer = setTimeout(() => reject(new ExtensionError("timeout", "failed")), timeoutMs);
    try {
      rt.sendMessage(EXTENSION_ID, message, (response) => {
        clearTimeout(timer);
        const error = rt.lastError;
        if (error) return reject(new ExtensionError(error.message ?? "unreachable", "missing"));
        const res = response as { ok?: boolean; error?: string } | undefined;
        if (!res?.ok) return reject(new ExtensionError(res?.error ?? "no answer", "failed"));
        resolve(res as T);
      });
    } catch (err) {
      clearTimeout(timer);
      reject(new ExtensionError(err instanceof Error ? err.message : String(err), "missing"));
    }
  });
}

/** The extension's version, or null when it is not installed. */
export async function extensionVersion(): Promise<string | null> {
  try {
    const res = await send<{ version: string }>({ type: "ping" }, 3_000);
    return res.version;
  } catch {
    return null;
  }
}

/**
 * The workspaces signed in to this browser. With `open`, the extension opens
 * Slack in a background tab when none is open, to read them.
 */
export async function extensionTeams(open: boolean): Promise<ExtensionTeam[]> {
  const res = await send<{ teams: ExtensionTeam[] }>({ type: "teams", open }, 45_000);
  return res.teams;
}

/** One read-only Slack API request, made by the extension. */
export async function extensionCall(
  team: string,
  method: ReadMethod,
  params: Record<string, string>,
): Promise<TransportResponse> {
  const res = await send<TransportResponse>({ type: "call", team, method, params });
  return { status: res.status, retryAfter: res.retryAfter, body: res.body };
}

/** One image attached to a message, downloaded by the extension with the browser's session. */
export async function extensionFile(
  team: string,
  url: string,
): Promise<{ status: number; retryAfter?: number; blob?: Blob }> {
  const res = await send<{ status: number; retryAfter?: number; type?: string; data?: string }>(
    { type: "file", team, url },
    60_000,
  );
  if (res.status !== 200 || !res.data) return { status: res.status, retryAfter: res.retryAfter };
  const binary = atob(res.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { status: 200, blob: new Blob([bytes], { type: res.type || "image/png" }) };
}
