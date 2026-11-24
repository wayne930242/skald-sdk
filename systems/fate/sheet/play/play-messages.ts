/**
 * The B play view's own labels (`fatePlay.*`). They load with the view, one small chunk per
 * locale, and stay out of the Fate core catalog that field-only hosts (wizard, editor) read.
 */
type Messages = Record<string, unknown>;

const loaded = new Map<string, Promise<Messages>>();

function importFor(locale: "en" | "zh-TW"): Promise<Messages> {
  return locale === "zh-TW"
    ? import("@skald/system-fate/data/fate-condensed/messages/v2-play/zh-TW.json").then((module) => module.default as Messages)
    : import("@skald/system-fate/data/fate-condensed/messages/v2-play/en.json").then((module) => module.default as Messages);
}

/**
 * One load per locale for the session (React's `use` needs the same promise on every render). A
 * rejected load leaves the cache, so a transient chunk failure is retried on the next mount.
 */
export function loadFatePlayMessages(locale: string): Promise<Messages> {
  const key = locale === "zh-TW" ? "zh-TW" : "en";
  let found = loaded.get(key);
  if (!found) {
    const pending = importFor(key);
    found = pending;
    loaded.set(key, pending);
    pending.catch(() => {
      if (loaded.get(key) === pending) loaded.delete(key);
    });
  }
  return found;
}
