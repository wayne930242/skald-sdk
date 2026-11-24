/**
 * Layout Utilities
 *
 * Pure utility functions for converting schema layout values to Tailwind CSS classes.
 * Extracted from layout-renderer.tsx for better testability and reusability.
 */

import type { Spacing, SizeUnit } from "@skald/types/schema";

// ============================================================================
// Spacing -> Tailwind Class 轉換函數
// ============================================================================

/**
 * Convert spacing to gap class
 * Web mode uses more generous spacing for better readability
 * Print mode uses tighter spacing to fit more content
 */
export function gapToClass(
  spacing?: Spacing,
  viewMode?: "web" | "print"
): string | undefined {
  if (!spacing) return undefined;

  // Web mode uses more generous spacing for better readability
  if (viewMode === "web") {
    const webMap: Record<string, string> = {
      none: "gap-0",
      xs: "gap-1",
      sm: "gap-2",
      md: "gap-4",
      lg: "gap-6",
      xl: "gap-8",
    };
    return webMap[spacing];
  }

  // Print mode uses tighter spacing to fit more content
  const map: Record<string, string> = {
    none: "gap-0",
    xs: "gap-0.5",
    sm: "gap-1",
    md: "gap-2",
    lg: "gap-4",
    xl: "gap-6",
  };
  return map[spacing];
}

/**
 * Convert spacing to column gap class
 */
export function columnGapToClass(
  spacing?: Spacing,
  viewMode?: "web" | "print"
): string | undefined {
  if (!spacing) return undefined;

  // Web mode uses more generous spacing
  if (viewMode === "web") {
    const webMap: Record<string, string> = {
      none: "gap-x-0",
      xs: "gap-x-1",
      sm: "gap-x-2",
      md: "gap-x-4",
      lg: "gap-x-6",
      xl: "gap-x-8",
    };
    return webMap[spacing];
  }

  const map: Record<string, string> = {
    none: "gap-x-0",
    xs: "gap-x-0.5",
    sm: "gap-x-1",
    md: "gap-x-2",
    lg: "gap-x-4",
    xl: "gap-x-6",
  };
  return map[spacing];
}

/**
 * Convert spacing to row gap class
 */
export function rowGapToClass(
  spacing?: Spacing,
  viewMode?: "web" | "print"
): string | undefined {
  if (!spacing) return undefined;

  // Web mode uses more generous spacing
  if (viewMode === "web") {
    const webMap: Record<string, string> = {
      none: "gap-y-0",
      xs: "gap-y-1",
      sm: "gap-y-2",
      md: "gap-y-4",
      lg: "gap-y-6",
      xl: "gap-y-8",
    };
    return webMap[spacing];
  }

  const map: Record<string, string> = {
    none: "gap-y-0",
    xs: "gap-y-0.5",
    sm: "gap-y-1",
    md: "gap-y-2",
    lg: "gap-y-4",
    xl: "gap-y-6",
  };
  return map[spacing];
}

/**
 * Convert spacing to padding class
 */
export function paddingToClass(spacing?: Spacing): string | undefined {
  if (!spacing) return undefined;
  const map: Record<string, string> = {
    none: "p-0",
    xs: "p-0.5",
    sm: "p-1",
    md: "p-2",
    lg: "p-4",
    xl: "p-6",
  };
  return map[spacing];
}

/**
 * Convert spacing to margin class
 */
export function marginToClass(spacing?: Spacing): string | undefined {
  if (!spacing) return undefined;
  const map: Record<string, string> = {
    none: "m-0",
    xs: "m-0.5",
    sm: "m-1",
    md: "m-2",
    lg: "m-4",
    xl: "m-6",
  };
  return map[spacing];
}

// ============================================================================
// Alignment -> Tailwind Class 轉換函數
// ============================================================================

/**
 * Convert justify to flexbox justify-content class
 */
export function justifyToClass(
  justify?: "start" | "center" | "end" | "between" | "around" | "evenly"
): string | undefined {
  if (!justify) return undefined;
  const map: Record<string, string> = {
    start: "justify-start",
    center: "justify-center",
    end: "justify-end",
    between: "justify-between",
    around: "justify-around",
    evenly: "justify-evenly",
  };
  return map[justify];
}

/**
 * Convert align to flexbox align-items class
 */
export function alignToClass(
  align?: "start" | "center" | "end" | "stretch" | "baseline"
): string | undefined {
  if (!align) return undefined;
  const map: Record<string, string> = {
    start: "items-start",
    center: "items-center",
    end: "items-end",
    stretch: "items-stretch",
    baseline: "items-baseline",
  };
  return map[align];
}

/**
 * Convert align to grid align-items class (same as alignToClass)
 */
export function alignItemsToClass(
  align?: "start" | "center" | "end" | "stretch" | "baseline"
): string | undefined {
  if (!align) return undefined;
  const map: Record<string, string> = {
    start: "items-start",
    center: "items-center",
    end: "items-end",
    stretch: "items-stretch",
    baseline: "items-baseline",
  };
  return map[align];
}

/**
 * Convert justify to grid justify-items class
 * Note: baseline is not supported for justify-items
 */
export function justifyItemsToClass(
  justify?: "start" | "center" | "end" | "stretch" | "baseline"
): string | undefined {
  if (!justify || justify === "baseline") return undefined;
  const map: Record<string, string> = {
    start: "justify-items-start",
    center: "justify-items-center",
    end: "justify-items-end",
    stretch: "justify-items-stretch",
  };
  return map[justify];
}

// ============================================================================
// Size -> CSS 轉換函數（保留給無法用 Tailwind 的動態值）
// ============================================================================

/**
 * Convert SizeUnit to CSS value
 * Used for dynamic values that cannot be expressed with Tailwind classes
 */
export function sizeToCSS(size?: SizeUnit): string | undefined {
  if (!size) return undefined;
  if (size === "auto") return "auto";
  if (size === "fill") return "100%";
  if (size.endsWith("px") || size.endsWith("fr") || size.endsWith("%")) {
    return size;
  }
  return size;
}

/**
 * Convert columns definition to CSS grid-template-columns value
 */
export function columnsToCSS(columns: SizeUnit[] | number | string): string {
  if (typeof columns === "number") {
    return `repeat(${columns}, 1fr)`;
  }
  if (typeof columns === "string") {
    return columns;
  }
  return columns.map((col) => sizeToCSS(col) || "1fr").join(" ");
}
