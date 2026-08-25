/** Cache corta en memoria + sessionStorage para no re-pegar al portal al cambiar de sección. */

const TTL_MS = 5 * 60 * 1000;
const memory = new Map<string, { at: number; data: unknown }>();

function storageKey(key: string) {
  return `nodo:account-cache:${key}`;
}

export function getAccountCache<T>(key: string): T | null {
  const now = Date.now();
  const mem = memory.get(key);
  if (mem && now - mem.at < TTL_MS) return mem.data as T;

  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: T };
    if (now - parsed.at >= TTL_MS) {
      sessionStorage.removeItem(storageKey(key));
      return null;
    }
    memory.set(key, { at: parsed.at, data: parsed.data });
    return parsed.data;
  } catch {
    return null;
  }
}

export function setAccountCache(key: string, data: unknown) {
  const entry = { at: Date.now(), data };
  memory.set(key, entry);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch {
    // quota / private mode — memoria alcanza
  }
}

export function clearAccountCache(prefix?: string) {
  if (!prefix) {
    memory.clear();
    if (typeof sessionStorage !== "undefined") {
      const keys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k?.startsWith("nodo:account-cache:")) keys.push(k);
      }
      keys.forEach((k) => sessionStorage.removeItem(k));
    }
    return;
  }
  for (const k of [...memory.keys()]) {
    if (k.startsWith(prefix)) memory.delete(k);
  }
  if (typeof sessionStorage !== "undefined") {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(storageKey(prefix)) || k === storageKey(prefix) || k?.startsWith(`nodo:account-cache:${prefix}`)) {
        keys.push(k);
      }
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  }
}

export async function loadAccountCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: { refresh?: boolean }
): Promise<{ data: T; fromCache: boolean }> {
  if (!opts?.refresh) {
    const hit = getAccountCache<T>(key);
    if (hit != null) return { data: hit, fromCache: true };
  }
  const data = await fetcher();
  setAccountCache(key, data);
  return { data, fromCache: false };
}
