import type { SlackUser, UserDirectory } from "./types";

/* -------------------------------------------------------------------------- */
/*  Directory parsing                                                          */
/* -------------------------------------------------------------------------- */

const ID_RE = /^[UWB][A-Z0-9]{6,}$/;

function prettifyHandle(handle: string): string {
  return handle
    .replace(/[._]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) =>
      part
        .split("-")
        .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
        .join("-")
    )
    .join(" ")
    .trim();
}

function toUser(handle: string, id: string, email?: string): SlackUser {
  const clean = (email ?? "").trim();
  return {
    id,
    name: prettifyHandle(handle) || id,
    realName: handle,
    email: clean && clean.includes("@") ? clean : undefined,
  };
}

/** Slack `users.json` export shape. */
interface RawSlackUser {
  id?: string;
  name?: string;
  real_name?: string;
  deleted?: boolean;
  is_bot?: boolean;
  profile?: {
    real_name?: string;
    real_name_normalized?: string;
    display_name?: string;
    display_name_normalized?: string;
    email?: string;
    image_72?: string;
    image_48?: string;
    image_192?: string;
  };
}

function fromJson(value: unknown): UserDirectory | null {
  const list: RawSlackUser[] | null = Array.isArray(value)
    ? (value as RawSlackUser[])
    : value && typeof value === "object" && Array.isArray((value as { members?: unknown }).members)
      ? ((value as { members: RawSlackUser[] }).members)
      : null;
  if (!list) return null;

  const dir: UserDirectory = {};
  for (const u of list) {
    if (!u || typeof u !== "object" || !u.id) continue;
    const p = u.profile ?? {};
    const name =
      p.display_name ||
      p.real_name ||
      u.real_name ||
      u.name ||
      u.id;
    dir[u.id] = {
      id: u.id,
      name: name.includes(".") || name.includes("_") ? prettifyHandle(name) : name,
      realName: u.name ?? p.real_name,
      email: p.email,
      image: p.image_192 || p.image_72 || p.image_48,
      isBot: u.is_bot,
      deleted: u.deleted,
    };
  }
  return Object.keys(dir).length ? dir : null;
}

/**
 * Parses a user directory file.
 *
 * Supported shapes:
 *  - the column dump produced by Slack admin exports: `Name  ID  Email`
 *  - TSV / CSV with a header row containing name / id / email columns
 *  - Slack `users.json` (array, or `{ members: [...] }`)
 */
export function parseUserDirectory(content: string): UserDirectory {
  const trimmed = content.trim();
  if (!trimmed) return {};

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = fromJson(JSON.parse(trimmed));
      if (parsed) return parsed;
    } catch {
      /* fall through to the text parsers */
    }
  }

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const dir: UserDirectory = {};

  const splitRow = (line: string): string[] => {
    if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
    if (line.includes(";")) return line.split(";").map((c) => c.trim());
    if (line.includes(",") && !/\s{2,}/.test(line))
      return line.split(",").map((c) => c.trim());
    return line.trim().split(/\s{2,}|\s+/).map((c) => c.trim());
  };

  for (const line of lines) {
    const cells = splitRow(line).filter(Boolean);
    if (cells.length < 2) continue;

    const idIndex = cells.findIndex((c) => ID_RE.test(c));
    if (idIndex === -1) continue; // header row or noise

    const id = cells[idIndex];
    const email = cells.find((c) => c.includes("@"));
    const handle =
      cells.find((c, i) => i !== idIndex && !c.includes("@")) ??
      (email ? email.split("@")[0] : id);

    dir[id] = toUser(handle, id, email);
  }

  return dir;
}

/* -------------------------------------------------------------------------- */
/*  Resolution + avatars                                                       */
/* -------------------------------------------------------------------------- */

/** Slack's own member-avatar palette. */
const AVATAR_COLORS = [
  "#4a154b",
  "#1264a3",
  "#2bac76",
  "#e01e5a",
  "#ecb22e",
  "#7c3085",
  "#0b6e99",
  "#de7c1c",
  "#3d6c47",
  "#8d2b6b",
  "#1d9bd1",
  "#b7410e",
  "#4c9689",
  "#a0522d",
  "#5b4b8a",
  "#00706b",
];

export function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .split(/[\s.-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export interface ResolvedUser extends SlackUser {
  known: boolean;
  color: string;
  initials: string;
}

export function resolveUser(
  id: string,
  directory: UserDirectory,
  fallbacks: Record<string, string> = {}
): ResolvedUser {
  const hit = directory[id];
  const name = hit?.name ?? fallbacks[id] ?? id;
  return {
    id,
    name,
    email: hit?.email,
    realName: hit?.realName,
    image: hit?.image,
    isBot: hit?.isBot,
    known: Boolean(hit),
    color: avatarColor(id),
    initials: initials(name),
  };
}
