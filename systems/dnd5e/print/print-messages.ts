/**
 * The print's own labels (`dndPrint.*`, data/dnd5e-2024/messages/print): one small chunk per
 * locale, loaded with the print document, never with the sheet.
 */
type Messages = Record<string, unknown>;

const loaded = new Map<string, Promise<Messages>>();

/**
 * One load per locale for the session: React's `use` needs the same promise on every render. A
 * failed load is dropped so the next print retries (the pattern of play-messages.ts, kept local
 * so the print chunk shares no module with the sheet's play chunk).
 */
export function loadPrintMessages(locale: string): Promise<Messages> {
  const key = locale === "zh-TW" ? "zh-TW" : "en";
  let found = loaded.get(key);
  if (!found) {
    const pending = (
      key === "zh-TW"
        ? import("@skald/system-dnd5e/data/dnd5e-2024/messages/print/zh-TW.json")
        : import("@skald/system-dnd5e/data/dnd5e-2024/messages/print/en.json")
    ).then((module) => module.default as Messages);
    found = pending;
    loaded.set(key, pending);
    pending.catch(() => {
      if (loaded.get(key) === pending) loaded.delete(key);
    });
  }
  return found;
}
