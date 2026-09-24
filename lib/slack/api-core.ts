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
/**
 * The largest page `conversations.history` and `conversations.replies` accept.
 * Slack suggests 200, but every page is one request against the rate limit:
 * 999 means five times fewer of them on a long conversation.
 */
const HISTORY_PAGE_SIZE = 999;

/** Guards against a runaway cursor loop. */
const MAX_LIST_PAGES = 30;
/** 500 pages of 200 is 100 000 messages — far past any real conversation. */
const MAX_HISTORY_PAGES = 500;

/** `users.info` is Tier 4, `conversations.replies` Tier 3: different budgets. */
const USER_CONCURRENCY = 8;
const THREAD_CONCURRENCY = 4;

const MAX_USERS = 3000;
/** Retries on a transient failure (5xx, network), not on a rate limit. */
const MAX_RETRIES = 3;
/**
 * Consecutive rate limits one request tolerates before giving up. Each one
 * waits as long as Slack asks, so this only trips when Slack never lets it
 * through.
 */
const MAX_RATE_LIMITS = 12;
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
  "conversations.members",
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
  | { key: "transientRetry"; params: { method: string } }
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
  | { key: "threadsFetched"; params: { done: number; total: number } }
  | { key: "threadsReused"; count: number };

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

/** The dump the viewer consumes: `{ channel_id, name, messages, members? }`. */
export interface Conversation {
  channel_id: string;
  name: string;
  messages: RawMessage[];
  /** Everyone in it, writers or not — absent when too many to be worth listing. */
  members?: string[];
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

interface MembersResponse extends ApiResponse {
  members?: string[];
  response_metadata?: { next_cursor?: string };
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
    if (signal?.aborted) return reject(new Error("aborted"));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    // Removed on the way out: a long import sleeps thousands of times.
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/* -------------------------------------------------------------------------- */
/*  Rate limits                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Shares Slack's rate-limit pauses between the calls of one session, per
 * method (Slack counts limits per method and workspace).
 *
 * Slack's limits are a number of calls per window: going as fast as allowed
 * and then waiting the `Retry-After` it gives is already the best throughput —
 * spacing calls out evenly was tried and only made imports slower. What went
 * wrong was the waiting: each worker met its own 429, slept on its own, and
 * the others kept firing into a limit already known to be hit. Here the first
 * 429 pauses the whole method, every call waits it out once, and the pause is
 * announced once.
 */
class RateGate {
  private pausedUntil = new Map<ReadMethod, number>();

  /** Resolves once `method` is not paused. */
  async acquire(method: ReadMethod, signal?: AbortSignal): Promise<void> {
    for (;;) {
      const wait = (this.pausedUntil.get(method) ?? 0) - Date.now();
      if (wait <= 0) return;
      await sleep(wait, signal);
    }
  }

  /**
   * Records a 429. Returns the pause in ms when this one started it, `null`
   * when a pause already under way covers it — so it is announced once.
   */
  limited(method: ReadMethod, waitMs: number): number | null {
    const until = Date.now() + waitMs;
    // Calls already in flight when the pause began run into it too.
    if (until <= (this.pausedUntil.get(method) ?? 0) + 1000) return null;
    this.pausedUntil.set(method, until);
    return waitMs;
  }
}

/** One gate per session: the context outlives a single call. */
const gates = new WeakMap<ApiContext, RateGate>();

function gateFor(ctx: ApiContext): RateGate {
  let gate = gates.get(ctx);
  if (!gate) {
    gate = new RateGate();
    gates.set(ctx, gate);
  }
  return gate;
}

interface CallOptions {
  signal?: AbortSignal;
  onLog?: LogFn;
  /** Error codes to return rather than throw on, for per-item failures. */
  tolerate?: readonly string[];
}

/** Statuses worth another try: Slack or the network hiccuped. */
function isTransient(status: number): boolean {
  return status === 0 || status === 408 || status >= 500;
}

async function call<T extends ApiResponse>(
  ctx: ApiContext,
  method: ReadMethod,
  params: Record<string, string>,
  { signal, onLog, tolerate = [] }: CallOptions = {},
): Promise<T> {
  const gate = gateFor(ctx);
  let limits = 0;
  let failures = 0;

  const rateLimited = async (waitMs: number) => {
    const wait = Math.min(Math.max(waitMs, 1000), MAX_RETRY_WAIT_MS);
    const announced = gate.limited(method, wait);
    if (announced !== null) {
      onLog?.(ctx.word({ key: "rateLimitedWait", params: { seconds: Math.ceil(announced / 1000) } }));
    }
  };

  for (;;) {
    if (signal?.aborted) throw new Error("aborted");
    await gate.acquire(method, signal);
    let res: TransportResponse;
    try {
      res = await ctx.transport(method, params, signal);
    } catch (err) {
      // `fetch` rejects with a TypeError when the network drops; anything else
      // (an extension that is not there, an abort) is not worth a retry.
      if (signal?.aborted || !(err instanceof TypeError) || failures >= MAX_RETRIES) throw err;
      res = { status: 0 };
    }

    // Slack throttles with 429 and says how long to wait.
    if (res.status === 429 && limits < MAX_RATE_LIMITS) {
      limits += 1;
      await rateLimited((res.retryAfter || 1) * 1000);
      continue;
    }
    if (isTransient(res.status) && failures < MAX_RETRIES) {
      failures += 1;
      onLog?.(ctx.word({ key: "transientRetry", params: { method } }));
      await sleep(2000 * failures, signal);
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
      // Some endpoints answer 200 with `ratelimited` rather than a 429.
      if (code === "ratelimited" && limits < MAX_RATE_LIMITS) {
        limits += 1;
        await rateLimited(3000 * limits);
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

/** Above this, a conversation's members are not listed: a crowd, not a cast. */
export const MAX_MEMBERS = 500;

/**
 * The members of a conversation, or null when it has more than `MAX_MEMBERS`
 * or Slack will not say (an extension older than 0.3.0 refuses the method).
 */
export async function conversationsMembers(
  ctx: ApiContext,
  channel: string,
  signal?: AbortSignal,
): Promise<string[] | null> {
  const out: string[] = [];
  let cursor = "";
  for (let page = 0; page < 5; page++) {
    const body = await call<MembersResponse>(
      ctx,
      "conversations.members",
      { channel, limit: String(MAX_MEMBERS + 1), ...(cursor ? { cursor } : {}) },
      { signal, tolerate: ["channel_not_found", "method_not_supported_for_channel_type"] },
    );
    if (!body.ok) return null;
    out.push(...(body.members ?? []));
    if (out.length > MAX_MEMBERS) return null;
    cursor = body.response_metadata?.next_cursor ?? "";
    if (!cursor) return out;
  }
  return null;
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

/* -------------------------------------------------------------------------- */
/*  Updating a conversation already imported                                   */
/* -------------------------------------------------------------------------- */

/** The fields of a thread root that say whether its thread changed. */
interface ThreadRoot {
  ts?: string;
  thread_ts?: string;
  reply_count?: number;
  latest_reply?: string;
  replies?: unknown[];
}

/** A new reply moves `latest_reply`; a deleted one lowers `reply_count`. */
function threadStamp(root: ThreadRoot): string {
  return `${root.reply_count ?? 0}:${root.latest_reply ?? ""}`;
}

/**
 * The threads a stored copy of a conversation already holds in full, as
 * `root ts → stamp`. Passed to `dumpConversation`, it spares a
 * `conversations.replies` call for every thread nobody has written in since.
 */
export function knownThreads(previous: { messages?: readonly ThreadRoot[] }): Record<string, string> {
  const known: Record<string, string> = {};
  for (const m of previous.messages ?? []) {
    if (!m.ts || m.thread_ts !== m.ts || !m.latest_reply) continue;
    if (!Array.isArray(m.replies) || m.replies.length === 0) continue;
    known[m.ts] = threadStamp(m);
  }
  return known;
}

/**
 * Puts back, from the stored copy, the replies of the threads a dump skipped
 * because they had not changed. Returns how many threads it filled.
 */
export function reuseReplies(
  fresh: { messages?: ThreadRoot[] },
  previous: { messages?: readonly ThreadRoot[] },
): number {
  const stored = new Map<string, ThreadRoot>();
  for (const m of previous.messages ?? []) if (m.ts) stored.set(m.ts, m);
  let filled = 0;
  for (const root of fresh.messages ?? []) {
    if (!root.ts || root.thread_ts !== root.ts || (root.reply_count ?? 0) === 0) continue;
    if (Array.isArray(root.replies) && root.replies.length > 0) continue;
    const old = stored.get(root.ts);
    if (old && Array.isArray(old.replies) && old.replies.length > 0 && threadStamp(old) === threadStamp(root)) {
      root.replies = old.replies;
      filled += 1;
    }
  }
  return filled;
}

export interface DumpOptions {
  /** From `knownThreads`: threads whose replies need not be fetched again. */
  known?: Record<string, string>;
}

/**
 * Dumps a whole conversation, threads included, in the shape the viewer reads.
 *
 * `conversations.history` returns roots only, newest first; each thread costs
 * one further call, which is why they are fetched a few at a time and progress
 * is reported as it goes.
 *
 * The history itself is always fetched whole — it is cheap with 999 messages a
 * page, and it is how edits, reactions and deletions come through. Threads are
 * the expensive part: with `known`, the unchanged ones are skipped, and the
 * caller puts their replies back with `reuseReplies`.
 */
export async function dumpConversation(
  ctx: ApiContext,
  channel: string,
  onLog?: LogFn,
  signal?: AbortSignal,
  { known }: DumpOptions = {},
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

  // Who is in it besides those who wrote: for the viewer's people list.
  const members =
    (info?.num_members ?? 0) > MAX_MEMBERS
      ? null
      : await conversationsMembers(ctx, channel, signal).catch(() => null);

  const messages = await conversationsHistory(ctx, channel, onLog, signal);
  if (messages.length === 0) {
    throw new SlackApiError(ctx.word({ key: "emptyHistory" }), "empty_history");
  }
  // History comes back newest first; the viewer sorts too, but keeping the file
  // chronological makes it readable on its own.
  messages.sort((a, b) => Number(a.ts ?? 0) - Number(b.ts ?? 0));

  const threaded = messages.filter(
    (m) => typeof m.ts === "string" && m.thread_ts === m.ts && (m.reply_count ?? 0) > 0,
  );
  const roots = known
    ? threaded.filter((m) => known[m.ts!] !== threadStamp(m as ThreadRoot))
    : threaded;
  if (roots.length < threaded.length) {
    onLog?.(ctx.word({ key: "threadsReused", count: threaded.length - roots.length }));
  }

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
    ...(members ? { members } : {}),
  };
}
