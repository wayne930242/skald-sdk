// modules/character/ui/renderer/renderers/display/divider-field.tsx
"use client";

import type { DividerField } from "@skald/types/schema";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";

const THICKNESS_MAP: Record<string, string> = {
  thin: "h-px",
  medium: "h-0.5",
  thick: "h-0.75",
};

const STYLE_MAP: Record<string, string> = {
  solid: "bg-foreground print:bg-black",
  dashed: "border-t border-dashed border-foreground print:border-black bg-transparent",
  dotted: "border-t border-dotted border-foreground print:border-black bg-transparent",
};

export function DividerFieldRenderer({
  field,
}: FieldRendererProps<DividerField>) {
  if (field.style === "decorative") {
    return (
      <div className="flex items-center gap-1 my-2">
        <div
          className={cn(THICKNESS_MAP.thin, "flex-1", STYLE_MAP.solid)}
        />
        <div
          className={cn(THICKNESS_MAP.thin, "flex-1", STYLE_MAP.solid)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full my-2",
        THICKNESS_MAP[field.thickness || "thin"],
        STYLE_MAP[field.style || "solid"],
      )}
    />
  );
}

// Self-register
registerFieldRenderer("divider", DividerFieldRenderer);
