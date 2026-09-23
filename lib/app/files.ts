import type { I18n } from "@/lib/i18n/react";
import { parseConversation, SlackParseError } from "@/lib/slack/parse";
import { parseUserDirectory } from "@/lib/slack/users";
import type { SlackConversation, UserDirectory } from "@/lib/slack/types";

/**
 * A message to show, worded at render time — so it follows a language change
 * instead of staying in the language it was raised in.
 */
export type Worded = (i18n: I18n) => string;

export interface ReadFiles {
  conversations: { file: string; bytes: number; data: SlackConversation }[];
  directories: { file: string; directory: UserDirectory }[];
  errors: { file: string; message: Worded }[];
}

/**
 * Sorts opened or dropped files into conversations and user directories.
 * Nothing leaves the browser.
 */
export async function readFiles(files: File[]): Promise<ReadFiles> {
  const out: ReadFiles = { conversations: [], directories: [], errors: [] };

  for (const file of files) {
    const text = await file.text();
    const name = file.name;
    const looksJson =
      name.toLowerCase().endsWith(".json") ||
      text.trimStart().startsWith("{") ||
      text.trimStart().startsWith("[");

    if (looksJson) {
      try {
        const data = parseConversation(JSON.parse(text), name);
        out.conversations.push({ file: name, bytes: file.size, data });
        continue;
      } catch (err) {
        // maybe a users.json rather than a conversation
        const directory = parseUserDirectory(text);
        if (Object.keys(directory).length > 0) {
          out.directories.push({ file: name, directory });
          continue;
        }
        out.errors.push({
          file: name,
          message:
            err instanceof SlackParseError
              ? ({ m }) => m.load[err.code]
              : ({ m, t }) => t(m.load.notJson, { file: name }),
        });
        continue;
      }
    }

    const directory = parseUserDirectory(text);
    if (Object.keys(directory).length > 0) out.directories.push({ file: name, directory });
    else out.errors.push({ file: name, message: ({ m, t }) => t(m.load.noIds, { file: name }) });
  }

  return out;
}
