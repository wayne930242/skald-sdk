"use client";

import type { Layout, StackLayout, GridLayout } from "@skald/types/schema";
import { useSchemaStatic } from "./schema-context";
import { cn } from "@skald/sheet-sdk/lib/utils";
import {
  gapToClass,
  columnGapToClass,
  rowGapToClass,
  paddingToClass,
  marginToClass,
  justifyToClass,
  alignToClass,
  alignItemsToClass,
  justifyItemsToClass,
  sizeToCSS,
  columnsToCSS,
} from "./utils/layout-utils";

interface LayoutRendererProps {
  layout: Layout;
  children: React.ReactNode;
  className?: string;
}

type CSSVariableStyle = React.CSSProperties &
  Record<`--${string}`, string | number>;

function rowResponsiveGapClass(gap?: StackLayout["gap"]): string | undefined {
  if (!gap) return undefined;
  const map: Record<string, string> = {
    none: "gap-0",
    xs: "gap-1",
    sm: "gap-1 sm:gap-2",
    md: "gap-2 sm:gap-4",
    lg: "gap-2 sm:gap-6",
    xl: "gap-3 sm:gap-8",
  };
  return map[gap];
}

function gridResponsiveGapClass(gap?: GridLayout["gap"]): string | undefined {
  if (!gap) return undefined;
  const map: Record<string, string> = {
    none: "gap-0",
    xs: "gap-1",
    sm: "gap-1 sm:gap-2",
    md: "gap-2 sm:gap-4",
    lg: "gap-2 sm:gap-6",
    xl: "gap-3 sm:gap-8",
  };
  return map[gap];
}

export function LayoutRenderer({
  layout,
  children,
  className,
}: LayoutRendererProps) {
  switch (layout.type) {
    case "stack":
      return (
        <StackLayoutRenderer layout={layout} className={className}>
          {children}
        </StackLayoutRenderer>
      );
    case "grid":
      return (
        <GridLayoutRenderer layout={layout} className={className}>
          {children}
        </GridLayoutRenderer>
      );
    case "fixed":
      // TODO: 實作固定定位佈局
      return <div className={className}>{children}</div>;
    default:
      return <div className={className}>{children}</div>;
  }
}

function StackLayoutRenderer({
  layout,
  children,
  className,
}: {
  layout: StackLayout;
  children: React.ReactNode;
  className?: string;
}) {
  const { viewMode } = useSchemaStatic();

  // Web 模式：處理響應式佈局
  if (viewMode === "web" && layout.direction === "row") {
    // responsiveReverse: 反轉響應式行為
    // - 預設：flex-col sm:flex-row（手機垂直，桌面水平）
    // - 反轉：flex-row sm:flex-col（手機水平，桌面垂直）
    const flexClasses = layout.responsiveReverse
      ? "flex flex-row sm:flex-col"
      : "flex flex-col sm:flex-row";

    return (
      <div
        className={cn(
          flexClasses,
          layout.wrap && "flex-wrap",
          rowResponsiveGapClass(layout.gap),
          justifyToClass(layout.justify),
          alignToClass(layout.align),
          paddingToClass(layout.padding),
          marginToClass(layout.margin),
          className,
        )}
      >
        {children}
      </div>
    );
  }

  // Print 模式或 column 方向
  return (
    <div
      className={cn(
        "flex",
        layout.direction === "column" ? "flex-col" : "flex-row",
        layout.wrap && "flex-wrap",
        gapToClass(layout.gap, viewMode),
        justifyToClass(layout.justify),
        alignToClass(layout.align),
        paddingToClass(layout.padding),
        marginToClass(layout.margin),
        className,
      )}
      style={{
        // 只保留無法用 Tailwind 表達的動態值
        width: sizeToCSS(layout.width),
        height: sizeToCSS(layout.height),
        minWidth: sizeToCSS(layout.minWidth),
        maxWidth: sizeToCSS(layout.maxWidth),
      }}
    >
      {children}
    </div>
  );
}

function GridLayoutRenderer({
  layout,
  children,
  className,
}: {
  layout: GridLayout;
  children: React.ReactNode;
  className?: string;
}) {
  const { viewMode } = useSchemaStatic();

  // Web 模式：響應式處理
  if (viewMode === "web") {
    const colCount =
      typeof layout.columns === "number"
        ? layout.columns
        : Array.isArray(layout.columns)
          ? layout.columns.length
          : 1;
    // Columns below `sm`: one (stacked) unless the template declares `baseColumns`,
    // e.g. a row of narrow stat tiles that reads fine two or four across on a phone.
    const baseCols = Math.max(1, Math.min(layout.baseColumns ?? 1, colCount));

    // For array-based column templates (e.g. ["2fr","2fr","1fr"]),
    // preserve exact ratio definition on larger screens via CSS custom property.
    if (Array.isArray(layout.columns)) {
      const gridTemplateColumns = columnsToCSS(layout.columns);
      const templateBreakpointClass =
        colCount <= 2
          ? "sm:[grid-template-columns:var(--grid-cols)]"
          : colCount <= 3
            ? "md:[grid-template-columns:var(--grid-cols)]"
            : "lg:[grid-template-columns:var(--grid-cols)]";

      return (
        <div
          className={cn(
            // Mobile: stack vertically unless the layout declares `baseColumns`.
            // Restore explicit grid template on wider breakpoints.
            "grid [grid-template-columns:repeat(var(--grid-cols-base),minmax(0,1fr))]",
            templateBreakpointClass,
            gridResponsiveGapClass(layout.gap),
            layout.columnGap && columnGapToClass(layout.columnGap, viewMode),
            layout.rowGap && rowGapToClass(layout.rowGap, viewMode),
            alignItemsToClass(layout.align),
            justifyItemsToClass(layout.justifyItems),
            paddingToClass(layout.padding),
            marginToClass(layout.margin),
            className,
          )}
          style={
            {
              "--grid-cols": gridTemplateColumns,
              "--grid-cols-base": baseCols,
            } as CSSVariableStyle
          }
        >
          {children}
        </div>
      );
    }

    // For numeric columns, keep mobile readability while restoring exact template
    // column count on very wide screens (e.g. CoC characteristics with 8 columns).
    // Wider breakpoints never drop below the declared base, so a tile row is not
    // sparser at 640px than it is on a phone.
    const smCols = Math.max(Math.min(colCount, 2), baseCols);
    const mdCols = Math.max(Math.min(colCount, 4), baseCols);
    const lgCols = Math.max(colCount >= 8 ? 8 : Math.min(colCount, 6), baseCols);
    const xxlCols = colCount;

    return (
      <div
        className={cn(
          "grid [grid-template-columns:repeat(var(--grid-cols-base),minmax(0,1fr))] sm:[grid-template-columns:repeat(var(--grid-cols-sm),minmax(0,1fr))] md:[grid-template-columns:repeat(var(--grid-cols-md),minmax(0,1fr))] lg:[grid-template-columns:repeat(var(--grid-cols-lg),minmax(0,1fr))] 2xl:[grid-template-columns:repeat(var(--grid-cols-2xl),minmax(0,1fr))]",
          gridResponsiveGapClass(layout.gap),
          layout.columnGap && columnGapToClass(layout.columnGap, viewMode),
          layout.rowGap && rowGapToClass(layout.rowGap, viewMode),
          alignItemsToClass(layout.align),
          justifyItemsToClass(layout.justifyItems),
          paddingToClass(layout.padding),
          marginToClass(layout.margin),
          className,
        )}
        style={
          {
            "--grid-cols-base": baseCols,
            "--grid-cols-sm": smCols,
            "--grid-cols-md": mdCols,
            "--grid-cols-lg": lgCols,
            "--grid-cols-2xl": xxlCols,
          } as CSSVariableStyle
        }
      >
        {children}
      </div>
    );
  }

  // Print 模式：固定布局
  const gridTemplateRows =
    layout.flow === "column" && layout.maxRows
      ? `repeat(${layout.maxRows}, auto)`
      : layout.rows
        ? columnsToCSS(layout.rows)
        : undefined;

  const gridTemplateColumns =
    layout.flow === "column" && layout.maxRows
      ? undefined
      : columnsToCSS(layout.columns);

  return (
    <div
      className={cn(
        "grid",
        gapToClass(layout.gap, viewMode),
        layout.columnGap && columnGapToClass(layout.columnGap, viewMode),
        layout.rowGap && rowGapToClass(layout.rowGap, viewMode),
        alignItemsToClass(layout.align),
        justifyItemsToClass(layout.justifyItems),
        paddingToClass(layout.padding),
        marginToClass(layout.margin),
        className,
      )}
      style={{
        // 只保留無法用 Tailwind 表達的動態值
        gridTemplateColumns,
        gridTemplateRows,
        gridAutoFlow: layout.flow,
        gridAutoColumns: layout.flow === "column" ? "1fr" : undefined,
        width: sizeToCSS(layout.width),
        height: sizeToCSS(layout.height),
      }}
    >
      {children}
    </div>
  );
}
