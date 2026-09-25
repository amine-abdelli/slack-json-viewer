/**
 * Who is in a conversation, beyond who wrote in it.
 *
 * The viewer's people list shows three groups: those who wrote (with their
 * message count — they can filter the conversation), the other members, and
 * the people who only reacted or were mentioned.
 *
 * Members come from the import (`conversations.members`, stored as `members`);
 * for a group DM imported before that, from the handles in its Slack name
 * (`mpdm-alice--bob-1`) matched against the directory.
 */

import { flattenMessages, parseMpdmHandles } from "./parse";
import type { SlackConversation, SlackMessage, UserDirectory } from "./types";

/** A member known only by the handle in a group DM's name: not in the directory. */
export interface HandleOnly {
  handle: string;
}

export interface ConversationPeople {
  /** Members who did not write, as Slack IDs or, failing a match, handles. */
  members: (string | HandleOnly)[];
  /** Did not write: they reacted, or were mentioned (members or not). */
  others: string[];
}

const MENTION = /<@([UW][A-Z0-9]{6,})(?:\|[^>]*)?>/g;
const IGNORED = new Set(["USLACKBOT"]);

function mentionsIn(message: SlackMessage, into: Set<string>) {
  for (const reaction of message.reactions ?? []) {
    for (const id of reaction.users ?? []) into.add(id);
  }
  for (const m of (message.text ?? "").matchAll(MENTION)) into.add(m[1]);
  // Rich text keeps mentions as `{ type: "user", user_id }` elements.
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    const el = node as { type?: string; user_id?: string; elements?: unknown };
    if (el.type === "user" && typeof el.user_id === "string") into.add(el.user_id);
    visit(el.elements);
  };
  visit(message.blocks);
}

export function conversationPeople(
  conversation: SlackConversation,
  authors: readonly string[],
  directory: UserDirectory,
): ConversationPeople {
  const wrote = new Set(authors);

  let members: (string | HandleOnly)[] = [];
  if (conversation.members?.length) {
    members = conversation.members.filter((id) => !wrote.has(id) && !IGNORED.has(id));
  } else {
    const handles = parseMpdmHandles(conversation.name);
    if (handles.length > 0) {
      const byHandle = new Map<string, string>();
      for (const [id, user] of Object.entries(directory)) {
        if (user.name) byHandle.set(user.name.toLowerCase(), id);
      }
      for (const handle of handles) {
        const id = byHandle.get(handle.toLowerCase());
        if (id ? !wrote.has(id) : true) members.push(id ?? { handle });
      }
    }
  }

  const seen = new Set<string>();
  for (const message of flattenMessages(conversation.messages)) mentionsIn(message, seen);
  const others = [...seen].filter((id) => !wrote.has(id) && !IGNORED.has(id));

  return { members, others };
}
