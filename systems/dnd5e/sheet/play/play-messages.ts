/**
 * The play view's own labels (`play.*`). They live beside the tier A catalog, not in it: that
 * catalog is near its 64 KB budget and every D&D sheet, wizard and session reads it, while these
 * load only with the play view (one small lazy chunk per locale).
 */
type Messages = Record<string, unknown>;

const loaded = new Map<string, Promise<Messages>>();

function importFor(locale: string): Promise<Messages> {
  return locale === "zh-TW"
    ? import("@skald/system-dnd5e/data/dnd5e-2024/messages/play/zh-TW.json").then((module) => module.default as Messages)
    : import("@skald/system-dnd5e/data/dnd5e-2024/messages/play/en.json").then((module) => module.default as Messages);
}

/**
 * `cache[key]`, loading it first when missing. A rejected load is dropped from the cache, so a
 * transient chunk failure is retried on the next mount instead of failing every later render
 * until a reload (rev12-F005).
 */
export function cachedUntilRejected<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  let found = cache.get(key);
  if (!found) {
    const pending = load();
    found = pending;
    cache.set(key, pending);
    pending.catch(() => {
      if (cache.get(key) === pending) cache.delete(key);
    });
  }
  return found;
}

/** One load per locale for the session: React's `use` needs the same promise on every render. */
export function loadPlayMessages(locale: string): Promise<Messages> {
  const key = locale === "zh-TW" ? "zh-TW" : "en";
  return cachedUntilRejected(loaded, key, () => importFor(key));
}
