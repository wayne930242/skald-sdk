import { parseDiceExpression } from "@skald/dice";

/**
 * A roll's context is numbers only (`flattenDataToContext`), so a text field that
 * holds dice, such as a weapon's damage dice `1d8`, cannot be read as `{{@damageDice}}`
 * by the formula evaluator. The sheet puts such a field's notation into the roll
 * expression itself before the roll, and only when the text is plain dice notation:
 * anything else stays a `{{@…}}` reference, which the numeric context then resolves or
 * fails on exactly as before.
 */

/** A dice term: count, `d`, sides or `F`, and an optional keep/drop modifier (`2d20kh1`, `4d6dl1`). */
const TERM = String.raw`\d{0,3}d(?:\d{1,4}|f)(?:k[hl]?\d{1,3}|d[hl]\d{1,3})?`;
/** Dice terms and whole numbers joined by `+` or `-`, starting with a dice term. */
const DICE_NOTATION = new RegExp(String.raw`^${TERM}(?:[+-](?:${TERM}|\d{1,4}))*$`, "i");
const MAX_NOTATION_LENGTH = 40;

/** Whether a field's text is dice notation a roll may take in, e.g. `1d8`, `2d6 + 1d4`, `1d12+2`. */
export function isFieldDiceNotation(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  return (
    compact.length > 0 &&
    compact.length <= MAX_NOTATION_LENGTH &&
    DICE_NOTATION.test(compact) &&
    parseDiceExpression(compact) !== null
  );
}

/**
 * Replaces each bare `{{@field}}` whose value in `data` is a string of dice notation
 * with that notation (spaces removed). A reference is only replaced where it is added:
 * at the start of the dice part (after a `system:` prefix) or after `+`. A subtracted,
 * multiplied or compared reference, a formula (`{{@x /floor 2}}`), a number and any
 * other text stay as they are.
 */
export function substituteDiceFields(expression: string, data: Record<string, unknown>): string {
  return expression.replace(
    /\{\{@([A-Za-z0-9_-]+)\}\}/g,
    (reference: string, fieldId: string, offset: number, whole: string) => {
      const value = data[fieldId];
      if (typeof value !== "string" || !isFieldDiceNotation(value)) return reference;
      const before = whole.slice(0, offset).trimEnd();
      // The dice part only: nothing after a comparison (`1d20>=10+{{@x}}` is the target)
      if (/[<>=]/.test(before)) return reference;
      if (before !== "" && !before.endsWith("+") && !/^[a-z0-9]+:$/i.test(before)) {
        return reference;
      }
      const after = whole.slice(offset + reference.length).trimStart();
      if (after !== "" && !after.startsWith("+") && !after.startsWith("-")) return reference;
      return value.replace(/\s+/g, "");
    },
  );
}
