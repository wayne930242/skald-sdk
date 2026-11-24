"use client";

import { Info } from "lucide-react";
import { useId, type ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@skald/sheet-sdk/components/ui/popover";
import { cn } from "@skald/sheet-sdk/lib/utils";

interface InfoTipProps {
  /** Accessible name of the trigger, e.g. “More about the session buttons”. */
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * A small info icon that opens its note on tap, click, or keyboard. Unlike a hover-only `title`,
 * it reaches touch screens and screen readers.
 */
export function InfoTip({ label, children, className }: InfoTipProps) {
  const bodyId = useId();
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={label}
        className={cn(
          "inline-flex size-6 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
          className,
        )}
        data-info-tip
      >
        <Info className="size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        className="w-auto max-w-72 p-3 text-xs"
        aria-label={label}
        aria-describedby={bodyId}
        data-info-tip-content
      >
        <div id={bodyId}>{children}</div>
      </PopoverContent>
    </Popover>
  );
}
