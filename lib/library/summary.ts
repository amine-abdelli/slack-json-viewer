import { buildMeta, flattenMessages, parseMpdmHandles } from "@/lib/slack/parse";
import type { ChannelSummary } from "@/lib/slack/bridge-types";
import type { SlackConversation } from "@/lib/slack/types";
import type { Archive, ConversationKind, ImportedConversation } from "./store";

/**
 * Describes a conversation for the library. When it came from Slack, the
 * channel list knows more (private, archived) than the export itself does.
 */
export function toImported(
  data: SlackConversation,
  channel?: ChannelSummary,
): ImportedConversation {
  const meta = buildMeta(data, {});
  const all = flattenMessages(data.messages);
  const threadCount = all.filter(
    (m) => (m.reply_count ?? 0) > 0 || (m.replies?.length ?? 0) > 0,
  ).length;

  let kind: ConversationKind =
    meta.kind === "dm" ? "dm" : meta.kind === "group-dm" ? "group-dm" : "channel";
  if (channel) {
    if (channel.isIM) kind = "dm";
    else if (channel.isMPIM) kind = "group-dm";
    else if (channel.isPrivate) kind = "private";
  }

  return {
    summary: {
      id: data.channel_id || channel?.id || data.name,
      name: data.name || channel?.name || data.channel_id,
      kind,
      archived: channel?.isArchived || undefined,
      messageCount: meta.messageCount,
      threadCount,
      participants: meta.participants,
      firstTs: meta.firstTs,
      lastTs: meta.lastTs,
    },
    data,
  };
}

/** `mpdm-alice--bob-1` → "Alice, Bob"; a DM → the other people in it. */
export function conversationTitle(
  summary: { name: string; id: string; kind: ConversationKind; participants: string[] },
  nameOf: (id: string) => string,
): string {
  if (summary.kind === "group-dm") {
    const handles = parseMpdmHandles(summary.name);
    if (handles.length > 0) return handles.map(prettify).join(", ");
  }
  if (summary.kind === "dm" || summary.kind === "group-dm") {
    if (summary.name && !/^[DUGW][A-Z0-9]{6,}$/.test(summary.name)) return prettify(summary.name);
    const people = summary.participants.filter((id) => id !== "USLACKBOT").map(nameOf);
    return people.join(", ") || summary.id;
  }
  return summary.name || summary.id;
}

function prettify(handle: string): string {
  return handle
    .replace(/[._]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/** The archive's name: its workspace, or "Local files" in the UI's language. */
export function archiveName(archive: Archive, localFiles: string): string {
  return archive.source === "slack" ? archive.workspace : localFiles;
}
