// packages/dice/src/macro/resolver.test.ts
import { describe, it, expect } from "vitest";
import { MacroResolver, MacroValidationError } from "./resolver";
import type { RollMacroRegistry } from "./types";

const testRegistry: RollMacroRegistry = {
  defaultSystem: "coc7",
  macros: {
    str: {
      params: [{ name: "attr" }, { name: "bonusPenalty", default: "0" }],
      body: 'return roll("coc7:1d100{{@bonusPenalty}}<={{@attr}}");',
      label: "力量",
      bonusDice: { enabled: true, min: -2, max: 2, param: "bonusPenalty" },
    },
    射擊: {
      params: [{ name: "attr" }],
      body: 'return roll("coc7:1d100<={{@attr}}");',
      label: "射擊",
      bonusDice: { enabled: true },
    },
  },
};

describe("MacroResolver", () => {
  it("should resolve a simple macro", () => {
    const resolver = new MacroResolver(testRegistry);
    const result = resolver.resolve("str");

    expect(result).not.toBeNull();
    expect(result?.macroId).toBe("str");
    expect(result?.label).toBe("力量");
    expect(result?.system).toBe("coc7");
    expect(result?.params.map((p) => p.name)).toEqual(["attr", "bonusPenalty"]);
    expect(result?.body).toHaveLength(1);
    expect(result?.body[0].kind).toBe("return");
  });

  it("should return null for unknown macro", () => {
    const resolver = new MacroResolver(testRegistry);
    expect(resolver.resolve("unknown")).toBeNull();
  });

  it("should resolve Chinese macro name", () => {
    const resolver = new MacroResolver(testRegistry);
    const result = resolver.resolve("射擊");

    expect(result?.params.map((p) => p.name)).toEqual(["attr"]);
  });

  it("should include bonusDice config", () => {
    const resolver = new MacroResolver(testRegistry);
    const result = resolver.resolve("str");

    expect(result?.bonusDice?.enabled).toBe(true);
    expect(result?.bonusDice?.min).toBe(-2);
    expect(result?.bonusDice?.max).toBe(2);
    expect(result?.bonusDice?.param).toBe("bonusPenalty");
  });

  it("should default target to session", () => {
    const resolver = new MacroResolver(testRegistry);
    const result = resolver.resolve("str");

    expect(result?.target).toBe("session");
  });

  it("should resolve macro id case-insensitively", () => {
    const resolver = new MacroResolver(testRegistry);
    const result = resolver.resolve("DEX");

    expect(result).toBeNull();
    const strResult = resolver.resolve("STR");
    expect(strResult?.params.map((p) => p.name)).toEqual(["attr", "bonusPenalty"]);
  });

  it("should cache the parsed definition across repeated resolves", () => {
    const resolver = new MacroResolver(testRegistry);
    const first = resolver.resolve("str");
    const second = resolver.resolve("str");
    expect(first).toBe(second);
  });

  it("should reject a macro parameter named after a reserved identifier", () => {
    const registry: RollMacroRegistry = {
      macros: {
        bad: {
          params: [{ name: "target" }],
          body: 'return roll("1d100<={{@target}}");',
        },
      },
    };
    const resolver = new MacroResolver(registry);
    expect(() => resolver.resolve("bad")).toThrow(MacroValidationError);
  });

  it("should reject a macro with duplicate parameter names", () => {
    const registry: RollMacroRegistry = {
      macros: {
        bad: {
          params: [{ name: "attr" }, { name: "attr" }],
          body: 'return roll("1d100<={{@attr}}");',
        },
      },
    };
    const resolver = new MacroResolver(registry);
    expect(() => resolver.resolve("bad")).toThrow(MacroValidationError);
  });
});
