/**
 * The `play.*` labels the sheet shows only after an action: the rest and death save toasts, the
 * long rest confirmation, the Concentration ended toast. They live in the lazy play-tabs catalog,
 * not in the play view's first load; the first action loads them (one small chunk per locale,
 * shared with the tabs), and `preloadLaterText` starts that load on the pointer going down.
 */
export type LaterText = (key: string, values?: Record<string, string | number>) => string;

export function loadLaterText(locale: string): Promise<LaterText> {
  return import("./edit-messages").then((module) => module.loadPlayTabsText(locale));
}

/** Starts the load ahead of a click; a failure here is retried by the click's own load. */
export function preloadLaterText(locale: string): void {
  loadLaterText(locale).catch(() => {});
}
