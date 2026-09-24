import type {
  ConversationMeta,
  NormalizedMessage,
  SlackBlock,
  SlackConversation,
  SlackMessage,
  SlackRichTextElement,
  UserDirectory,
} from "./types";
import { normalizeShortcode } from "./emoji";
import { isBuiltinUser } from "./users";

/* -------------------------------------------------------------------------- */
/*  Validation                                                                 */
/* -------------------------------------------------------------------------- */

/** Why a file is not a conversation. The viewer words it in the active language. */
export type SlackParseErrorCode = "notObject" | "noMessages" | "badMessages";

export class SlackParseError extends Error {
  constructor(readonly code: SlackParseErrorCode) {
    super(code);
    this.name = "SlackParseError";
  }
}

export function parseConversation(input: unknown, fileName?: string): SlackConversation {
  if (!input || typeof input !== "object") {
    throw new SlackParseError("notObject");
  }

  // Accept both `{ channel_id, name, messages }` and a bare array of messages.
  if (Array.isArray(input)) {
    const messages = input as SlackMessage[];
    assertMessages(messages);
    return {
      channel_id: fileName?.replace(/\.json$/i, "") ?? "unknown",
      name: fileName?.replace(/\.json$/i, "") ?? "conversation",
      messages,
    };
  }

  const obj = input as Record<string, unknown>;
  const messages = obj.messages;
  if (!Array.isArray(messages)) {
    throw new SlackParseError("noMessages");
  }
  assertMessages(messages as SlackMessage[]);

  return {
    channel_id:
      typeof obj.channel_id === "string"
        ? obj.channel_id
        : (fileName?.replace(/\.json$/i, "") ?? "unknown"),
    name:
      typeof obj.name === "string"
        ? obj.name
        : (fileName?.replace(/\.json$/i, "") ?? "conversation"),
    messages: messages as SlackMessage[],
    ...(Array.isArray(obj.members) && obj.members.every((id) => typeof id === "string")
      ? { members: obj.members as string[] }
      : {}),
  };
}

function assertMessages(messages: SlackMessage[]) {
  if (messages.length === 0) return;
  const sample = messages[0];
  if (!sample || typeof sample !== "object" || typeof sample.ts !== "string") {
    throw new SlackParseError("badMessages");
  }
}

/* -------------------------------------------------------------------------- */
/*  Channel metadata                                                           */
/* -------------------------------------------------------------------------- */

/** `mpdm-alice--bob--carol-1` -> ["alice", "bob", "carol"] */
export function parseMpdmHandles(name: string): string[] {
  const m = /^mpdm-(.+?)(?:-\d+)?$/.exec(name);
  if (!m) return [];
  return m[1].split("--").filter(Boolean);
}

export function buildMeta(
  conversation: SlackConversation,
  directory: UserDirectory
): ConversationMeta {
  const { name, channel_id, messages } = conversation;
  const handles = parseMpdmHandles(name);
  const isMpdm = handles.length > 0;
  const isDm = !isMpdm && channel_id.startsWith("D");

  const all = flattenMessages(messages);
  const participants = Array.from(
    new Set(all.map((m) => m.user).filter((u): u is string => Boolean(u)))
  );

  const nameOf = (id: string) => directory[id]?.name ?? id;

  const displayName = isMpdm
    ? handles
        .map((h) => {
          const hit = Object.values(directory).find((u) => u.realName === h);
          return hit?.name ?? prettify(h);
        })
        .join(", ")
    : isDm
      ? // A direct message export usually has no name: fall back to whoever
        // actually spoke in it.
        (name
          ? prettify(name)
          : participants.filter((id) => id !== "USLACKBOT").map(nameOf).join(", ") ||
            channel_id)
      : name || channel_id;

  return {
    channelId: channel_id,
    rawName: name,
    displayName,
    kind: isMpdm ? "group-dm" : isDm ? "dm" : "channel",
    participants,
    messageCount: all.length,
    firstTs: all[0]?.ts,
    lastTs: all[all.length - 1]?.ts,
  };
}

function prettify(handle: string): string {
  return handle
    .replace(/[._]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/**
 * Suggests a name for user ids missing from the directory, using the handles
 * embedded in an `mpdm-…` channel name that no known user claims.
 */
export function suggestUnknownNames(
  conversation: SlackConversation,
  directory: UserDirectory
): { unknownIds: string[]; candidates: string[] } {
  const handles = parseMpdmHandles(conversation.name);
  const ids = Array.from(
    new Set(
      flattenMessages(conversation.messages)
        .map((m) => m.user)
        .filter((u): u is string => Boolean(u))
    )
  );
  const unknownIds = ids.filter((id) => !directory[id] && !isBuiltinUser(id));
  const claimed = new Set(
    ids
      .map((id) => directory[id]?.realName)
      .filter((h): h is string => Boolean(h))
  );
  const candidates = handles.filter((h) => !claimed.has(h)).map(prettify);
  return { unknownIds, candidates };
}

/* -------------------------------------------------------------------------- */
/*  Message normalisation                                                      */
/* -------------------------------------------------------------------------- */

const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function tsToDate(ts: string): Date {
  return new Date(Math.floor(Number(ts) * 1000));
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

/** Flattens rich-text blocks into plain text, used for search. */
export function blocksToPlainText(blocks: SlackBlock[] | null | undefined): string {
  if (!blocks) return "";
  const out: string[] = [];
  const walk = (el: SlackRichTextElement) => {
    if (el.text) out.push(el.text);
    if (el.type === "emoji" && el.name) out.push(`:${normalizeShortcode(el.name)}:`);
    if (el.type === "link" && el.url && !el.text) out.push(el.url);
    if (el.type === "user" && el.user_id) out.push(`@${el.user_id}`);
    el.elements?.forEach(walk);
  };
  for (const block of blocks) {
    block.elements?.forEach(walk);
    if (block.text?.text) out.push(block.text.text);
    block.fields?.forEach((f) => f.text && out.push(f.text));
  }
  return out.join(" ");
}

/**
 * Walks a message list and pulls out every message it can find, including the
 * replies nested under a thread root.
 *
 * Two export shapes are handled:
 *  - Slack's own: `replies: [...]` on the root, replies also present at the top
 *    level of the conversation;
 *  - slackdump's: `slackdump_thread_replies: [root, ...replies]`, replies absent
 *    from the top level.
 */
export function flattenMessages(messages: SlackMessage[]): SlackMessage[] {
  const byTs = new Map<string, SlackMessage>();

  const visit = (raw: SlackMessage) => {
    if (!raw || typeof raw.ts !== "string") return;
    const existing = byTs.get(raw.ts);
    // Prefer the richest copy: a root carries reply metadata its clone may miss.
    if (!existing || Object.keys(raw).length > Object.keys(existing).length) {
      byTs.set(raw.ts, raw);
    }
    raw.slackdump_thread_replies?.forEach(visit);
    raw.replies?.forEach(visit);
  };

  messages.forEach(visit);
  return Array.from(byTs.values()).sort((a, b) => Number(a.ts) - Number(b.ts));
}

interface NormalizeOne {
  raw: SlackMessage;
  index: number;
  previous?: NormalizedMessage;
  directory: UserDirectory;
  overrides: Record<string, string>;
}

function normalizeOne({
  raw,
  index,
  previous,
  directory,
  overrides,
}: NormalizeOne): NormalizedMessage {
  const date = tsToDate(raw.ts);
  const userId = raw.user ?? raw.bot_id ?? "unknown";
  const blocks = (raw.blocks ?? []) as SlackBlock[];
  const text = raw.text ?? "";
  const blockText = blocksToPlainText(blocks);
  const attachmentText = (raw.attachments ?? [])
    .map((a) => [a.title, a.text, a.fallback, a.original_url].filter(Boolean).join(" "))
    .join(" ");
  const fileText = (raw.files ?? [])
    .map((f) => [f.title, f.name, f.preview].filter(Boolean).join(" "))
    .join(" ");
  const displayName = overrides[userId] ?? directory[userId]?.name ?? userId;

  const grouped =
    Boolean(previous) &&
    previous!.userId === userId &&
    previous!.dayKey === dayKey(date) &&
    date.getTime() - previous!.date.getTime() < GROUP_WINDOW_MS;

  return {
    key: raw.client_msg_id ?? `${raw.ts}-${index}`,
    raw,
    userId,
    ts: raw.ts,
    date,
    dayKey: dayKey(date),
    text,
    searchText:
      `${displayName} ${text} ${blockText} ${attachmentText} ${fileText}`.toLowerCase(),
    edited: Boolean(raw.edited && raw.edited.ts),
    reactions: raw.reactions ?? [],
    attachments: raw.attachments ?? [],
    files: raw.files ?? [],
    blocks,
    subtype: raw.subtype,
    permalink: typeof raw.permalink === "string" ? raw.permalink : undefined,
    threadTs: raw.thread_ts,
    isThreadReply: Boolean(raw.thread_ts && raw.thread_ts !== raw.ts),
    replyCount: raw.reply_count ?? 0,
    replyUsers: raw.reply_users ?? [],
    latestReply: raw.latest_reply ? tsToDate(raw.latest_reply) : undefined,
    replies: [],
    orphanReply: false,
    grouped,
  };
}

/**
 * Produces the main conversation flow: thread roots and standalone messages,
 * with each root carrying its replies. Replies never appear in the flow —
 * exactly like Slack — unless their root is missing from the export.
 */
export function normalizeMessages(
  messages: SlackMessage[],
  directory: UserDirectory,
  overrides: Record<string, string> = {}
): NormalizedMessage[] {
  const all = flattenMessages(messages);
  const rootTimestamps = new Set(
    all.filter((m) => !m.thread_ts || m.thread_ts === m.ts).map((m) => m.ts)
  );

  const repliesByRoot = new Map<string, SlackMessage[]>();
  const flow: SlackMessage[] = [];

  for (const raw of all) {
    const isReply = Boolean(raw.thread_ts && raw.thread_ts !== raw.ts);
    if (isReply && rootTimestamps.has(raw.thread_ts!)) {
      const bucket = repliesByRoot.get(raw.thread_ts!) ?? [];
      bucket.push(raw);
      repliesByRoot.set(raw.thread_ts!, bucket);
    } else {
      flow.push(raw);
    }
  }

  const result: NormalizedMessage[] = [];

  flow.forEach((raw, index) => {
    const message = normalizeOne({
      raw,
      index,
      previous: result[result.length - 1],
      directory,
      overrides,
    });

    if (raw.thread_ts && raw.thread_ts !== raw.ts) {
      message.orphanReply = true;
    }

    const replies = repliesByRoot.get(raw.ts);
    if (replies && replies.length > 0) {
      const normalizedReplies: NormalizedMessage[] = [];
      replies
        .sort((a, b) => Number(a.ts) - Number(b.ts))
        .forEach((reply, i) => {
          normalizedReplies.push(
            normalizeOne({
              raw: reply,
              index: i,
              previous: normalizedReplies[normalizedReplies.length - 1],
              directory,
              overrides,
            })
          );
        });

      message.replies = normalizedReplies;
      // `reply_count` can be stale in an export; trust what we actually have.
      message.replyCount = normalizedReplies.length;
      if (message.replyUsers.length === 0) {
        message.replyUsers = Array.from(
          new Set(normalizedReplies.map((r) => r.userId))
        );
      }
      message.latestReply =
        normalizedReplies[normalizedReplies.length - 1]?.date ??
        message.latestReply;
      // Thread content is searchable from the root message.
      message.searchText += ` ${normalizedReplies
        .map((r) => r.searchText)
        .join(" ")}`;
    }

    result.push(message);
  });

  // Slack always starts a fresh block after a message that carries a thread,
  // so the reply bar is never orphaned above a headerless message.
  for (let i = 1; i < result.length; i++) {
    if (result[i - 1].replies.length > 0) result[i].grouped = false;
  }

  return result;
}

// Dates and numbers are formatted by `@/lib/i18n/format`, in the active language.
