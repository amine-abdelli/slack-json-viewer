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

/* -------------------------------------------------------------------------- */
/*  Validation                                                                 */
/* -------------------------------------------------------------------------- */

export class SlackParseError extends Error {}

export function parseConversation(input: unknown, fileName?: string): SlackConversation {
  if (!input || typeof input !== "object") {
    throw new SlackParseError("Le fichier ne contient pas un objet JSON.");
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
    throw new SlackParseError(
      "Clé `messages` absente ou invalide : ce JSON n'est pas un export de conversation Slack."
    );
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
  };
}

function assertMessages(messages: SlackMessage[]) {
  if (messages.length === 0) return;
  const sample = messages[0];
  if (!sample || typeof sample !== "object" || typeof sample.ts !== "string") {
    throw new SlackParseError(
      "Les messages n'ont pas le format attendu (clé `ts` manquante)."
    );
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

  const participants = Array.from(
    new Set(messages.map((m) => m.user).filter((u): u is string => Boolean(u)))
  );

  const displayName = isMpdm
    ? handles
        .map((h) => {
          const hit = Object.values(directory).find((u) => u.realName === h);
          return hit?.name ?? prettify(h);
        })
        .join(", ")
    : isDm
      ? prettify(name)
      : name;

  const sorted = [...messages].sort((a, b) => Number(a.ts) - Number(b.ts));

  return {
    channelId: channel_id,
    rawName: name,
    displayName,
    kind: isMpdm ? "group-dm" : isDm ? "dm" : "channel",
    participants,
    messageCount: messages.length,
    firstTs: sorted[0]?.ts,
    lastTs: sorted[sorted.length - 1]?.ts,
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
      conversation.messages.map((m) => m.user).filter((u): u is string => Boolean(u))
    )
  );
  const unknownIds = ids.filter((id) => !directory[id]);
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

export function normalizeMessages(
  messages: SlackMessage[],
  directory: UserDirectory,
  overrides: Record<string, string> = {}
): NormalizedMessage[] {
  const sorted = [...messages].sort((a, b) => Number(a.ts) - Number(b.ts));
  const result: NormalizedMessage[] = [];

  sorted.forEach((raw, index) => {
    const date = tsToDate(raw.ts);
    const userId = raw.user ?? raw.bot_id ?? "unknown";
    const blocks = (raw.blocks ?? []) as SlackBlock[];
    const text = raw.text ?? "";
    const blockText = blocksToPlainText(blocks);
    const attachmentText = (raw.attachments ?? [])
      .map((a) => [a.title, a.text, a.fallback, a.original_url].filter(Boolean).join(" "))
      .join(" ");
    const displayName =
      overrides[userId] ?? directory[userId]?.name ?? userId;

    const previous = result[result.length - 1];
    const grouped =
      Boolean(previous) &&
      previous.userId === userId &&
      previous.dayKey === dayKey(date) &&
      date.getTime() - previous.date.getTime() < GROUP_WINDOW_MS;

    result.push({
      key: raw.client_msg_id ?? `${raw.ts}-${index}`,
      raw,
      userId,
      ts: raw.ts,
      date,
      dayKey: dayKey(date),
      text,
      searchText: `${displayName} ${text} ${blockText} ${attachmentText}`.toLowerCase(),
      edited: Boolean(raw.edited && raw.edited.ts),
      reactions: raw.reactions ?? [],
      attachments: raw.attachments ?? [],
      files: raw.files ?? [],
      blocks,
      isThreadReply: Boolean(raw.thread_ts && raw.thread_ts !== raw.ts),
      replyCount: raw.reply_count ?? 0,
      grouped,
    });
  });

  return result;
}

/* -------------------------------------------------------------------------- */
/*  Formatting                                                                 */
/* -------------------------------------------------------------------------- */

export const LOCALE = "fr-FR";

const timeFmt = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const fullFmt = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: "full",
  timeStyle: "medium",
});

export function formatTime(date: Date): string {
  return timeFmt.format(date);
}

export function formatDay(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (dayKey(date) === dayKey(today)) return "Aujourd'hui";
  if (dayKey(date) === dayKey(yesterday)) return "Hier";
  const label = dayFmt.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatFull(date: Date): string {
  return fullFmt.format(date);
}
