/**
 * Lookup Table Resolver
 *
 * Resolves values from user-defined lookup tables.
 * Supports three table types:
 * - threshold: value lookup based on thresholds (e.g., damage bonus)
 * - formula: dynamic calculation using formula expressions
 * - range: value lookup based on min/max ranges (e.g., madness tables)
 */

import { parseFormula, evaluateFormula } from "./parser";

export interface ThresholdEntry {
  threshold: number;
  value: string | number;
}

export interface RangeEntry {
  min: number;
  max: number;
  value: string | number;
  label?: string;
}

export interface ThresholdTable {
  type: "threshold";
  description?: string;
  entries: ThresholdEntry[];
}

export interface FormulaTable {
  type: "formula";
  description?: string;
  formula: string;
}

export interface RangeTable {
  type: "range";
  description?: string;
  entries: RangeEntry[];
}

export type LookupTable = ThresholdTable | FormulaTable | RangeTable;

export interface LookupTablesDefinition {
  tables: Record<string, LookupTable>;
}

export type LookupResolver = (
  tableName: string,
  value: number
) => string | number | undefined;

/**
 * Creates a lookup resolver function from a tables definition
 */
export function createLookupResolver(
  definition: LookupTablesDefinition
): LookupResolver {
  return (tableName: string, value: number) => {
    const table = definition.tables[tableName];
    if (!table) return undefined;

    switch (table.type) {
      case "threshold":
        return resolveThreshold(table, value);
      case "formula":
        return resolveFormula(table, value);
      case "range":
        return resolveRange(table, value);
      default:
        return undefined;
    }
  };
}

function resolveThreshold(
  table: ThresholdTable,
  value: number
): string | number | undefined {
  // Entries should be sorted by threshold ascending
  const sorted = [...table.entries].sort((a, b) => a.threshold - b.threshold);

  // Find the highest threshold that value meets or exceeds
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (value >= sorted[i].threshold) {
      return sorted[i].value;
    }
  }

  // If value is below all thresholds, return the first entry's value
  return sorted[0]?.value;
}

function resolveFormula(
  table: FormulaTable,
  value: number
): string | number | undefined {
  const ast = parseFormula(table.formula);
  if (!ast) return undefined;

  const result = evaluateFormula(ast, { value });
  return typeof result === "boolean" ? (result ? 1 : 0) : result;
}

function resolveRange(
  table: RangeTable,
  value: number
): string | number | undefined {
  for (const entry of table.entries) {
    if (value >= entry.min && value <= entry.max) {
      return entry.value;
    }
  }
  return undefined;
}
