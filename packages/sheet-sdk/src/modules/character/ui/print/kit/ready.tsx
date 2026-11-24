"use client";

import { useCallback, useLayoutEffect, useState, type ReactNode } from "react";
import type { PrintDocumentProps } from "@skald/sheet-sdk/modules/systems/ui/system-print";

export interface PrintWait {
  ready: boolean;
  /** The document's own words for what it waits on (「正在載入規則全文…」). */
  status?: string;
}

/**
 * Reports to the preview (`SystemPrint.signalsReady`) whether every wait is met, before paint;
 * while one is not, the first unmet wait's status says why. Returns the readiness.
 */
export function usePrintReady(
  onReadyChange: PrintDocumentProps["onReadyChange"],
  waits: readonly PrintWait[],
): boolean {
  const pending = waits.find((wait) => !wait.ready);
  const ready = pending === undefined;
  const status = pending?.status;
  useLayoutEffect(() => onReadyChange?.(ready, ready ? undefined : status), [onReadyChange, ready, status]);
  return ready;
}

export type PrintImageStatus = "pending" | "loaded" | "failed";

/**
 * An image the print shows as is (the sheet's portrait), with whether it has loaded: a print waits
 * for it before it reports ready. Without `src` there is nothing to wait for. `alt` comes from the
 * System's catalog.
 */
export function usePrintImage(
  src: string | undefined,
  alt: string,
  className?: string,
): { node: ReactNode; status: PrintImageStatus } {
  const [state, setState] = useState<{ src?: string; status: PrintImageStatus }>({ status: "pending" });
  const status: PrintImageStatus = !src ? "loaded" : state.src === src ? state.status : "pending";
  const report = useCallback((next: PrintImageStatus) => setState({ src, status: next }), [src]);
  // a cached image may be complete before React attaches its handlers
  const ref = useCallback(
    (image: HTMLImageElement | null) => {
      if (image?.complete) report(image.naturalWidth ? "loaded" : "failed");
    },
    [report],
  );
  const node = src ? (
    // The original image at a fixed print size, not an optimizer request.
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={src} alt={alt} className={className} onLoad={() => report("loaded")} onError={() => report("failed")} />
  ) : null;
  return { node, status };
}
