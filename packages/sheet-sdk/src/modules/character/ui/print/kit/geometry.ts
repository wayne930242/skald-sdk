import type { PrintPaper } from "@skald/sheet-sdk/modules/systems/ui/system-print";

/**
 * The one paper table of every print (scratch/print-ref/kit-plan.md §2). The preview sets
 * `@page { size; margin: PRINT_MARGIN_MM }`; a page is the paper less that margin on each side,
 * less PAGE_SLACK_PT so rounding never pushes a page onto a blank sheet. Every page keeps the
 * bottom FOOTER_BAND_PT free for the skald.tw footer.
 */

export const PRINT_MARGIN_MM = 10;

/** The band at the bottom of every printed page that holds the skald.tw footer; = CoC's old page 1 footer. */
export const FOOTER_BAND_PT = 12;

/** Kept off the page height so rounding never pushes a page onto a blank sheet. */
export const PAGE_SLACK_PT = 2;

/** The body box height of a page (the page less the footer band), for CSS that sizes against it. */
export const PRINT_BODY_HEIGHT_VAR = "--pk-body-height";
export const PRINT_BODY_WIDTH_VAR = "--pk-body-width";

const PT_PER_MM = 72 / 25.4;

/** Millimetres in points. */
export const mm = (value: number): number => value * PT_PER_MM;

/** Points in CSS px (96 per inch): a pager compares `pageBody` with heights the DOM measured in px. */
export const ptToPx = (value: number): number => (value * 96) / 72;

/** A CSS length in points. */
export const pt = (value: number): string => `${value}pt`;

const PAPER_PT: Readonly<Record<PrintPaper, { width: number; height: number }>> = {
  A4: { width: mm(210), height: mm(297) },
  letter: { width: 612, height: 792 },
};

/** The printable area of a page in points: the paper less the margins and the slack. */
export function printArea(paper: PrintPaper): { width: number; height: number } {
  const margin = mm(PRINT_MARGIN_MM);
  const size = PAPER_PT[paper];
  return { width: size.width - 2 * margin, height: size.height - 2 * margin - PAGE_SLACK_PT };
}

/** What a page's content may fill, in points: the printable area less the footer band. */
export function pageBody(paper: PrintPaper): { width: number; height: number } {
  const area = printArea(paper);
  return { width: area.width, height: area.height - FOOTER_BAND_PT };
}
