import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import type { PrintPaper } from "@skald/sheet-sdk/modules/systems/ui/system-print";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { PRINT_BODY_HEIGHT_VAR, pageBody, printArea, pt } from "./geometry";

export interface PrintFlowProps extends HTMLAttributes<HTMLDivElement> {
  paper: PrintPaper;
  /** Start on a new sheet. */
  breakBefore?: boolean;
  /**
   * Who makes the pages. `css` (default): the content flows and the browser breaks it, each printed
   * fragment ending FOOTER_BAND_PT above the page bottom (`box-decoration-break: clone`). `caller`:
   * a pager that packs pages itself renders each as a `PrintPage`; the flow only frames them, with
   * no fragmentation of its own, and publishes `--pk-body-height` for its measuring probe.
   */
  pack?: "css" | "caller";
  /** On screen, draw a `css` flow as paper at the printable width (off where the content draws its own pages). */
  paperOnScreen?: boolean;
  children: ReactNode;
}

/** Pages that flow (full texts, spellbooks, the generic print's template pages). */
export function PrintFlow({
  paper,
  breakBefore = false,
  pack = "css",
  paperOnScreen = true,
  className,
  style,
  children,
  ...props
}: PrintFlowProps) {
  return (
    <div
      {...props}
      className={cn("pk-flow", className)}
      data-pack={pack}
      data-break-before={breakBefore ? "true" : undefined}
      data-paper-on-screen={pack === "css" && paperOnScreen ? "true" : undefined}
      style={{
        "--pk-area-width": pt(printArea(paper).width),
        [PRINT_BODY_HEIGHT_VAR]: pt(pageBody(paper).height),
        ...style,
      } as CSSProperties}
    >
      {children}
    </div>
  );
}
