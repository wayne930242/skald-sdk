/**
 * The preset catalog and one locale's preset labels, for the shell's projection (ladder roster,
 * spread hint, sticky stress and conditions). Both are their own JSON chunks, fetched with the
 * view's labels when a Fate sheet opens; the vitals, rolls and milestone surfaces import the same
 * modules, so the bundler fetches each once.
 */
import { loadFatePresetCatalog, loadFatePresetLabels, type FatePresetCatalog, type FatePresetLabels } from "../../domain/presets";

export interface FatePlayRules {
  catalog: FatePresetCatalog;
  labels: FatePresetLabels;
}

const loaded = new Map<string, Promise<FatePlayRules>>();

/**
 * One load per locale for the session (React's `use` needs the same promise on every render). A
 * rejected load leaves the cache, so a transient chunk failure is retried on the next mount.
 */
export function loadFatePlayRules(locale: string): Promise<FatePlayRules> {
  const key = locale === "zh-TW" ? "zh-TW" : "en";
  let found = loaded.get(key);
  if (!found) {
    const pending = Promise.all([loadFatePresetCatalog(), loadFatePresetLabels(key)]).then(([catalog, labels]) => ({ catalog, labels }));
    found = pending;
    loaded.set(key, pending);
    pending.catch(() => {
      if (loaded.get(key) === pending) loaded.delete(key);
    });
  }
  return found;
}
