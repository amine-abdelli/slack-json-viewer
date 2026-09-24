/**
 * Browser-side client for the `/api/slack` routes.
 *
 * `runJob` consumes the NDJSON progress stream: every `log` line is handed to
 * the caller as it arrives, and the promise settles on the final `done` or
 * `error` event.
 */

import type { BridgeStatus, RunEvent, RunRequest } from "./bridge-types";
import {
  detectBrowserLocale,
  isLocale,
  LOCALE_HEADER,
  LOCALE_STORAGE_KEY,
  type Locale,
} from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/format";
import { MESSAGES } from "@/lib/i18n/messages";

/**
 * The language the page is displayed in — the same rule as `I18nProvider`:
 * the one chosen by hand, else the browser's. Sent with every request so the
 * bridge's progress lines and errors come back in it.
 */
function uiLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    /* fall through */
  }
  return detectBrowserLocale();
}

function localeHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { ...extra, [LOCALE_HEADER]: uiLocale() };
}

export class BridgeClientError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "BridgeClientError";
  }
}

/** Probes the server; returns null when the endpoint is not deployed at all. */
export async function fetchStatus(signal?: AbortSignal): Promise<BridgeStatus | null> {
  try {
    const res = await fetch("/api/slack/status", {
      signal,
      cache: "no-store",
      headers: localeHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as BridgeStatus;
  } catch {
    return null;
  }
}

export async function runJob<T>(
  job: RunRequest,
  onLog: (line: string) => void,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch("/api/slack/run", {
    method: "POST",
    headers: localeHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(job),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new BridgeClientError(
      (await res.text().catch(() => "")) ||
        interpolate(MESSAGES[uiLocale()].bridge.requestFailed, { status: res.status }),
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: { ok: true; data: T } | null = null;

  const handle = (line: string) => {
    let event: RunEvent;
    try {
      event = JSON.parse(line) as RunEvent;
    } catch {
      return; // ignore a partial or malformed line
    }
    if (event.t === "log") onLog(event.m);
    else if (event.t === "done") result = { ok: true, data: event.data as T };
    else if (event.t === "error") throw new BridgeClientError(event.m, event.detail);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) handle(line);
    }
    if (done) break;
  }
  if (buffer.trim()) handle(buffer);

  if (!result) {
    throw new BridgeClientError(MESSAGES[uiLocale()].bridge.interrupted);
  }
  return (result as { ok: true; data: T }).data;
}

export async function logoutWorkspace(workspace: string): Promise<void> {
  await fetch("/api/slack/logout", {
    method: "POST",
    headers: localeHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ workspace }),
  });
}
