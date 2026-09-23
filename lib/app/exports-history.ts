/** What was exported from this device — the files themselves are in Downloads. */

export type ExportFormat = "html" | "json";

export interface ExportRecord {
  file: string;
  format: ExportFormat;
  /** The conversation's name, as shown when it was exported. */
  scope: string;
  /** The archive's name (workspace, or local files). */
  archive: string;
  at: number;
  bytes: number;
}

const KEY = "loquarium:exports";
const MAX = 200;

export function readExports(): ExportRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as ExportRecord[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function recordExport(record: ExportRecord): ExportRecord[] {
  const next = [record, ...readExports()].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: the history is a convenience */
  }
  return next;
}

export function clearExports() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
