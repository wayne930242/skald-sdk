import type { PrintPaper } from "@skald/sheet-sdk/modules/systems/ui/system-print";

/**
 * The printable area of a page, in points. The preview sets `@page { size; margin: 10mm }`, so a
 * page is the paper less 10 mm on each side. Every page of the D&D print has exactly this size and
 * clips (its boxes keep a line spare, so nothing reaches the clip).
 */
const MM = 72 / 25.4;
const MARGIN = 10 * MM;

/** Kept off the page height so rounding never pushes a page onto a blank sheet. */
const PAGE_SLACK = 2;

export const PAPER_CONTENT: Readonly<Record<PrintPaper, { width: number; height: number }>> = {
  A4: { width: 210 * MM - 2 * MARGIN, height: 297 * MM - 2 * MARGIN - PAGE_SLACK },
  letter: { width: 612 - 2 * MARGIN, height: 792 - 2 * MARGIN - PAGE_SLACK },
};

export const pt = (value: number) => `${value}pt`;
