"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { StatListColumn, StatListField } from "@skald/types/schema";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { type RowSelector, type StatRow } from "../../../row-selectors";
import { groupStatRows, splitIntoPrintColumns, type PrintItem } from "../../../utils/stat-list-view";

const DEFAULT_PRINT_COLUMNS = ["improve", "name", "base", "value", "half", "fifth"] as const;

export function PrintView({
  field,
  rows,
  groups,
  groupBy,
}: {
  field: StatListField;
  rows: StatRow[];
  groups: ReturnType<RowSelector["rows"]>["groups"];
  groupBy: "category" | "none";
}) {
  const wanted: readonly (StatListColumn | "name")[] =
    field.print?.columns ?? DEFAULT_PRINT_COLUMNS;
  const numeric = wanted.filter((column): column is StatListColumn => column !== "name");
  const showImprove = numeric.includes("improve");
  const flow = field.print?.flow?.columns ?? 4;
  const blank = field.print?.blankRowsPerColumn ?? 0;

  const printColumns = React.useMemo(
    () => splitIntoPrintColumns(groupStatRows(rows, groups, groupBy), flow, blank),
    [rows, groups, groupBy, flow, blank],
  );

  const style = {
    "--stat-print-cols": String(Math.max(1, Math.floor(flow))),
    "--stat-print-grid": [
      ...(showImprove ? ["0.8rem"] : []),
      "minmax(0, 1fr)",
      ...numeric.filter((c) => c !== "improve").map(() => "1.4rem"),
    ].join(" "),
  } as React.CSSProperties;

  return (
    <div className="skald-stat-print" data-stat-list={field.id} data-view-mode="print" style={style}>
      {printColumns.map((items, index) => (
        <div key={index} className="skald-stat-print-column">
          {items.map((item) => (
            <PrintLine key={printKey(item)} item={item} numeric={numeric} />
          ))}
        </div>
      ))}
    </div>
  );
}

function printKey(item: PrintItem): string {
  if (item.kind === "header") return `header-${item.group.id}`;
  if (item.kind === "row") return `row-${item.row.id}`;
  return item.key;
}

function PrintLine({ item, numeric }: { item: PrintItem; numeric: StatListColumn[] }) {
  const t = useTranslations("renderer");
  if (item.kind === "header") {
    return <div className="skald-stat-print-header">{item.group.label}</div>;
  }
  const row = item.kind === "row" ? item.row : undefined;
  return (
    <div className={cn("skald-stat-print-line", !row && "skald-stat-print-blank")}>
      {numeric.includes("improve") &&
        (row?.improvable === false ? (
          // 不能成長的列（信用評級、克蘇魯神話）不畫框，但留出欄位讓名稱對齊
          <span aria-hidden="true" />
        ) : (
          <span className="skald-stat-print-box" data-checked={row?.improved ? "true" : undefined}>
            {row?.improved ? "✓" : ""}
          </span>
        ))}
      <span className="skald-stat-print-name">
        {row ? (row.parentLabel !== undefined ? t("statListSpecLabel", { parent: row.parentLabel, spec: row.specName ?? "" }) : row.label) : ""}
      </span>
      {numeric
        .filter((column) => column !== "improve")
        .map((column) => (
          <span key={column} className="skald-stat-print-cell" data-column={column}>
            {row ? (row[column] ?? "") : ""}
          </span>
        ))}
    </div>
  );
}
