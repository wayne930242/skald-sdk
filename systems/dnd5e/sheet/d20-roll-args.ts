/**
 * What a D&D roll options choice adds to the sheet's `{{#d20[mod]}}` call (B-021). The macro takes
 * numbers only, so a modifier joins the call's first argument, and extra dice (Bless 1d4, Bane
 * −1d4) reach the macro's `xn` (signed count) and `xd` (size) parameters as argument overrides.
 */

import { buildRollExpression } from "@skald/sheet-sdk/modules/rolls";

const D20_CALL = /^\{\{#d20\[([\s\S]*)\]\}\}$/;

/** The index of the first comma outside parentheses and brackets, or -1. */
function topLevelComma(args: string): number {
  let depth = 0;
  for (let index = 0; index < args.length; index++) {
    const char = args[index];
    if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    else if (char === "," && depth === 0) return index;
  }
  return -1;
}

/**
 * Whether the dialog's modifier can reach this roll (BUAT-F002): a whole d20 call takes it in its
 * first argument, a plain dice expression after it. The engine reads any other macro call as the
 * whole roll (text after `}}` is dropped), so such a roll offers no modifier.
 */
export function d20ModifierApplies(expression: string): boolean {
  return D20_CALL.test(expression.trim()) || !expression.includes("{{#");
}

/**
 * The d20 call with `modifier` added to its first argument, or a plain dice expression with it
 * added after; any other macro call is refused (see `d20ModifierApplies`).
 */
export function withD20Modifier(expression: string, modifier: number): string {
  if (modifier === 0) return expression;
  if (!Number.isInteger(modifier)) throw new Error(`A d20 modifier must be a whole number: ${modifier}`);
  const match = D20_CALL.exec(expression.trim());
  if (!match) {
    if (!d20ModifierApplies(expression)) throw new Error(`Not a d20 roll: ${expression}`);
    return buildRollExpression(expression, { flatModifier: modifier });
  }
  const args = match[1];
  const comma = topLevelComma(args);
  const first = (comma < 0 ? args : args.slice(0, comma)).trim();
  const rest = comma < 0 ? "" : args.slice(comma);
  const sign = modifier > 0 ? "+" : "-";
  return `{{#d20[(${first})${sign}${Math.abs(modifier)}${rest}]}}`;
}

/** `1d4` / `-1d4` / `+1d8` as the macro's extra-dice arguments; nothing for no extra dice. */
export function d20ExtraDiceArgs(extraDice: string): { xn: number; xd: number } | undefined {
  const text = extraDice.trim();
  if (text === "") return undefined;
  const match = /^([+-]?)(\d+)d(\d+)$/i.exec(text);
  if (!match) throw new Error(`Extra dice must be one kind of die, such as 1d4 or -1d4: ${extraDice}`);
  const count = Number(match[2]);
  const size = Number(match[3]);
  if (count < 1 || size < 1) throw new Error(`Extra dice must be at least 1d1: ${extraDice}`);
  return { xn: match[1] === "-" ? -count : count, xd: size };
}

/** Whether the system's `d20` macro takes extra dice: one seeded before B-021 does not. */
export function d20TakesExtraDice(rollMacros: { macros?: Record<string, { params?: Array<{ name: string }> }> } | undefined): boolean {
  const params = rollMacros?.macros?.d20?.params ?? [];
  return params.some((param) => param.name === "xn") && params.some((param) => param.name === "xd");
}

/**
 * A Critical Hit's damage (B-022): every die term rolls twice as many dice (`1d8` → `2d8`, `d6` →
 * `2d6`); numbers and `{{@…}}` placeholders stay, so a modifier is not doubled.
 */
export function withCriticalDice(expression: string): string {
  return expression.replace(/(^|[^\w@.}])(\d*)d(\d+)(?!\w)/gi, (_, before: string, count: string, size: string) =>
    `${before}${2 * (count === "" ? 1 : Number(count))}d${size}`,
  );
}
