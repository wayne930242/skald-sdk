// modules/character/ui/renderer/renderers/display/heading-field.tsx
"use client";

import type { HeadingField } from "@skald/types/schema";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";

const SIZE_CLASSES: Record<number, string> = {
  1: "text-2xl font-bold tracking-display font-serif",
  2: "text-xl font-bold tracking-wider font-serif",
  3: "text-sm font-medium tracking-display text-muted-foreground uppercase",
  4: "text-sm font-bold",
  5: "text-xs font-bold",
  6: "text-xs font-medium",
};

const INLINE_CLASSES: Record<number, string> = {
  1: "text-lg font-bold tracking-wider font-serif",
  2: "text-base font-bold tracking-wider font-serif",
  3: "text-sm font-medium tracking-wide text-muted-foreground",
  4: "text-sm font-medium",
  5: "text-xs font-medium",
  6: "text-xs",
};

export function HeadingFieldRenderer({
  field,
}: FieldRendererProps<HeadingField>) {
  const { resolveI18n } = useSchemaI18n();
  const Tag = `h${field.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  const text = resolveI18n(field.text);

  // Inline variant for single-line headings
  if (field.variant === "inline") {
    return (
      <span className={cn(INLINE_CLASSES[field.level])}>{text}</span>
    );
  }

  // Body variant for paragraph text on reference pages
  if (field.variant === "body") {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-line">
        {text}
      </p>
    );
  }

  return <Tag className={cn(SIZE_CLASSES[field.level])}>{text}</Tag>;
}

// Self-register
registerFieldRenderer("heading", HeadingFieldRenderer);
