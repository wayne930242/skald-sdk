// packages/dice/src/macro/interpreter.test.ts
import { describe, it, expect } from "vitest";
import { evaluateMacro, MacroEvaluationError } from "./interpreter";
import { MacroResolver } from "./resolver";
import { parseMacroReference } from "./parser";
import type { RollMacroRegistry } from "./types";

const COC_REGISTRY: RollMacroRegistry = {
  defaultSystem: "coc7",
  defaultTarget: "session",
  macros: {
    coc: {
      params: [{ name: "attr" }, { name: "bonusPenalty", default: "0" }],
      body: 'return roll("coc7:1d100{{@bonusPenalty}}<={{@attr}}");',
      bonusDice: { enabled: true, min: -2, max: 2, param: "bonusPenalty" },
    },
  },
};

function resolve(macroId: string) {
  const resolver = new MacroResolver(COC_REGISTRY);
  const definition = resolver.resolve(macroId);
  if (!definition) throw new Error("macro not found");
  return definition;
}

describe("evaluateMacro", () => {
  it("evaluates a single-argument call, defaulting the omitted bonusPenalty to 0", () => {
    const definition = resolve("coc");
    const call = parseMacroReference("{{#coc[@str]}}")!;
    const evalResult = evaluateMacro(definition, call, { str: 50 });

    expect(evalResult.result).not.toBeNull();
    expect(evalResult.result!.targetValue).toBe(50);
    expect(evalResult.result!.rolled).toBeGreaterThanOrEqual(1);
    expect(evalResult.result!.rolled).toBeLessThanOrEqual(100);
    expect(evalResult.result!.successLevel).toBeDefined();
    expect(evalResult.writes).toEqual([]);
    expect(evalResult.rolls).toHaveLength(1);
  });

  it("evaluates a two-argument call with an explicit bonus die", () => {
    const definition = resolve("coc");
    const call = parseMacroReference("{{#coc[@str, 2]}}")!;
    const evalResult = evaluateMacro(definition, call, { str: 50 });

    expect(evalResult.result!.bonusDice).toBe(2);
  });

  it("evaluates a penalty die from a negative argument", () => {
    const definition = resolve("coc");
    const call = parseMacroReference("{{#coc[@str, -1]}}")!;
    const evalResult = evaluateMacro(definition, call, { str: 50 });

    expect(evalResult.result!.bonusDice).toBe(-1);
  });

  it("applies argOverrides on top of the call's own arguments (D12)", () => {
    const definition = resolve("coc");
    const call = parseMacroReference("{{#coc[@str]}}")!;
    const evalResult = evaluateMacro(definition, call, { str: 50 }, undefined, {
      bonusPenalty: 2,
    });

    expect(evalResult.result!.bonusDice).toBe(2);
  });

  it("throws when the call supplies more arguments than the macro declares", () => {
    const definition = resolve("coc");
    const call = parseMacroReference("{{#coc[@str, 1, 2]}}")!;
    expect(() => evaluateMacro(definition, call, { str: 50 })).toThrow(MacroEvaluationError);
  });

  it("throws when a required argument is missing and has no default", () => {
    const definition = resolve("coc");
    const call = parseMacroReference("{{#coc}}")!;
    expect(() => evaluateMacro(definition, call, { str: 50 })).toThrow(MacroEvaluationError);
  });
});

describe("evaluateMacro: branching, writes, nested rolls", () => {
  const MISHAP_REGISTRY: RollMacroRegistry = {
    macros: {
      sanCheck: {
        params: [{ name: "current" }],
        body: `
          roll("coc7:1d100<={{@current}}");
          if (@rolled > @target) {
            @san_current := @current - 1;
            return 'failure';
          } else {
            return 'regular';
          }
        `,
      },
    },
  };

  it("selects the matching branch and records a field write", () => {
    const resolver = new MacroResolver(MISHAP_REGISTRY);
    const definition = resolver.resolve("sanCheck")!;
    const call = parseMacroReference("{{#sanCheck[@san_current]}}")!;

    // Force a failure by using a target of 0 (any roll 1-100 exceeds it)
    const evalResult = evaluateMacro(definition, call, { san_current: 0 });

    expect(evalResult.writes).toHaveLength(1);
    expect(evalResult.writes[0].field).toBe("san_current");
    expect(evalResult.writes[0].value).toBe(-1);
    expect(evalResult.result!.successLevel).toBe("failure");
  });

  it("throws when no branch matches and there is no else", () => {
    const registry: RollMacroRegistry = {
      macros: {
        noElse: {
          params: [{ name: "attr" }],
          body: `
            roll("1d100<={{@attr}}");
            if (@rolled > 1000) {
              return 'impossible';
            }
          `,
        },
      },
    };
    const resolver = new MacroResolver(registry);
    const definition = resolver.resolve("noElse")!;
    const call = parseMacroReference("{{#noElse[@attr]}}")!;
    expect(() => evaluateMacro(definition, call, { attr: 50 })).toThrow(MacroEvaluationError);
  });

  it("rejects a dynamic write target that does not evaluate to a string", () => {
    const registry: RollMacroRegistry = {
      macros: {
        badWrite: {
          params: [{ name: "attr" }],
          body: "@(1 + 1) := 5; return @attr;",
        },
      },
    };
    const resolver = new MacroResolver(registry);
    const definition = resolver.resolve("badWrite")!;
    const call = parseMacroReference("{{#badWrite[@attr]}}")!;
    expect(() => evaluateMacro(definition, call, { attr: 50 })).toThrow(MacroEvaluationError);
  });
});

describe("evaluateMacro: numeric return overrides the preceding roll's `rolled`", () => {
  it("overrides `rolled` with a computed number while leaving `rolls` (the raw breakdown) untouched", () => {
    const registry: RollMacroRegistry = {
      macros: {
        pick: {
          params: [{ name: "count", default: "1" }],
          body: 'roll("1d1000"); return (@rolled - 1) - @count * floor((@rolled - 1) / @count) + 1;',
        },
      },
    };
    const resolver = new MacroResolver(registry);
    const definition = resolver.resolve("pick")!;
    const call = parseMacroReference("{{#pick}}")!;

    const evalResult = evaluateMacro(definition, call, {}, undefined, { count: 5 });

    expect(evalResult.result!.rolled).toBeGreaterThanOrEqual(1);
    expect(evalResult.result!.rolled).toBeLessThanOrEqual(5);
    // The raw 1d1000 roll is still recorded, just no longer the headline value.
    expect(evalResult.result!.rolls).toHaveLength(1);
    expect(evalResult.result!.rolls[0]).toBeGreaterThanOrEqual(1);
    expect(evalResult.result!.rolls[0]).toBeLessThanOrEqual(1000);
  });

  it("`return @rolled;` is a no-op, matching the documented sanityCheck contract (no re-roll)", () => {
    const registry: RollMacroRegistry = {
      macros: {
        identity: {
          params: [],
          body: 'roll("1d100"); return @rolled;',
        },
      },
    };
    const resolver = new MacroResolver(registry);
    const definition = resolver.resolve("identity")!;
    const call = parseMacroReference("{{#identity}}")!;

    const evalResult = evaluateMacro(definition, call, {});

    expect(evalResult.result!.rolled).toBe(evalResult.rolls[0].rolled);
  });
});
