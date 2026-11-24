/** Where the footer links: the site, by its domain name (not translated). */
export const SKALD_PRINT_URL = "https://skald.tw";

const SKALD_PRINT_LABEL = "skald.tw";

/**
 * The footer of every printed page (boss: 「只放 skald.tw」): one grey link at the bottom right,
 * no page number, no date. It prints only, `position: fixed` inside the page area, so Chromium
 * repeats it, and its link annotation, on every sheet. `PrintSheet` renders it once; nothing
 * between it and the document root may set `transform`, `filter`, `contain` or `container-type`,
 * or it would print once instead of on every page.
 */
export function PrintFooter() {
  return (
    <a className="pk-footer" href={SKALD_PRINT_URL} data-print-footer="">
      {SKALD_PRINT_LABEL}
    </a>
  );
}
