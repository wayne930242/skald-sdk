import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";
import type { PrintPaper } from "@skald/sheet-sdk/modules/systems/ui/system-print";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { PRINT_BODY_HEIGHT_VAR, PRINT_BODY_WIDTH_VAR, pageBody, printArea, pt } from "./geometry";

export interface PrintPageProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  paper: PrintPaper;
  /** `data-print-page`, for tests only; never printed. */
  page?: number;
  /** What the body does with content past its height: clip it (default) or let it show. */
  overflow?: "clip" | "visible";
  /** A notice at the bottom of the body, above the footer band (「此頁放不下…」); it takes from the body's height. */
  note?: ReactNode;
  /** The body box, for a fit measurement. */
  bodyRef?: Ref<HTMLDivElement>;
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * A fixed-size sheet: the printable area, its bottom FOOTER_BAND_PT kept free for the footer.
 * The body box is `pageBody(paper)` tall; it is published as `--pk-body-height` (CSS) and as
 * `data-pk-body-height` (points), and `pageBody(paper).height` gives a pager the same number.
 * The page breaks after itself; on screen it is drawn as paper with skald.tw in its band.
 */
export function PrintPage({
  paper,
  page,
  overflow = "clip",
  note,
  bodyRef,
  bodyClassName,
  className,
  style,
  children,
  ...props
}: PrintPageProps) {
  const area = printArea(paper);
  const body = pageBody(paper);
  return (
    <section
      {...props}
      className={cn("pk-page", className)}
      data-print-page={page}
      data-overflow={overflow}
      data-pk-body-height={body.height}
      style={{
        width: pt(area.width),
        height: pt(area.height),
        [PRINT_BODY_HEIGHT_VAR]: pt(body.height),
        [PRINT_BODY_WIDTH_VAR]: pt(body.width),
        ...style,
      } as CSSProperties}
    >
      <div ref={bodyRef} className={cn("pk-page-body", bodyClassName)}>
        {children}
      </div>
      {note && <div className="pk-page-note">{note}</div>}
    </section>
  );
}
