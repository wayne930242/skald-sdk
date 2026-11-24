// packages/dice/src/macro/integration.test.ts
import { describe, it, expect } from "vitest";
import { MacroResolver } from "./resolver";
import { hasMacroReference, parseMacroReference } from "./parser";
import { evaluateMacro } from "./interpreter";
import { executeExpressionWithMacros } from "./execute-with-macros";
import type { RollMacroRegistry } from "./types";

/**
 * Integration tests for the macro system.
 * Tests end-to-end macro resolution and roll execution against a hand-written
 * sample registry; integration-coc7e.test.ts runs the real production
 * coc7e/roll-macros.json, which stays out of the open-source export.
 */

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

const CHARACTER_CONTEXT: Record<string, number> = {
  str: 50,
  dex: 65,
  luck_current: 45,
  san_current: 55,
};

describe("Macro Integration", () => {
  describe("end-to-end macro resolution and execution", () => {
    it("should detect, resolve, and execute a coc[@str] macro call", () => {
      const input = "{{#coc[@str]}}";

      expect(hasMacroReference(input)).toBe(true);

      const parsed = parseMacroReference(input);
      expect(parsed).not.toBeNull();
      expect(parsed!.macroId).toBe("coc");

      const resolver = new MacroResolver(COC_REGISTRY);
      const resolved = resolver.resolve(parsed!.macroId);
      expect(resolved).not.toBeNull();
      expect(resolved!.bonusDice?.enabled).toBe(true);

      const evalResult = evaluateMacro(resolved!, parsed!, CHARACTER_CONTEXT);
      expect(evalResult.result).not.toBeNull();
      expect(evalResult.result!.targetValue).toBe(50);
      expect(evalResult.result!.rolled).toBeGreaterThanOrEqual(1);
      expect(evalResult.result!.rolled).toBeLessThanOrEqual(100);
      expect(evalResult.result!.successLevel).toBeDefined();
    });

    it("should handle coc[@dex] with a higher target value", () => {
      const parsed = parseMacroReference("{{#coc[@dex]}}")!;
      const resolver = new MacroResolver(COC_REGISTRY);
      const resolved = resolver.resolve(parsed.macroId)!;

      const evalResult = evaluateMacro(resolved, parsed, CHARACTER_CONTEXT);

      expect(evalResult.result!.targetValue).toBe(65);
    });

    it("should handle coc[@luck_current] with a field-reference argument", () => {
      const parsed = parseMacroReference("{{#coc[@luck_current]}}")!;
      const resolver = new MacroResolver(COC_REGISTRY);
      const resolved = resolver.resolve(parsed.macroId)!;

      const evalResult = evaluateMacro(resolved, parsed, CHARACTER_CONTEXT);

      expect(evalResult.result!.targetValue).toBe(45);
    });

    it("should apply an explicit bonus-die argument", () => {
      const parsed = parseMacroReference("{{#coc[@str, 2]}}")!;
      const resolver = new MacroResolver(COC_REGISTRY);
      const resolved = resolver.resolve(parsed.macroId)!;

      const evalResult = evaluateMacro(resolved, parsed, CHARACTER_CONTEXT);

      expect(evalResult.result!.bonusDice).toBe(2);
    });

    it("should return null for unknown macro", () => {
      const parsed = parseMacroReference("{{#unknown}}")!;
      const resolver = new MacroResolver(COC_REGISTRY);
      const resolved = resolver.resolve(parsed.macroId);

      expect(resolved).toBeNull();
    });
  });

  describe("macro detection edge cases", () => {
    it("should not detect field references as macros", () => {
      expect(hasMacroReference("{{@str}}")).toBe(false);
      expect(hasMacroReference("coc7:1d100<={{@str}}")).toBe(false);
    });

    it("should detect macro in mixed content", () => {
      expect(hasMacroReference("Roll: {{#coc[@str]}}")).toBe(true);
    });

    it("should handle empty and invalid inputs", () => {
      expect(hasMacroReference("")).toBe(false);
      expect(hasMacroReference("1d100")).toBe(false);
      expect(hasMacroReference("{{}}")).toBe(false);
      expect(hasMacroReference("{{#}}")).toBe(false);
    });
  });

  describe("resolver with default system", () => {
    it("should apply default system to resolved macros", () => {
      const resolver = new MacroResolver(COC_REGISTRY);
      const resolved = resolver.resolve("coc");

      expect(resolved!.system).toBe("coc7");
    });

    it("should apply default target to resolved macros", () => {
      const resolver = new MacroResolver(COC_REGISTRY);
      const resolved = resolver.resolve("coc");

      expect(resolved!.target).toBe("session");
    });
  });

  describe("real-world scenarios via executeExpressionWithMacros", () => {
    it("should produce a full result structure for a skill check", () => {
      const evalResult = executeExpressionWithMacros(
        "{{#coc[@str]}}",
        COC_REGISTRY,
        { str: 50 },
      );

      expect(evalResult).not.toBeNull();
      expect(evalResult!.result).toHaveProperty("rolled");
      expect(evalResult!.result).toHaveProperty("targetValue");
      expect(evalResult!.result).toHaveProperty("successLevel");
      expect(evalResult!.result).toHaveProperty("rolls");
      expect(evalResult!.writes).toEqual([]);
    });

    it("should vary target value with character context", () => {
      const lowDex = executeExpressionWithMacros("{{#coc[@dex]}}", COC_REGISTRY, {
        dex: 25,
      });
      const highDex = executeExpressionWithMacros("{{#coc[@dex]}}", COC_REGISTRY, {
        dex: 80,
      });

      expect(lowDex!.result!.targetValue).toBe(25);
      expect(highDex!.result!.targetValue).toBe(80);
    });

    it("should return null for a plain (non-macro) invalid expression", () => {
      const evalResult = executeExpressionWithMacros(
        "invalid-expression-!!@@",
        COC_REGISTRY,
        {},
      );
      expect(evalResult).toBeNull();
    });

    it("should execute a plain (non-macro) roll expression directly", () => {
      const evalResult = executeExpressionWithMacros("1d100<=50", undefined, {});
      expect(evalResult).not.toBeNull();
      expect(evalResult!.result!.targetValue).toBe(50);
      expect(evalResult!.writes).toEqual([]);
    });

    it("should return a non-null result for a write-only macro (no return statement)", () => {
      const writeOnlyRegistry: RollMacroRegistry = {
        macros: {
          setStatus: {
            params: [],
            body: "@status := 'dazed';",
          },
        },
      };

      const evalResult = executeExpressionWithMacros("{{#setStatus}}", writeOnlyRegistry, {});

      expect(evalResult).not.toBeNull();
      expect(evalResult!.result).toBeNull();
      expect(evalResult!.writes).toEqual([{ field: "status", value: "dazed" }]);
      expect(evalResult!.rolls).toEqual([]);
    });

    it("should still return null for a genuinely unresolvable macro reference", () => {
      const evalResult = executeExpressionWithMacros("{{#doesNotExist}}", COC_REGISTRY, {});
      expect(evalResult).toBeNull();
    });

    it("should behave unchanged for a macro with a return statement", () => {
      const evalResult = executeExpressionWithMacros("{{#coc[@str]}}", COC_REGISTRY, { str: 50 });
      expect(evalResult).not.toBeNull();
      expect(evalResult!.result).not.toBeNull();
      expect(evalResult!.result!.targetValue).toBe(50);
    });
  });
});
