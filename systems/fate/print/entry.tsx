import type { SystemPrint } from "@skald/sheet-sdk/modules/systems/ui/system-print";
import { FatePrintDocument } from "./fate-print-document";

export const fatePrint: SystemPrint = {
  Document: FatePrintDocument,
  controls: { paper: true, blanks: true },
  signalsReady: true,
};
