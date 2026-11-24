import type { SystemPrint } from "@skald/sheet-sdk/modules/systems/ui/system-print";
import { DndPrintDocument } from "./dnd-print-document";

/**
 * D&D 2024 prints the official 2024 sheet's two pages, then what their boxes leave out on 續頁 and
 * a spellbook (LAYOUT.md): the preview's paper (A4 or Letter) and 「保留手寫空白」 both apply. The
 * rules text loads and the pages are laid out after the document mounts, so it tells the preview
 * when it can print.
 */
export const dnd5ePrint: SystemPrint = {
  Document: DndPrintDocument,
  controls: { paper: true, blanks: true },
  signalsReady: true,
};
