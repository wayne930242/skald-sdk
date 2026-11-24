// packages/dice/src/macro/reserved-words.ts

/**
 * Identifiers the interpreter binds automatically after a `roll(...)` call
 * executes inside a macro body. Field names and macro parameter names may
 * not use these — otherwise `@target` (etc.) would silently resolve to the
 * roll outcome instead of the user's field/parameter.
 */
export const MACRO_RESERVED_IDENTIFIERS = [
  "rolled",
  "target",
  "total",
  "margin",
] as const;

export type MacroReservedIdentifier = (typeof MACRO_RESERVED_IDENTIFIERS)[number];

export function isReservedIdentifier(name: string): boolean {
  return (MACRO_RESERVED_IDENTIFIERS as readonly string[]).includes(name);
}

/**
 * Names a macro id or parameter cannot use because a plain object does not
 * hold them as ordinary keys: `scope["__proto__"] = 1` adds no key, and the
 * others read `Object.prototype` members when the key is absent.
 */
export const MACRO_UNSAFE_NAMES = ["__proto__", "constructor", "prototype"] as const;

export function isUnsafeMacroName(name: string): boolean {
  return (MACRO_UNSAFE_NAMES as readonly string[]).includes(name);
}
