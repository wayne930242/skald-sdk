"use client";

import * as React from "react";
import { cn } from "@skald/sheet-sdk/lib/utils";

export interface ResponsiveDataTableColumn<Row> {
  id: string;
  header: React.ReactNode;
  renderCell: (row: Row, rowIndex: number) => React.ReactNode;
  cardLabel?: React.ReactNode;
  hideOnCard?: boolean;
  headerClassName?: string;
  cellClassName?: string;
}

export interface ResponsiveDataTableProps<Row> {
  rows: Row[];
  columns: ResponsiveDataTableColumn<Row>[];
  getRowKey: (row: Row, rowIndex: number) => React.Key;
  mode: "table" | "cards";
  tableGridTemplateColumns?: string;
  tableClassName?: string;
  headerClassName?: string;
  rowClassName?: string;
  renderEmptyRow?: (emptyIndex: number) => React.ReactNode;
  emptyRowCount?: number;
  cardListClassName?: string;
  cardClassName?: string;
  renderCard?: (row: Row, rowIndex: number) => React.ReactNode;
  renderRowOverlay?: (row: Row, rowIndex: number) => React.ReactNode;
}

export function ResponsiveDataTable<Row>({
  rows,
  columns,
  getRowKey,
  mode,
  tableGridTemplateColumns,
  tableClassName,
  headerClassName,
  rowClassName,
  renderEmptyRow,
  emptyRowCount = 0,
  cardListClassName,
  cardClassName,
  renderCard,
  renderRowOverlay,
}: ResponsiveDataTableProps<Row>) {
  if (mode === "cards") {
    return (
      <div className={cn("space-y-2", cardListClassName)}>
        {rows.map((row, rowIndex) => {
          const key = getRowKey(row, rowIndex);
          if (renderCard) {
            return (
              <React.Fragment key={key}>{renderCard(row, rowIndex)}</React.Fragment>
            );
          }

          return (
            <div key={key} className={cn("border border-border p-3 space-y-2", cardClassName)}>
              {columns
                .filter((column) => !column.hideOnCard)
                .map((column) => (
                  <div key={column.id} className="grid grid-cols-[6rem_1fr] gap-2 items-center">
                    <div className="text-xs text-muted-foreground">
                      {column.cardLabel ?? column.header}
                    </div>
                    <div>{column.renderCell(row, rowIndex)}</div>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={tableClassName}>
      <div
        className={headerClassName}
        style={
          tableGridTemplateColumns
            ? { gridTemplateColumns: tableGridTemplateColumns }
            : undefined
        }
      >
        {columns.map((column) => (
          <div key={column.id} className={column.headerClassName}>
            {column.header}
          </div>
        ))}
      </div>

      {rows.map((row, rowIndex) => (
        <div
          key={getRowKey(row, rowIndex)}
          className={rowClassName}
          style={
            tableGridTemplateColumns
              ? { gridTemplateColumns: tableGridTemplateColumns }
              : undefined
          }
        >
          {columns.map((column) => (
            <div key={column.id} className={column.cellClassName}>
              {column.renderCell(row, rowIndex)}
            </div>
          ))}
          {renderRowOverlay?.(row, rowIndex)}
        </div>
      ))}

      {Array.from({ length: emptyRowCount }).map((_, emptyIndex) =>
        renderEmptyRow ? renderEmptyRow(emptyIndex) : null,
      )}
    </div>
  );
}
