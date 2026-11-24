import type { ReactNode } from "react";

import { cn } from "@skald/sheet-sdk/lib/utils";

/**
 * One row of a rules book's contents. `href` renders an in-page link; without it the row is a button
 * that calls `onSelect`. `depth` 1 marks a section under the chapter above it.
 */
export interface RulesTocEntry {
  id: string;
  label: ReactNode;
  depth?: 0 | 1;
  href?: string;
  /** Data attributes for the row's control, e.g. `{ "data-toc": ref }`. */
  data?: Record<`data-${string}`, string>;
}

export interface RulesTocListProps {
  entries: readonly RulesTocEntry[];
  /** The row the reader is on: it gets `aria-current` and the selected look. */
  currentId?: string | null;
  onSelect?: (id: string) => void;
  /** Classes for the list: font size, direction, overflow. Rows inherit the font size (default `text-sm`). */
  className?: string;
}

/** The look every rules contents shares: muted rows, a tinted hover, and accent with its foreground when current. */
export const RULES_TOC_ITEM =
  "flex w-full items-baseline gap-1 rounded-md px-2 py-1.5 text-start text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current]:bg-accent aria-[current]:text-accent-foreground aria-[current]:hover:bg-accent";

/** Contents list for a rules reader (system books, quick reference). */
export function RulesTocList({ entries, currentId, onSelect, className }: RulesTocListProps) {
  return (
    <ol className={cn("flex flex-col gap-1 text-sm", className)}>
      {entries.map((entry) => {
        const current = entry.id === currentId ? "location" : undefined;
        const content = (
          <>
            {entry.depth === 1 && (
              <span aria-hidden className="shrink-0 opacity-60">
                ↳
              </span>
            )}
            <span className="min-w-0 break-words">{entry.label}</span>
          </>
        );
        return (
          <li key={entry.id} className="shrink-0">
            {entry.href ? (
              <a href={entry.href} aria-current={current} className={RULES_TOC_ITEM} {...entry.data}>
                {content}
              </a>
            ) : (
              <button type="button" aria-current={current} className={RULES_TOC_ITEM} onClick={() => onSelect?.(entry.id)} {...entry.data}>
                {content}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
