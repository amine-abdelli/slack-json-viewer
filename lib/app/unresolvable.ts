/**
 * Slack IDs that `users.info` could not resolve (`user_not_found`: bots,
 * people from another organisation over Slack Connect…), per workspace.
 *
 * Remembered so the next import does not ask again. Kept in this browser for
 * 30 days: long enough to spare the calls, short enough that an account which
 * becomes visible later is eventually picked up.
 */

const KEY = "loquarium:unresolvable";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

type Store = Record<string, Record<string, number>>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

/** The IDs of `workspace` known to be unresolvable, expired ones left out. */
export function unresolvableIds(workspace: string): Set<string> {
  const now = Date.now();
  const entries = read()[workspace] ?? {};
  return new Set(Object.keys(entries).filter((id) => now - entries[id] < TTL_MS));
}

export function rememberUnresolvable(workspace: string, ids: Iterable<string>) {
  const store = read();
  const now = Date.now();
  const entries = store[workspace] ?? {};
  for (const [id, at] of Object.entries(entries)) if (now - at >= TTL_MS) delete entries[id];
  for (const id of ids) entries[id] = now;
  store[workspace] = entries;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // storage full or unavailable: the IDs are simply asked for again next time
  }
}
