/**
 * The images attached to messages — screenshots, mostly — and where to fetch
 * a copy of each.
 *
 * Only images are kept, at a medium size: Slack's own thumbnail of up to
 * 1024 px, large enough for the text of a screenshot to stay legible, a
 * fraction of the original's weight. Other attachments (PDF, documents…) stay
 * a card with a link to Slack.
 *
 * Pure: shared by the import wizard, the server route and the viewer.
 */

import type { SlackFile } from "./types";

export const IMAGE_FILE_TYPES = new Set(["png", "jpg", "jpeg", "gif", "webp", "heic", "bmp", "svg"]);

/** Largest first: the first one Slack made is the one fetched. */
const THUMBS = ["thumb_1024", "thumb_960", "thumb_800", "thumb_720", "thumb_480", "thumb_360"] as const;

/** An image small enough to have no thumbnail is fetched whole, under this size. */
const MAX_ORIGINAL_BYTES = 3 * 1024 * 1024;

/** A copy is never kept above this, whatever Slack serves. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function isImageFile(file: SlackFile): boolean {
  const kind = (file.filetype ?? "").toLowerCase();
  return IMAGE_FILE_TYPES.has(kind) || (file.mimetype ?? "").startsWith("image/");
}

/** Where to download a medium-size copy of this image, or null if there is none. */
export function screenshotUrl(file: SlackFile): string | null {
  if (!file.id || !isImageFile(file) || file.is_external) return null;
  if (file.mode === "tombstone" || file.mode === "hidden_by_limit") return null;
  for (const key of THUMBS) {
    const url = file[key];
    if (typeof url === "string" && isSlackFileUrl(url)) return url;
  }
  const original = file.url_private;
  if (original && isSlackFileUrl(original) && (file.size ?? 0) <= MAX_ORIGINAL_BYTES) return original;
  return null;
}

/**
 * Slack's file hosts only: `files.slack.com` (or a workspace's own
 * `*.slack.com`) under `/files-…`. The server and the extension refuse to
 * fetch anything else with the person's credentials.
 */
export function isSlackFileUrl(value: string): boolean {
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

export interface ScreenshotRef {
  /** The Slack file ID, `F…`: the key the copy is stored under. */
  id: string;
  url: string;
}

interface RawWithFiles {
  files?: SlackFile[];
  replies?: RawWithFiles[];
}

/** Every image of a conversation, thread replies included, once each. */
export function collectScreenshots(conversation: { messages?: unknown }): ScreenshotRef[] {
  const out = new Map<string, string>();
  const visit = (message: RawWithFiles) => {
    for (const file of message?.files ?? []) {
      const url = file ? screenshotUrl(file) : null;
      if (url && !out.has(file.id!)) out.set(file.id!, url);
    }
    for (const reply of message?.replies ?? []) visit(reply);
  };
  if (Array.isArray(conversation.messages)) {
    for (const message of conversation.messages as RawWithFiles[]) visit(message);
  }
  return [...out].map(([id, url]) => ({ id, url }));
}
