/**
 * Loquarium for Slack — the extension's service worker.
 *
 * Loquarium (a web page, listed in `externally_connectable`) asks for two
 * things:
 *
 *   { type: "ping" }                       → { ok, version }
 *   { type: "teams", open? }               → { ok, teams: [{ id, name, domain, userId, icon }] }
 *   { type: "call", team, method, params } → { ok, status, retryAfter, body }
 *   { type: "file", team, url }            → { ok, status, retryAfter, type, data }
 *
 * The Slack web client keeps each signed-in workspace, with its client token,
 * in the `localConfig_v2` entry of app.slack.com's localStorage. The worker
 * reads it from an open Slack tab (or a background tab it opens and closes),
 * keeps the tokens for the browser session only, and makes each API request
 * itself, with the browser's own Slack cookie. **Tokens never leave the
 * extension**, and only the read-only methods below are relayed.
 *
 * `file` downloads one image attached to a message (a screenshot), for the
 * copy Loquarium keeps: only from Slack's file hosts (`*.slack.com/files-…`),
 * only images, at most 8 MB, returned base64-encoded.
 */

import { CONFIG } from "./config.js";

const VERSION = chrome.runtime.getManifest().version;

const READ_METHODS = new Set([
  "auth.test",
  "users.conversations",
  "conversations.list",
  "conversations.info",
  "conversations.history",
  "conversations.replies",
  "conversations.members",
  "users.info",
]);

/* ------------------------------------------------------------------ teams */

/** Workspaces found in `localConfig_v2`, without their tokens. */
function publicTeam(t) {
  return {
    id: t.id,
    name: t.name || t.domain || t.id,
    domain: t.domain || "",
    userId: t.userId || undefined,
    icon: t.icon || undefined,
  };
}

async function storedTeams() {
  const { teams } = await chrome.storage.session.get("teams");
  return Array.isArray(teams) ? teams : [];
}

function waitForLoad(tabId, timeoutMs) {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") done();
    };
    const timer = setTimeout(done, timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/** Runs in the Slack tab: returns what the web client stored. */
function readLocalConfig() {
  try {
    return localStorage.getItem("localConfig_v2");
  } catch {
    return null;
  }
}

function parseConfig(raw) {
  if (!raw) return [];
  try {
    const config = JSON.parse(raw);
    return Object.values(config?.teams ?? {})
      .filter((t) => t && typeof t.token === "string" && t.token.startsWith("xox"))
      .map((t) => ({
        id: String(t.id),
        name: String(t.name ?? ""),
        domain: String(t.domain ?? ""),
        userId: t.user_id ? String(t.user_id) : undefined,
        icon: t.icon?.image_68 || t.icon?.image_44 || undefined,
        token: t.token,
      }));
  } catch {
    return [];
  }
}

/**
 * Reads the signed-in workspaces from Slack's tabs. With `open`, and when no
 * Slack tab is open, opens one in the background long enough to read it.
 */
async function readTeams(open) {
  let tabs = await chrome.tabs.query({ url: CONFIG.appTabs });
  let opened = null;
  if (tabs.length === 0 && open) {
    opened = await chrome.tabs.create({ url: CONFIG.appStart, active: false });
    await waitForLoad(opened.id, 20_000);
    tabs = [opened];
  }

  const found = new Map();
  for (const tab of tabs) {
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: readLocalConfig,
      });
      for (const team of parseConfig(injection?.result)) found.set(team.id, team);
    } catch {
      // a tab still loading, or showing an error page: skip it
    }
  }
  if (opened) chrome.tabs.remove(opened.id).catch(() => {});

  const teams = [...found.values()];
  await chrome.storage.session.set({ teams });
  return teams;
}

/* ------------------------------------------------------------------- call */

async function callSlack(teamId, method, params) {
  if (!READ_METHODS.has(method)) {
    return { ok: false, error: "method_not_allowed" };
  }
  let team = (await storedTeams()).find((t) => t.id === teamId);
  if (!team) team = (await readTeams(true)).find((t) => t.id === teamId);
  if (!team) return { ok: false, error: "team_not_found" };

  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (typeof value === "string" && key !== "token") body.set(key, value);
  }
  body.set("token", team.token);

  const res = await fetch(`${CONFIG.apiBase}/${method}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
    body,
  });
  return {
    ok: true,
    status: res.status,
    retryAfter: Number(res.headers.get("retry-after")) || undefined,
    body: res.ok ? await res.json() : undefined,
  };
}

/* ------------------------------------------------------------------- file */

const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Slack's file hosts only — the same rule as `isSlackFileUrl` in Loquarium. */
function isSlackFileUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "slack.com" || url.hostname.endsWith(".slack.com")) &&
      url.pathname.startsWith("/files-")
    );
  } catch {
    return false;
  }
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function fetchFile(teamId, url) {
  if (typeof url !== "string" || !isSlackFileUrl(url)) {
    return { ok: false, error: "url_not_allowed" };
  }
  let team = (await storedTeams()).find((t) => t.id === teamId);
  if (!team) team = (await readTeams(true)).find((t) => t.id === teamId);
  if (!team) return { ok: false, error: "team_not_found" };

  const target = CONFIG.filesOrigin ? CONFIG.filesOrigin + new URL(url).pathname : url;
  const res = await fetch(target, {
    credentials: "include",
    headers: { authorization: `Bearer ${team.token}` },
  });
  const type = (res.headers.get("content-type") || "").split(";")[0].trim();
  if (!res.ok) {
    return {
      ok: true,
      status: res.status,
      retryAfter: Number(res.headers.get("retry-after")) || undefined,
    };
  }
  // Signed out, Slack answers with its sign-in page rather than the image.
  if (!type.startsWith("image/")) return { ok: true, status: 415 };
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_FILE_BYTES) return { ok: true, status: 413 };
  return { ok: true, status: 200, type, data: toBase64(buffer) };
}

/* --------------------------------------------------------------- messages */

async function handle(message) {
  switch (message?.type) {
    case "ping":
      return { ok: true, version: VERSION };
    case "teams": {
      const teams = await readTeams(Boolean(message.open));
      return { ok: true, teams: teams.map(publicTeam) };
    }
    case "call":
      return callSlack(String(message.team ?? ""), String(message.method ?? ""), message.params);
    case "file":
      return fetchFile(String(message.team ?? ""), message.url);
    default:
      return { ok: false, error: "unknown_message" };
  }
}

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  handle(message).then(sendResponse, (err) =>
    sendResponse({ ok: false, error: String(err?.message ?? err) }),
  );
  return true; // the answer comes asynchronously
});

// The popup asks through the same entry point.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  handle(message).then(sendResponse, (err) =>
    sendResponse({ ok: false, error: String(err?.message ?? err) }),
  );
  return true;
});
