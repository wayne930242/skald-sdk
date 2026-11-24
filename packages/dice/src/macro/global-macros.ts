// packages/dice/src/macro/global-macros.ts
//
// Macros available in every system without redefinition (D4). Deliberately a
// code constant, not a database row (D5) — see design.md for the incident
// this decision is directly responding to.

import type { RollMacroRegistry } from "./types";

/**
 * Shared macro definitions merged into every loaded registry at load time.
 * A system's own `roll-macros.json` id always wins over a same-id entry here.
 */
export const GLOBAL_MACROS: RollMacroRegistry["macros"] = {
  randomOption: {
    label: "{{i18n:macros.randomOption}}",
    // `default: "1"` is load-bearing, not a placeholder: param binding
    // resolves defaults BEFORE argOverrides are applied (see
    // interpreter.ts's evaluateMacro), so without a default here a button's
    // optionSource-supplied count would never reach the param — the call
    // would throw "missing required argument" before the override is ever
    // consulted.
    //
    // Rolls a fixed 1d1000 (not `1d{{@count}}`): the roll(...) template's
    // `{{}}` substitution (executor.ts) only replaces a placeholder that is
    // NOT at the start of the dice expression with a signed `+N`/`-N`
    // modifier suffix, not a raw value — so `{{@count}}` sitting in the
    // "sides" position of "1dN" would resolve to the invalid notation
    // "1d+5" and throw. Reducing the fixed roll into [1, count] via modulo
    // in the return expression sidesteps that limitation entirely.
    params: [{ name: "count", default: "1" }],
    body:
      'roll("1d1000");\n' +
      "return (@rolled - 1) - @count * floor((@rolled - 1) / @count) + 1;",
  },
};

/**
 * Merge the global macro set into a loaded registry. System-specific macro
 * ids win over a same-id global macro (D4).
 */
export function mergeGlobalMacros(registry: RollMacroRegistry): RollMacroRegistry {
  return {
    ...registry,
    macros: { ...GLOBAL_MACROS, ...registry.macros },
  };
}
