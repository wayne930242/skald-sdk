import type { PdfErrorCode, PdfRenderer, PdfRenderResult } from "@skald/sheet-sdk/modules/systems/ui/system-print";
import { serializePrint, type SerializeOptions } from "./serialize-print";

export type PdfDownload =
  | { ok: true; droppedImages: number }
  | { ok: false; code: PdfErrorCode; retryAfterSeconds?: number };

/** Saves `blob` under `name` through a temporary link; nothing is kept once the click is handled. */
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** A file name from the title, without the characters file systems refuse. */
export function pdfFileName(title: string): string {
  return `${title.replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, " ").trim() || "skald"}.pdf`;
}

/**
 * 下載 PDF: the print root on screen goes to the host's renderer and comes back as a PDF for this
 * player only. Call it after `whenPrintable(root)`.
 */
export async function downloadPrintPdf(root: HTMLElement, options: SerializeOptions, render: PdfRenderer): Promise<PdfDownload> {
  const { payload, droppedImages } = serializePrint(root, options);
  let result: PdfRenderResult;
  try {
    result = await render(payload);
  } catch (error) {
    console.error("PDF renderer failed", error);
    return { ok: false, code: "failed" };
  }
  if (!result.ok) return result;
  save(result.pdf, pdfFileName(payload.title));
  return { ok: true, droppedImages };
}
