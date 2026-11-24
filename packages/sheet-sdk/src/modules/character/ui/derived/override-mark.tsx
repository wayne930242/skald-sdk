"use client";

import { useTranslations } from "next-intl";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { useIsOverridden } from "./use-is-overridden";

/**
 * The play-mode marker of an overridden derived value (B-024 「被覆寫的數值要標示出來」): an amber
 * `*` beside the value, spoken as 已覆寫. Nothing when the value is not overridden. A system with
 * its own override state passes `overridden`, which wins over the template's overrides.
 */
export function OverrideMark({ fieldId, className, overridden }: { fieldId: string; className?: string; overridden?: boolean }) {
  const t = useTranslations("characters.derived");
  const stored = useIsOverridden(fieldId);
  if (!(overridden ?? stored)) return null;
  const label = t("overridden");
  return (
    <span
      className={cn("font-semibold text-amber-600 dark:text-amber-400", className)}
      data-derived-overridden={fieldId}
      title={label}
    >
      <span aria-hidden="true">*</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
