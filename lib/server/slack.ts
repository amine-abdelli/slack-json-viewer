/**
 * The bridge between the app and Slack, for people who sign in with a token
 * and cookie ("Other ways to connect").
 *
 * Everything runs on the Slack Web API (see `./slack-api`). Credentials never
 * travel back to the page: they live encrypted in the visitor's own httpOnly
 * cookies (`./credentials`), so the server keeps no state and runs anywhere,
 * Vercel included.
 *
 * The recommended path — the browser extension — does not come here at all.
 */

import { sm, sp, st } from "@/lib/i18n/server";

import type { BridgeStatus, ChannelSummary } from "@/lib/slack/bridge-types";

import type { CredentialJar, SlackCredentials } from "./credentials";
import {
  ALL_CHANNEL_TYPES,
  authTest,
  type Conversation,
  conversationsList,
  dumpConversation,
  isAuthError,
  type RawUser,
  SlackApiError,
  summariseChannels,
  usersConversations,
  usersInfo,
} from "./slack-api";

export type { BridgeStatus, ChannelSummary };
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
/*  Status and sign-in                                                         */
/* -------------------------------------------------------------------------- */

export function status(jar: CredentialJar): BridgeStatus {
  // The API path needs nothing but network, so the form is always offered.
  return { available: true, workspaces: jar.workspaces() };
}

/** Registers credentials the caller read from their own developer tools. */
export async function authenticateWithToken(
  jar: CredentialJar,
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

  const creds: SlackCredentials = { token, cookie };
  onLog?.(sm().checking);
  const who = await authTest(creds, signal);
  onLog?.(st(sm().signedIn, { user: who.user ?? "?", team: who.team ?? workspace }));
  jar.set(workspace, creds);
  return { workspace };
}

export function logout(jar: CredentialJar, rawWorkspace: string): void {
  jar.delete(assertWorkspace(rawWorkspace));
}

/* -------------------------------------------------------------------------- */
/*  Operations                                                                 */
/* -------------------------------------------------------------------------- */

/** Reads this browser's credentials, or explains that it has to sign in. */
export function credentialsFor(jar: CredentialJar, workspace: string): SlackCredentials {
  const creds = jar.get(workspace);
  if (!creds) {
    throw new BridgeError(
      st(sm().noCredentials, { workspace }),
    );
  }
  return creds;
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
  jar: CredentialJar,
  rawWorkspace: string,
  memberOnly = true,
  onLog?: LogFn,
  signal?: AbortSignal,
): Promise<ChannelSummary[]> {
  const workspace = assertWorkspace(rawWorkspace);
  const creds = credentialsFor(jar, workspace);
  const list = memberOnly ? usersConversations : conversationsList;
  onLog?.(memberOnly ? sm().listingMine : sm().listingAll);
  return summariseChannels(await list(creds, ALL_CHANNEL_TYPES, onLog, signal));
}

/**
 * Resolves just the people who appear in a conversation.
 *
 * Not `users.list`: that walks the whole workspace directory — tens of
 * thousands of accounts for a conversation involving a few dozen.
 */
export async function resolveUsers(
  jar: CredentialJar,
  rawWorkspace: string,
  ids: string[],
  onLog?: LogFn,
  signal?: AbortSignal,
): Promise<RawUser[]> {
  const workspace = assertWorkspace(rawWorkspace);
  const creds = credentialsFor(jar, workspace);
  onLog?.(sp(sm().resolving, ids.length));
  return usersInfo(creds, ids, onLog, signal);
}

/** Dumps one conversation, threads included. */
export async function dumpChannel(
  jar: CredentialJar,
  rawWorkspace: string,
  rawChannel: string,
  onLog?: LogFn,
  signal?: AbortSignal,
  known?: Record<string, string>,
): Promise<Conversation> {
  const workspace = assertWorkspace(rawWorkspace);
  const channel = assertChannel(rawChannel);
  const creds = credentialsFor(jar, workspace);
  return dumpConversation(creds, channel, onLog, signal, { known });
}

export { isAuthError };
