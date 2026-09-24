/**
 * The Slack Web API client, independent of where it runs.
 *
 * Two places drive it:
 *  - the server bridge (`lib/server/slack-api.ts`), with a token and cookie
 *    the person signed in with;
 *  - the page itself, through the Loquarium browser extension, which makes
 *    each request with the Slack session already open in the browser
 *    (`lib/slack/sources.ts`).
 *
 * The logic — pagination, rate limits, threads, name resolution — is the same
 * in both, so it lives here. What differs is injected: how one request is
 * made (`Transport`) and how progress lines and errors are worded (`word`).
 * No Node or browser import is allowed in this file.
 */

import type { ChannelSummary } from "./bridge-types";

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

/** The read-only methods this client uses — and the only ones the extension relays. */
export const READ_METHODS = [
  "auth.test",
  "users.conversations",
  "conversations.list",
  "conversations.info",
  "conversations.history",
  "conversations.replies",
  "users.info",
] as const;
export type ReadMethod = (typeof READ_METHODS)[number];

/* -------------------------------------------------------------------------- */
/*  Injected pieces                                                            */
/* -------------------------------------------------------------------------- */

/** What one HTTP exchange with Slack came back with. */
export interface TransportResponse {
  status: number;
  /** `Retry-After`, in seconds, on a 429. */
  retryAfter?: number;
  /** The parsed JSON body, when the status is 2xx. */
  body?: unknown;
}

export type Transport = (
  method: ReadMethod,
  params: Record<string, string>,
  signal?: AbortSignal,
) => Promise<TransportResponse>;

/**
 * A progress line or an error, before it is worded. `key` names an entry of
 * the `server` catalogue; `count` picks a plural form.
 */
export type ApiText =
  | { key: "rateLimitedWait"; params: { seconds: number } }
  | { key: "rateLimitedRetry" }
  | { key: "slackHttp"; params: { status: number; method: string } }
  | { key: "slackRefused"; params: { method: string; code: string } }
  | { key: "conversationsFetched"; count: number }
  | { key: "stoppedAfterPages"; params: { max: number } }
  | { key: "usersResolved"; params: { done: number; total: number } }
  | { key: "emptyFirstPage" }
  | { key: "messagesFetched"; count: number }
  | { key: "stoppedAfterHistory"; params: { max: number } }
  | { key: "infoFailed"; params: { code: string } }
  | { key: "noChannelInfo"; params: { channel: string } }
  | { key: "emptyHistory" }
  | { key: "threadsToFetch"; count: number }
  | { key: "threadsFetched"; params: { done: number; total: number } };

export interface ApiContext {
  transport: Transport;
  word: (text: ApiText) => string;
}

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
  ctx: ApiContext,
  method: ReadMethod,
  params: Record<string, string>,
  { signal, onLog, tolerate = [] }: CallOptions = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw new Error("aborted");
    const res = await ctx.transport(method, params, signal);

    // Slack throttles with 429 and says how long to wait.
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const wait = Math.min((res.retryAfter || 1) * 1000, MAX_RETRY_WAIT_MS);
      onLog?.(ctx.word({ key: "rateLimitedWait", params: { seconds: Math.round(wait / 1000) } }));
      await sleep(wait, signal);
      continue;
    }
    if (res.status < 200 || res.status >= 300) {
      throw new SlackApiError(
        ctx.word({ key: "slackHttp", params: { status: res.status, method } }),
        `http_${res.status}`,
      );
    }

    const body = (res.body ?? {}) as T;
    if (!body.ok) {
      const code = body.error ?? "unknown_error";
      if (tolerate.includes(code)) return body;
      if (code === "ratelimited" && attempt < MAX_RETRIES) {
        onLog?.(ctx.word({ key: "rateLimitedRetry" }));
        await sleep(1000 * (attempt + 1), signal);
        continue;
      }
      throw new SlackApiError(ctx.word({ key: "slackRefused", params: { method, code } }), code);
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
export async function authTest(ctx: ApiContext, signal?: AbortSignal): Promise<AuthTest> {
  const body = await call<AuthTestResponse>(ctx, "auth.test", {}, { signal });
  return {
    url: body.url,
    team: body.team,
    team_id: body.team_id,
    user: body.user,
    user_id: body.user_id,
  };
}

/* -------------------------------------------------------------------------- */
/*  Conversations                                                              */
/* -------------------------------------------------------------------------- */

async function listConversations(
  ctx: ApiContext,
  method: "users.conversations" | "conversations.list",
  types: string,
  onLog?: LogFn,
  signal?: AbortSignal,
): Promise<RawChannel[]> {
  const out: RawChannel[] = [];
  let cursor = "";

  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const body = await call<ConversationsResponse>(
      ctx,
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
    onLog?.(ctx.word({ key: "conversationsFetched", count: out.length }));
    if (!cursor) return out;
  }
  onLog?.(ctx.word({ key: "stoppedAfterPages", params: { max: MAX_LIST_PAGES } }));
  return out;
}

/** The conversations the authenticated user belongs to — a short list. */
export function usersConversations(
  ctx: ApiContext,
  types = ALL_CHANNEL_TYPES,
  onLog?: LogFn,
  signal?: AbortSignal,
): Promise<RawChannel[]> {
  return listConversations(ctx, "users.conversations", types, onLog, signal);
}

/** Every visible conversation — slow on a large workspace, by nature. */
export function conversationsList(
  ctx: ApiContext,
  types = ALL_CHANNEL_TYPES,
  onLog?: LogFn,
  signal?: AbortSignal,
): Promise<RawChannel[]> {
  return listConversations(ctx, "conversations.list", types, onLog, signal);
}

export async function conversationsInfo(
  ctx: ApiContext,
  channel: string,
  signal?: AbortSignal,
): Promise<RawChannel | null> {
  const body = await call<InfoResponse>(
    ctx,
    "conversations.info",
    { channel },
    { signal, tolerate: ["channel_not_found"] },
  );
  return body.channel ?? null;
}

/** The fields the channel picker shows. */
export function summariseChannels(raw: RawChannel[]): ChannelSummary[] {
  return raw
    .filter((c): c is RawChannel & { id: string } => Boolean(c?.id))
    .map((c) => ({
      id: c.id,
      name: c.name || c.name_normalized || "",
      isPrivate: Boolean(c.is_private),
      isIM: Boolean(c.is_im),
      isMPIM: Boolean(c.is_mpim),
      isArchived: Boolean(c.is_archived),
      memberCount: c.num_members ?? 0,
      topic: c.topic?.value || c.purpose?.value || undefined,
      user: c.user || undefined,
    }));
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
  ctx: ApiContext,
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
        ctx,
        "users.info",
        { user: id },
        { signal, onLog, tolerate: ["user_not_found", "account_inactive"] },
      );
      if (body.ok && body.user) out.push(body.user);
      done += 1;
      if (done % 25 === 0 || done === wanted.length) {
        onLog?.(ctx.word({ key: "usersResolved", params: { done, total: wanted.length } }));
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
  ctx: ApiContext,
  channel: string,
  onLog?: LogFn,
  signal?: AbortSignal,
): Promise<RawMessage[]> {
  const out: RawMessage[] = [];
  let cursor = "";

  for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
    const body = await call<HistoryResponse>(
      ctx,
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
      onLog?.(ctx.word({ key: "emptyFirstPage" }));
    } else {
      onLog?.(ctx.word({ key: "messagesFetched", count: out.length }));
    }
    cursor = body.response_metadata?.next_cursor ?? "";
    if (!cursor) return out;
  }
  onLog?.(ctx.word({ key: "stoppedAfterHistory", params: { max: MAX_HISTORY_PAGES } }));
  return out;
}

/**
 * All the messages of one thread, root included.
 *
 * The viewer flattens and deduplicates by `ts`, so the repeated root is
 * harmless and keeping it matches what Slack actually returns.
 */
async function conversationsReplies(
  ctx: ApiContext,
  channel: string,
  ts: string,
  onLog?: LogFn,
  signal?: AbortSignal,
): Promise<RawMessage[]> {
  const out: RawMessage[] = [];
  let cursor = "";

  for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
    const body = await call<HistoryResponse>(
      ctx,
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
  ctx: ApiContext,
  channel: string,
  onLog?: LogFn,
  signal?: AbortSignal,
): Promise<Conversation> {
  const info = await conversationsInfo(ctx, channel, signal).catch((err) => {
    onLog?.(
      ctx.word({
        key: "infoFailed",
        params: { code: (err instanceof SlackApiError && err.code) || "?" },
      }),
    );
    return null;
  });
  // Worth saying out loud: a channel this token cannot even describe is usually
  // one it cannot read either.
  if (!info) onLog?.(ctx.word({ key: "noChannelInfo", params: { channel } }));

  const messages = await conversationsHistory(ctx, channel, onLog, signal);
  if (messages.length === 0) {
    throw new SlackApiError(ctx.word({ key: "emptyHistory" }), "empty_history");
  }
  // History comes back newest first; the viewer sorts too, but keeping the file
  // chronological makes it readable on its own.
  messages.sort((a, b) => Number(a.ts ?? 0) - Number(b.ts ?? 0));

  const roots = messages.filter(
    (m) => typeof m.ts === "string" && m.thread_ts === m.ts && (m.reply_count ?? 0) > 0,
  );

  if (roots.length > 0) {
    onLog?.(ctx.word({ key: "threadsToFetch", count: roots.length }));
    let done = 0;
    await inParallel(
      roots,
      THREAD_CONCURRENCY,
      async (root) => {
        const replies = await conversationsReplies(ctx, channel, root.ts!, onLog, signal);
        if (replies.length > 0) root.replies = replies;
        done += 1;
        if (done % 10 === 0 || done === roots.length) {
          onLog?.(ctx.word({ key: "threadsFetched", params: { done, total: roots.length } }));
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
