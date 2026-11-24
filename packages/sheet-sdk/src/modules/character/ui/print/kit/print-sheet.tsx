import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import type { PrintPaper } from "@skald/sheet-sdk/modules/systems/ui/system-print";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { PrintFooter } from "./print-footer";
import "./print-kit.css";

/** The kit's design tokens (print-kit.css); a System overrides any of them through `tokens`. */
export type PrintToken =
  | "--pk-ink"
  | "--pk-ink-2"
  | "--pk-ink-3"
  | "--pk-rule"
  | "--pk-line"
  | "--pk-band"
  | "--pk-text-min"
  | "--pk-label"
  | "--pk-body"
  | "--pk-value"
  | "--pk-title"
  | "--pk-hair"
  | "--pk-rule-w"
  | "--pk-strong";

export interface PrintSheetProps extends HTMLAttributes<HTMLDivElement> {
  paper: PrintPaper;
  /** 「保留手寫空白」 is on: `data-blanks` for the document's CSS. */
  blanks?: boolean;
  /** System values over the kit's tokens, e.g. `{ "--pk-ink": "#161616" }`. */
  tokens?: Partial<Record<PrintToken, string>>;
  children: ReactNode;
}

/**
 * The root every print document renders once (kit-plan.md §2): it carries the kit's tokens and
 * CSS and the one skald.tw footer that prints on every page. The kit loads with the print chunk
 * only, never with a sheet.
 */
export function PrintSheet({ paper, blanks = false, tokens, className, style, children, ...props }: PrintSheetProps) {
  return (
    <div
      {...props}
      className={cn("pk-sheet", className)}
      data-print-kit=""
      data-paper={paper}
      data-blanks={blanks ? "true" : undefined}
      style={{ ...(tokens as CSSProperties | undefined), ...style }}
    >
      <PrintFooter />
      {children}
    </div>
  );
}
