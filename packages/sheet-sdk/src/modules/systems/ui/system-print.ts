import type { ComponentType } from "react";
import type { Schema, Template } from "@skald/types/schema";
import type { CharacterFormulaRuntime, EditorHandlers, OptionSource } from "@skald/sheet-sdk/modules/sheet-schema";

/** The sheet of paper the browser prints on; the template's pages keep their own on-screen size. */
export type PrintPaper = "A4" | "letter";

/** The serialized print pages a PDF is made from (the private service checks them in lib/print/payload-limits.ts). */
export interface PrintPdfRequest {
  html: string;
  stylesheets: string[];
  paper: PrintPaper;
  locale: string;
  title: string;
  buildId: string;
  htmlClass: string;
  bodyClass: string;
}

/** Why a PDF was not made; the preview shows `sheetPrint.pdfError.<code>`. */
export type PdfErrorCode =
  | "disabled"
  | "signInRequired"
  | "tooLarge"
  | "staleBuild"
  | "inFlight"
  | "rateLimited"
  | "busy"
  | "tooManyPages"
  /** The pages changed (a reset layout, another paper) while the click waited: nothing was sent. */
  | "layoutChanged"
  | "failed";

/** What the host's PDF service made of the serialized pages. */
export type PdfRenderResult =
  | { ok: true; pdf: Blob }
  | { ok: false; code: PdfErrorCode; retryAfterSeconds?: number };

/** The `pdfRenderer` host port: renders the pages to a PDF; resolves with the failure's code instead of throwing. */
export type PdfRenderer = (request: PrintPdfRequest) => Promise<PdfRenderResult>;

/**
 * What a System's print document renders from: the character data and texts already on screen.
 * It reads no character from the database and writes nothing; the sheet's contexts (System, plugin
 * UI, messages, rolls) are the ones around the sheet.
 */
export interface PrintDocumentProps {
  data: Record<string, unknown>;
  schema: Schema;
  template: Template;
  formulaRuntime?: CharacterFormulaRuntime;
  locale: string;
  paper: PrintPaper;
  /** 「保留手寫空白」: keep the empty fields to write in by hand. */
  blanks: boolean;
  /** How the sheet shows its fields (a read-only share prints its read-only look); edits go nowhere. */
  editable: boolean;
  setupMode: boolean;
  handlers?: EditorHandlers;
  optionSources?: OptionSource;
  /**
   * For a document whose `SystemPrint` sets `signalsReady`: report whether the pages are complete
   * enough to print (true) or still loading (false). It may go back to false when a change on the
   * page (paper, blanks) loads again. The preview passes it to every document; others ignore it.
   * `status`, while not ready, is the document's own words for what it waits on (「正在載入規則全文…」);
   * the preview tells assistive tech why 列印 is off, in its own words when there are none.
   */
  onReadyChange?: (ready: boolean, status?: string) => void;
}

/**
 * A System's print capability, registered in `plugins/registry.print.ui.ts`. Its document renders
 * through the print kit's root, `PrintSheet` (`modules/character/ui/print/kit/print-sheet`), which
 * prints the one skald.tw footer on every page; tests/unit/sheets/print-kit-guard.test.ts checks it.
 */
export interface SystemPrint {
  readonly Document: ComponentType<PrintDocumentProps>;
  /**
   * The preview's controls this document reads (both by default). Without `paper` the preview sets
   * no `@page` size and the browser's paper applies; without `blanks` the switch is not shown.
   */
  readonly controls?: { readonly paper: boolean; readonly blanks: boolean };
  /**
   * The document loads part of its content after it mounts (a rules text, say) and reports when
   * it can print through `onReadyChange`. Until it reports true, the preview keeps 列印 disabled
   * and Ctrl+P does nothing. Without it, a document can print once it is mounted and the fonts
   * are in.
   */
  readonly signalsReady?: boolean;
}
