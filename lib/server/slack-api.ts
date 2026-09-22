/**
 * The Slack Web API client the app runs on.
 *
 * Everything the bridge does — validating credentials, listing conversations,
 * resolving names, dumping a channel — goes through here. `slackdump` used to
 * do this work, but on a workspace the size of ADEO's it was unusable: its
 * listing walks tens of thousands of channels and accounts to answer questions
 * the API answers in one request.
 *
 * Only the QR login still shells out, because reading a sign-in QR code needs
 * a browser (see `tools/qrauth`).
 */

import type { SlackCredentials } from "./credentials";

/** Overridable so tests can point at a stub. */
const API_BASE = process.env.SLACK_API_BASE ?? "https://slack.com/api";

/** All the conversation kinds the viewer can render. */
export const ALL_CHANNEL_TYPES = "public_channel,private_channel,mpim,im";

const PAGE_SIZE = 1000;
/** `conversations.history` is happier with smaller pages than the maximum. */
const HISTORY_PAGE_SIZE = 200;

/** Guards against a runaway cursor loop. */
const MAX_LIST_PAGES = 30;
/** 500 pages of 200 is 100 000 messages — far past any real conversation. */
const MAX_HISTORY_PAGES = 500;

/** `users.info` is Tier 4, `conversations.replies` Tier 3: different budgets. */
const USER_CONCURRENCY = 8;
const THREAD_CONCURRENCY = 4;

const MAX_USERS = 3000;
const MAX_RETRIES = 3;
/** Never sleep longer than this on a 429, however long Slack asks for. */
const MAX_RETRY_WAIT_MS = 60_000;

export type LogFn = (line: string) => void;

export class SlackApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "SlackApiError";
  }
}

/* -------------------------------------------------------------------------- */
/*  Shapes                                                                     */
/* -------------------------------------------------------------------------- */

interface ApiResponse {
  ok?: boolean;
  error?: string;
}

/** Channel as the conversation endpoints return it. */
export interface RawChannel {
  id?: string;
  name?: string;
  name_normalized?: string;
  is_private?: boolean;
  is_im?: boolean;
  is_mpim?: boolean;
  is_archived?: boolean;
  num_members?: number;
  user?: string;
  topic?: { value?: string };
  purpose?: { value?: string };
}

/** Slack user as `users.info` returns it — the shape the viewer already parses. */
export interface RawUser {
  id?: string;
  name?: string;
  real_name?: string;
  deleted?: boolean;
  is_bot?: boolean;
  profile?: Record<string, unknown>;
}

/** A message is passed through untouched; only threading fields are read. */
export type RawMessage = Record<string, unknown> & {
  ts?: string;
  thread_ts?: string;
  reply_count?: number;
};

export interface AuthTest {
  url?: string;
  team?: string;
  team_id?: string;
  user?: string;
  user_id?: string;
}

/** The dump the viewer consumes: `{ channel_id, name, messages }`. */
export interface Conversation {
  channel_id: string;
  name: string;
  messages: RawMessage[];
}

interface ConversationsResponse extends ApiResponse {
  channels?: RawChannel[];
  response_metadata?: { next_cursor?: string };
}

interface HistoryResponse extends ApiResponse {
  messages?: RawMessage[];
  has_more?: boolean;
  response_metadata?: { next_cursor?: string };
}

interface InfoResponse extends ApiResponse {
  channel?: RawChannel;
}

interface UserResponse extends ApiResponse {
  user?: RawUser;
}

type AuthTestResponse = ApiResponse & AuthTest;

/* -------------------------------------------------------------------------- */
/*  Transport                                                                  */
/* -------------------------------------------------------------------------- */

/** Messages worth showing instead of Slack's bare error code. */
const FRIENDLY: Record<string, string> = {
  invalid_auth: "Les identifiants Slack ne sont plus valides — reconnectez-vous.",
  not_authed: "Les identifiants Slack ne sont plus valides — reconnectez-vous.",
  token_revoked: "Le jeton Slack a été révoqué — reconnectez-vous.",
  token_expired: "Le jeton Slack a expiré — reconnectez-vous.",
  channel_not_found: "Ce canal est introuvable, ou votre compte n'y a pas accès.",
  not_in_channel: "Votre compte n'est pas membre de ce canal.",
  missing_scope: "Ce jeton n'a pas les droits nécessaires pour cette requête.",
  ratelimited: "Slack limite les requêtes ; réessayez dans un instant.",
};

/** Credential problems: no point retrying or falling back on these. */
export const FATAL_AUTH_CODES = [
  "invalid_auth",
  "not_authed",
  "token_revoked",
  "token_expired",
] as const;

export function isAuthError(err: unknown): boolean {
  return (
    err instanceof SlackApiError &&
    Boolean(err.code) &&
    (FATAL_AUTH_CODES as readonly string[]).includes(err.code!)
  );
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });
}

interface CallOptions {
  signal?: AbortSignal;
  onLog?: LogFn;
  /** Error codes to return rather than throw on, for per-item failures. */
  tolerate?: readonly string[];
}

async function call<T extends ApiResponse>(
  creds: SlackCredentials,
  method: string,
  params: Record<string, string>,
  { signal, onLog, tolerate = [] }: CallOptions = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API_BASE}/${method}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${creds.token}`,
        // Slack sets `d` URL-encoded; it must go back exactly as received.
        cookie: `d=${creds.cookie}`,
        "content-type": "application/x-www-form-urlencoded; charset=utf-8",
      },
      // The Slack web client posts the token as a form field; some methods are
      // picky about `xoxc` tokens arriving only in the header, so send both.
      body: new URLSearchParams({ token: creds.token, ...params }).toString(),
      signal,
    });

    // Slack throttles with 429 and says how long to wait.
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const wait = Math.min((Number(res.headers.get("retry-after")) || 1) * 1000, MAX_RETRY_WAIT_MS);
      onLog?.(`Slack limite les requêtes, pause de ${Math.round(wait / 1000)} s…`);
      await sleep(wait, signal);
      continue;
    }
    if (!res.ok) {
      throw new SlackApiError(`Slack a répondu ${res.status} à ${method}.`, `http_${res.status}`);
    }

    const body = (await res.json()) as T;
    if (!body.ok) {
      const code = body.error ?? "unknown_error";
      if (tolerate.includes(code)) return body;
      if (code === "ratelimited" && attempt < MAX_RETRIES) {
        onLog?.("Slack limite les requêtes, nouvelle tentative…");
        await sleep(1000 * (attempt + 1), signal);
        continue;
      }
      throw new SlackApiError(FRIENDLY[code] ?? `Slack a refusé ${method} : ${code}.`, code);
    }
    return body;
  }
}

/** Runs `task` over `items` with a bounded number in flight. */
async function inParallel<T>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length || signal?.aborted) return;
      await task(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/* -------------------------------------------------------------------------- */
/*  Identity                                                                   */
/* -------------------------------------------------------------------------- */

/** Validates credentials and reports who they belong to. */
export async function authTest(
  creds: SlackCredentials,
  signal?: AbortSignal,
): Promise<AuthTest> {
  const body = await call<AuthTestResponse>(creds, "auth.test", {}, { signal });
  return { url: body.url, team: body.team, team_id: body.team_id, user: body.user, user_id: body.user_id };
}

/* -------------------------------------------------------------------------- */
/*  Conversations                                                              */
/* -------------------------------------------------------------------------- */

async function listConversations(
  creds: SlackCredentials,
  method: "users.conversations" | "conversations.list",
  types: string,
  onLog?: LogFn,
  signal?: AbortSignal,
): Promise<RawChannel[]> {
  const out: RawChannel[] = [];
  let cursor = "";

  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const body = await call<ConversationsResponse>(
      creds,
      method,
      {
        types,
        limit: String(PAGE_SIZE),
        exclude_archived: "false",
        ...(cursor ? { cursor } : {}),
      },
      { signal, onLog },
    );
    out.push(...(body.channels ?? []));
    cursor = body.response_metadata?.next_cursor ?? "";
    onLog?.(`${out.length} conversations récupérées`);
    if (!cursor) return out;
  }
  onLog?.(`arrêt après ${MAX_LIST_PAGES} pages`);
  return out;
}

/** The conversations the authenticated user belongs to — a short list. */
export function usersConversations(
  creds: SlackCredentials,
  types = ALL_CHANNEL_TYPES,
  onLog?: LogFn,
  signal?: AbortSignal,
): Promise<RawChannel[]> {
  return listConversations(creds, "users.conversations", types, onLog, signal);
}

/** Every visible conversation — slow on a large workspace, by nature. */
export function conversationsList(
  creds: SlackCredentials,
  types = ALL_CHANNEL_TYPES,
  onLog?: LogFn,
  signal?: AbortSignal,
): Promise<RawChannel[]> {
  return listConversations(creds, "conversations.list", types, onLog, signal);
}

export async function conversationsInfo(
  creds: SlackCredentials,
  channel: string,
  signal?: AbortSignal,
): Promise<RawChannel | null> {
  const body = await call<InfoResponse>(
    creds,
    "conversations.info",
    { channel },
    { signal, tolerate: ["channel_not_found"] },
  );
  return body.channel ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Users                                                                      */
/* -------------------------------------------------------------------------- */

/** Slack IDs: U/W for people, B for bots. */
const USER_ID_RE = /^[UWB][A-Z0-9]{6,}$/;

export function isUserId(value: string): boolean {
  return USER_ID_RE.test(value);
}

/**
 * Resolves a specific set of user IDs.
 *
 * Deliberately not `users.list`: on a workspace the size of ADEO's that walks
 * tens of thousands of accounts, while a conversation involves a few dozen.
 * Unknown or deleted accounts are skipped rather than failing the batch.
 */
export async function usersInfo(
  creds: SlackCredentials,
  ids: string[],
  onLog?: LogFn,
  signal?: AbortSignal,
): Promise<RawUser[]> {
  const wanted = [...new Set(ids.filter(isUserId))].slice(0, MAX_USERS);
  if (wanted.length === 0) return [];

  const out: RawUser[] = [];
  let done = 0;

  await inParallel(
    wanted,
    USER_CONCURRENCY,
    async (id) => {
      const body = await call<UserResponse>(
        creds,
        "users.info",
        { user: id },
        { signal, onLog, tolerate: ["user_not_found", "account_inactive"] },
      );
      if (body.ok && body.user) out.push(body.user);
      done += 1;
      if (done % 25 === 0 || done === wanted.length) {
        onLog?.(`${done}/${wanted.length} membres résolus`);
      }
    },
    signal,
  );
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Dumping a conversation                                                     */
/* -------------------------------------------------------------------------- */

async function conversationsHistory(
  creds: SlackCredentials,
  channel: string,
  onLog?: LogFn,
  signal?: AbortSignal,
): Promise<RawMessage[]> {
  const out: RawMessage[] = [];
  let cursor = "";

  for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
    const body = await call<HistoryResponse>(
      creds,
      "conversations.history",
      {
        channel,
        limit: String(HISTORY_PAGE_SIZE),
        inclusive: "true",
        ...(cursor ? { cursor } : {}),
      },
      { signal, onLog },
    );
    const batch = body.messages ?? [];
    out.push(...batch);
    if (page === 0 && batch.length === 0) {
      onLog?.("Slack a répondu sans erreur, mais sans aucun message.");
    } else {
      onLog?.(`${out.length} messages récupérés`);
    }
    cursor = body.response_metadata?.next_cursor ?? "";
    if (!cursor) return out;
  }
  onLog?.(`arrêt après ${MAX_HISTORY_PAGES} pages d'historique`);
  return out;
}

/**
 * All the messages of one thread, root included.
 *
 * The viewer flattens and deduplicates by `ts`, so the repeated root is
 * harmless and keeping it matches what Slack actually returns.
 */
async function conversationsReplies(
  creds: SlackCredentials,
  channel: string,
  ts: string,
  onLog?: LogFn,
  signal?: AbortSignal,
): Promise<RawMessage[]> {
  const out: RawMessage[] = [];
  let cursor = "";

  for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
    const body = await call<HistoryResponse>(
      creds,
      "conversations.replies",
      {
        channel,
        ts,
        limit: String(HISTORY_PAGE_SIZE),
        ...(cursor ? { cursor } : {}),
      },
      { signal, onLog, tolerate: ["thread_not_found"] },
    );
    if (!body.ok) return out;
    out.push(...(body.messages ?? []));
    cursor = body.response_metadata?.next_cursor ?? "";
    if (!cursor) return out;
  }
  return out;
}

/**
 * Dumps a whole conversation, threads included, in the shape the viewer reads.
 *
 * `conversations.history` returns roots only, newest first; each thread costs
 * one further call, which is why they are fetched a few at a time and progress
 * is reported as it goes.
 */
export async function dumpConversation(
  creds: SlackCredentials,
  channel: string,
  onLog?: LogFn,
  signal?: AbortSignal,
): Promise<Conversation> {
  const info = await conversationsInfo(creds, channel, signal).catch((err) => {
    onLog?.(
      `conversations.info a échoué (${err instanceof SlackApiError ? err.code : "erreur"})`,
    );
    return null;
  });
  // Worth saying out loud: a channel this token cannot even describe is usually
  // one it cannot read either.
  if (!info) onLog?.(`Slack ne décrit pas le canal ${channel} pour ce jeton.`);

  const messages = await conversationsHistory(creds, channel, onLog, signal);
  if (messages.length === 0) {
    throw new SlackApiError(
      "Slack n'a renvoyé aucun message pour cette conversation. " +
        "Si elle n'est pas vide, ce jeton n'y a pas accès — sur Enterprise Grid " +
        "un jeton est lié à un espace de travail précis.",
      "empty_history",
    );
  }
  // History comes back newest first; the viewer sorts too, but keeping the file
  // chronological makes it readable on its own.
  messages.sort((a, b) => Number(a.ts ?? 0) - Number(b.ts ?? 0));

  const roots = messages.filter(
    (m) => typeof m.ts === "string" && m.thread_ts === m.ts && (m.reply_count ?? 0) > 0,
  );

  if (roots.length > 0) {
    onLog?.(`${roots.length} fils de discussion à récupérer…`);
    let done = 0;
    await inParallel(
      roots,
      THREAD_CONCURRENCY,
      async (root) => {
        const replies = await conversationsReplies(creds, channel, root.ts!, onLog, signal);
        if (replies.length > 0) root.replies = replies;
        done += 1;
        if (done % 10 === 0 || done === roots.length) {
          onLog?.(`${done}/${roots.length} fils récupérés`);
        }
      },
      signal,
    );
  }

  return {
    channel_id: channel,
    // Left empty for DMs: the viewer rebuilds the title from the participants.
    name: info?.name || info?.name_normalized || "",
    messages,
  };
}
