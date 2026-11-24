// packages/dice/src/macro/global-macros.test.ts
import { describe, expect, it } from "vitest";
import { executeExpressionWithMacros } from "./execute-with-macros";
import { mergeGlobalMacros } from "./global-macros";
import type { RollMacroRegistry } from "./types";

describe("GLOBAL_MACROS.randomOption (real end-to-end execution)", () => {
  it("rolls within [1, count] when the button supplies count via argOverrides", () => {
    const registry = mergeGlobalMacros({ macros: {} });

    const evalResult = executeExpressionWithMacros(
      "{{#randomOption}}",
      registry,
      {},
      undefined,
      { count: 5 },
    );

    expect(evalResult).not.toBeNull();
    expect(evalResult!.result).not.toBeNull();
    expect(evalResult!.result!.rolled).toBeGreaterThanOrEqual(1);
    expect(evalResult!.result!.rolled).toBeLessThanOrEqual(5);
  });

  it("does not throw when called with no argOverride (falls back to its own default)", () => {
    const registry = mergeGlobalMacros({ macros: {} });

    const evalResult = executeExpressionWithMacros("{{#randomOption}}", registry, {});

    expect(evalResult).not.toBeNull();
    expect(evalResult!.result!.rolled).toBe(1);
  });

  it("a system's own same-id macro still wins and executes instead of the global default", () => {
    const overridden: RollMacroRegistry = {
      macros: {
        randomOption: {
          params: [{ name: "count", default: "1" }],
          body: 'return roll("coc7:1d100");',
        },
      },
    };
    const registry = mergeGlobalMacros(overridden);

    const evalResult = executeExpressionWithMacros(
      "{{#randomOption}}",
      registry,
      {},
      undefined,
      { count: 3 },
    );

    expect(evalResult!.result!.resolvedDiceExpr).toMatch(/^coc7:/);
  });
});
