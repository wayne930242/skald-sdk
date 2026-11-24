import type { AttributeFormula, AttributeRollResult } from "./types";
import { rollDiceExpression } from "./roller";

/**
 * CoC 7e standard attribute generation formulas
 *
 * 3D6×5: STR, CON, DEX, APP, POW
 * (2D6+6)×5: SIZ, INT, EDU
 */
export const COC7E_ATTRIBUTE_FORMULAS: AttributeFormula[] = [
  { id: "str", label: "STR", formula: "3D6×5" },
  { id: "con", label: "CON", formula: "3D6×5" },
  { id: "siz", label: "SIZ", formula: "(2D6+6)×5" },
  { id: "dex", label: "DEX", formula: "3D6×5" },
  { id: "app", label: "APP", formula: "3D6×5" },
  { id: "int", label: "INT", formula: "(2D6+6)×5" },
  { id: "pow", label: "POW", formula: "3D6×5" },
  { id: "edu", label: "EDU", formula: "(2D6+6)×5" },
];

/**
 * Core characteristic formula of the pulp percentile variant
 * Used when archetype is selected
 */
export const PULP_CORE_CHAR_FORMULA: AttributeFormula = {
  id: "pulp_core",
  label: "Core",
  formula: "(1D6+13)×5",
};

/**
 * Roll a specific attribute by ID
 * Returns null if attribute ID is not found
 */
export function rollAttribute(attributeId: string): AttributeRollResult | null {
  const formula = COC7E_ATTRIBUTE_FORMULAS.find((f) => f.id === attributeId);
  if (!formula) return null;

  const diceResult = rollDiceExpression(formula.formula);
  if (!diceResult) return null;

  return {
    attribute: formula,
    diceResult,
    finalValue: diceResult.total,
  };
}

/**
 * Roll all CoC 7e attributes at once
 * Returns an array of results in standard attribute order
 */
export function rollAllAttributes(): AttributeRollResult[] {
  const results: AttributeRollResult[] = [];

  for (const formula of COC7E_ATTRIBUTE_FORMULAS) {
    const result = rollAttribute(formula.id);
    if (result) {
      results.push(result);
    }
  }

  return results;
}

/**
 * Roll with the pulp percentile variant's core characteristic formula
 * Used for the archetype's core characteristic
 */
export function rollPulpCoreChar(): AttributeRollResult | null {
  const diceResult = rollDiceExpression(PULP_CORE_CHAR_FORMULA.formula);
  if (!diceResult) return null;

  return {
    attribute: PULP_CORE_CHAR_FORMULA,
    diceResult,
    finalValue: diceResult.total,
  };
}
