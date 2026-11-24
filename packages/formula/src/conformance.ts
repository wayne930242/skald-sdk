import type {
  FormulaErrorCategory,
  FormulaReferenceCatalog,
  FormulaSourceDefinition,
  FormulaValue,
} from "./types";

export interface FormulaConformanceExpectedValue {
  status: "value";
  derivedValues: Record<string, FormulaValue>;
  issueCategories: [];
}

export interface FormulaConformanceExpectedError {
  status: "error";
  derivedValues: Record<string, FormulaValue>;
  issueCategories: FormulaErrorCategory[];
}

export interface FormulaConformanceFixture {
  id: string;
  definitions: FormulaSourceDefinition[];
  catalog: FormulaReferenceCatalog;
  character: Record<string, FormulaValue | undefined>;
  derivedOverrides?: Record<string, FormulaValue>;
  expected:
    | FormulaConformanceExpectedValue
    | FormulaConformanceExpectedError;
}

const characterLocation = { scope: "character" } as const;

/**
 * Cross-runtime contract cases. Web, Bot, and backend validation must consume
 * these inputs independently and produce the same normalized result.
 */
export const FORMULA_CONFORMANCE_FIXTURES: FormulaConformanceFixture[] = [
  {
    id: "round-negative-half-away-from-zero",
    definitions: [
      {
        id: "derived.rounded",
        kind: "derived",
        targetFieldId: "rounded",
        source: "=ROUND(-1.5)",
        location: characterLocation,
      },
    ],
    catalog: { character: { rounded: "number" } },
    character: {},
    expected: {
      status: "value",
      derivedValues: { rounded: -2 },
      issueCategories: [],
    },
  },
  {
    id: "dependency-order",
    definitions: [
      {
        id: "derived.total",
        kind: "derived",
        targetFieldId: "total",
        source: "=[subtotal] + [bonus]",
        location: characterLocation,
      },
      {
        id: "derived.subtotal",
        kind: "derived",
        targetFieldId: "subtotal",
        source: "=[base] * 2",
        location: characterLocation,
      },
    ],
    catalog: {
      character: {
        base: "number",
        bonus: "number",
        subtotal: "number",
        total: "number",
      },
    },
    character: { base: 7, bonus: 3 },
    expected: {
      status: "value",
      derivedValues: { subtotal: 14, total: 17 },
      issueCategories: [],
    },
  },
  {
    id: "missing-runtime-reference-is-an-error",
    definitions: [
      {
        id: "derived.total",
        kind: "derived",
        targetFieldId: "total",
        source: "=[base] + 1",
        location: characterLocation,
      },
    ],
    catalog: { character: { base: "number", total: "number" } },
    character: {},
    expected: {
      status: "error",
      derivedValues: {},
      issueCategories: ["reference_not_found"],
    },
  },
  {
    id: "divide-by-zero-is-an-error",
    definitions: [
      {
        id: "derived.ratio",
        kind: "derived",
        targetFieldId: "ratio",
        source: "=[amount] / [divisor]",
        location: characterLocation,
      },
    ],
    catalog: {
      character: {
        amount: "number",
        divisor: "number",
        ratio: "number",
      },
    },
    character: { amount: 10, divisor: 0 },
    expected: {
      status: "error",
      derivedValues: {},
      issueCategories: ["divide_by_zero"],
    },
  },
];
