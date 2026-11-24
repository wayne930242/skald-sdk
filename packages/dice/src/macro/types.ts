// @skald/dice macro/types.ts

import type { FormulaAST } from "../formula/parser";
import type { BonusDiceConfig, DialogConfig, RollSystem, RollTarget } from "../roll-expression/types";

/** A macro parameter declaration */
export interface MacroParamDefinition {
  /** Parameter name — referenced inside the body as `@name`; must not be a reserved identifier */
  name: string;
  /** Formula-string default (evaluated in the caller's context) used when the call omits this argument */
  default?: string;
}

/** `@name := expr;` or `@(expr) := expr;` */
export type MacroWriteTarget =
  | { kind: "static"; field: string }
  | { kind: "dynamic"; expr: FormulaAST };

export type MacroReturnValue =
  | { kind: "roll"; template: string }
  | { kind: "expr"; expr: FormulaAST };

export type MacroStatement =
  | { kind: "roll"; template: string }
  | { kind: "assign"; target: MacroWriteTarget; expr: FormulaAST }
  | { kind: "return"; value: MacroReturnValue }
  | {
      kind: "if";
      branches: Array<{ condition: FormulaAST; body: MacroStatement[] }>;
      elseBody?: MacroStatement[];
    };

/**
 * Roll macro definition in game system data.
 *
 * Example:
 * {
 *   "coc": {
 *     "label": "CoC7e 技能檢定",
 *     "params": [{ "name": "attr" }, { "name": "bonusPenalty", "default": "0" }],
 *     "body": "return roll(\"coc7:1d100{{@bonusPenalty}}<={{@attr}}\");",
 *     "bonusDice": { "enabled": true, "min": -2, "max": 2, "param": "bonusPenalty" }
 *   }
 * }
 */
export interface RollMacroDefinition {
  /** Display label (can be i18n key) */
  label?: string;
  /** System identifier (coc7, fate, etc.) */
  system?: RollSystem;
  /** Roll target destination */
  target?: RollTarget;
  /** Ordered parameter declarations */
  params: MacroParamDefinition[];
  /** Macro body DSL source (parsed via parseMacroBody at registration time — see ResolvedMacroDefinition) */
  body: string;
  /** Bonus/penalty dice picker UI metadata — which param it overrides (D12) */
  bonusDice?: BonusDiceConfig;
  /** Dialog config for additional inputs */
  dialog?: DialogConfig;
}

/**
 * Collection of macros defined in a game system
 */
export interface RollMacroRegistry {
  /** Macro definitions keyed by macro ID */
  macros: Record<string, RollMacroDefinition>;
  /** Default system for macros without explicit system */
  defaultSystem?: RollSystem;
  /** Default target for macros without explicit target */
  defaultTarget?: RollTarget;
}

/** A macro definition with registry-level defaults (system/target/label) applied */
export interface ResolvedMacroDefinition {
  macroId: string;
  label: string;
  system?: RollSystem;
  target: RollTarget;
  params: MacroParamDefinition[];
  body: MacroStatement[];
  bonusDice?: BonusDiceConfig;
  dialog?: DialogConfig;
}

/** A single parsed `{{#name[arg1, arg2, ...]}}` (or shorthand `#name`) reference */
export interface ParsedMacroCall {
  macroId: string;
  /** One parsed formula AST per argument, in call order */
  args: FormulaAST[];
  raw: string;
}

/** A pending character-field write produced by a macro evaluation, not yet flushed */
export interface MacroWrite {
  field: string;
  value: number | string;
}
