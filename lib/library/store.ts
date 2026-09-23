/**
 * The library: every imported conversation, kept on this device.
 *
 * Two IndexedDB object stores:
 *  - `archives`: one record per source (a Slack workspace, or "local files"),
 *    with a summary of each conversation — small, read on every screen;
 *  - `conversations`: the conversations themselves, read one at a time.
 *
 * When IndexedDB is unavailable (private window, blocked storage) the same API
 * keeps everything in memory for the session.
 */

import type { SlackConversation } from "@/lib/slack/types";

export type ArchiveSource = "slack" | "file";
export type ConversationKind = "channel" | "private" | "dm" | "group-dm";

export interface ConversationSummary {
  /** The Slack channel ID, or the file name for a bare export. */
  id: string;
  /** Raw name from the export (`general`, `mpdm-alice--bob-1`, a user ID…). */
  name: string;
  kind: ConversationKind;
  archived?: boolean;
  messageCount: number;
  threadCount: number;
  /** Slack user IDs of the people who wrote in it. */
  participants: string[];
  firstTs?: string;
  lastTs?: string;
  /** Size of the stored JSON. */
  bytes: number;
  importedAt: number;
  openedAt?: number;
}

export interface Archive {
  /** `slack:<workspace>` or `files`. */
  id: string;
  source: ArchiveSource;
  /** The workspace subdomain; empty for local files (the UI names it). */
  workspace: string;
  createdAt: number;
  updatedAt: number;
  openedAt?: number;
  conversations: ConversationSummary[];
}

export interface ImportedConversation {
  summary: Omit<ConversationSummary, "importedAt" | "openedAt" | "bytes">;
  data: SlackConversation;
}

const DB_NAME = "loquarium";
const DB_VERSION = 1;
const ARCHIVES = "archives";
const CONVERSATIONS = "conversations";

export const FILES_ARCHIVE_ID = "files";
export function slackArchiveId(workspace: string): string {
  return `slack:${workspace}`;
}

function conversationKey(archiveId: string, conversationId: string): string {
  return `${archiveId}/${conversationId}`;
}

/* -------------------------------------------------------------------------- */
/*  Backend: IndexedDB, or memory                                              */
/* -------------------------------------------------------------------------- */

interface Backend {
  getAll(store: string): Promise<unknown[]>;
  get(store: string, key: string): Promise<unknown>;
  put(store: string, key: string, value: unknown): Promise<void>;
  delete(store: string, key: string): Promise<void>;
  clear(store: string): Promise<void>;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ARCHIVES)) db.createObjectStore(ARCHIVES);
      if (!db.objectStoreNames.contains(CONVERSATIONS)) db.createObjectStore(CONVERSATIONS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
}

function indexedDbBackend(db: IDBDatabase): Backend {
  const store = (name: string, mode: IDBTransactionMode) =>
    db.transaction(name, mode).objectStore(name);
  return {
    getAll: (name) => request(store(name, "readonly").getAll()),
    get: (name, key) => request(store(name, "readonly").get(key)),
    put: async (name, key, value) => {
      await request(store(name, "readwrite").put(value, key));
    },
    delete: async (name, key) => {
      await request(store(name, "readwrite").delete(key));
    },
    clear: async (name) => {
      await request(store(name, "readwrite").clear());
    },
  };
}

function memoryBackend(): Backend {
  const stores = new Map<string, Map<string, unknown>>();
  const of = (name: string) => {
    let s = stores.get(name);
    if (!s) stores.set(name, (s = new Map()));
    return s;
  };
  return {
    getAll: async (name) => [...of(name).values()],
    get: async (name, key) => of(name).get(key),
    put: async (name, key, value) => void of(name).set(key, value),
    delete: async (name, key) => void of(name).delete(key),
    clear: async (name) => of(name).clear(),
  };
}

let backend: Promise<Backend> | null = null;
/** True when the library only lives in memory for this session. */
let volatile = false;

function getBackend(): Promise<Backend> {
  if (!backend) {
    backend = (async () => {
      try {
        if (typeof indexedDB === "undefined") throw new Error("no IndexedDB");
        return indexedDbBackend(await openIndexedDb());
      } catch {
        volatile = true;
        return memoryBackend();
      }
    })();
  }
  return backend;
}

export function isVolatile(): boolean {
  return volatile;
}

/* -------------------------------------------------------------------------- */
/*  API                                                                        */
/* -------------------------------------------------------------------------- */

export async function listArchives(): Promise<Archive[]> {
  const db = await getBackend();
  const all = (await db.getAll(ARCHIVES)) as Archive[];
  return all.sort((a, b) => (b.openedAt ?? b.updatedAt) - (a.openedAt ?? a.updatedAt));
}

export async function loadConversation(
  archiveId: string,
  conversationId: string,
): Promise<SlackConversation | null> {
  const db = await getBackend();
  const hit = (await db.get(CONVERSATIONS, conversationKey(archiveId, conversationId))) as
    | SlackConversation
    | undefined;
  return hit ?? null;
}

/**
 * Adds conversations to an archive, creating it when needed. A conversation
 * imported again replaces the previous copy.
 */
export async function saveConversations(
  target: { id: string; source: ArchiveSource; workspace: string },
  items: ImportedConversation[],
): Promise<Archive> {
  const db = await getBackend();
  const now = Date.now();
  const existing = (await db.get(ARCHIVES, target.id)) as Archive | undefined;
  const archive: Archive = existing ?? {
    ...target,
    createdAt: now,
    updatedAt: now,
    conversations: [],
  };

  for (const item of items) {
    await db.put(CONVERSATIONS, conversationKey(archive.id, item.summary.id), item.data);
    const bytes = new Blob([JSON.stringify(item.data)]).size;
    const summary: ConversationSummary = { ...item.summary, bytes, importedAt: now };
    const index = archive.conversations.findIndex((c) => c.id === summary.id);
    if (index >= 0) {
      summary.openedAt = archive.conversations[index].openedAt;
      archive.conversations[index] = summary;
    } else {
      archive.conversations.push(summary);
    }
  }
  archive.updatedAt = now;
  await db.put(ARCHIVES, archive.id, archive);
  return archive;
}

/** Records that a conversation was opened: it moves up in "recently opened". */
export async function touchConversation(archiveId: string, conversationId: string) {
  const db = await getBackend();
  const archive = (await db.get(ARCHIVES, archiveId)) as Archive | undefined;
  if (!archive) return;
  const now = Date.now();
  archive.openedAt = now;
  const conversation = archive.conversations.find((c) => c.id === conversationId);
  if (conversation) conversation.openedAt = now;
  await db.put(ARCHIVES, archive.id, archive);
}

export async function deleteConversation(archiveId: string, conversationId: string) {
  const db = await getBackend();
  const archive = (await db.get(ARCHIVES, archiveId)) as Archive | undefined;
  await db.delete(CONVERSATIONS, conversationKey(archiveId, conversationId));
  if (!archive) return;
  archive.conversations = archive.conversations.filter((c) => c.id !== conversationId);
  if (archive.conversations.length === 0) await db.delete(ARCHIVES, archiveId);
  else await db.put(ARCHIVES, archive.id, archive);
}

export async function deleteArchive(archiveId: string) {
  const db = await getBackend();
  const archive = (await db.get(ARCHIVES, archiveId)) as Archive | undefined;
  for (const c of archive?.conversations ?? []) {
    await db.delete(CONVERSATIONS, conversationKey(archiveId, c.id));
  }
  await db.delete(ARCHIVES, archiveId);
}

export async function clearLibrary() {
  const db = await getBackend();
  await db.clear(CONVERSATIONS);
  await db.clear(ARCHIVES);
}

export function archiveBytes(archive: Archive): number {
  return archive.conversations.reduce((sum, c) => sum + (c.bytes ?? 0), 0);
}
