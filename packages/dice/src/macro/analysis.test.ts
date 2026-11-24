// packages/dice/src/macro/analysis.test.ts
import { describe, expect, it, vi } from "vitest";
import { analyzeMacroDefinition, walkMacroExpression } from "./analysis";
import { GLOBAL_MACROS } from "./global-macros";
import { evaluateMacro } from "./interpreter";
import { MacroResolver } from "./resolver";

function analysisOf(body: string, params: Array<{ name: string; default?: string }> = []) {
  const result = analyzeMacroDefinition({ params, body });
  if (!result.success) throw new Error(result.reason);
  return result.analysis;
}

function references(body: string, params: Array<{ name: string; default?: string }> = []) {
  const names: string[] = [];
  for (const expression of analysisOf(body, params).expressions) {
    walkMacroExpression(expression, (node) => {
      if (node.type === "attr" && node.name) names.push(node.name);
    });
  }
  return names;
}

describe("analyzeMacroDefinition", () => {
  it("lists rolls and writes in every branch", () => {
    const analysis = analysisOf(
      'roll("1d20"); if (@rolled > @lore) { roll("1d4"); @lore := min(20, @lore + @rolled); ' +
        "return 'gained'; } else { @('luck') := 1; return roll(\"1d6+{{@bonus}}\"); }",
      [{ name: "bonus", default: "0" }],
    );
    expect(analysis.rollTemplates).toEqual(["1d20", "1d4", "1d6+{{@bonus}}"]);
    expect(analysis.staticWrites).toEqual(["lore"]);
    expect(analysis.hasDynamicWrite).toBe(true);
  });

  it("reports a macro without writes as read-only", () => {
    const analysis = analysisOf('roll("2d6+5"); return @rolled * 5;');
    expect(analysis.staticWrites).toEqual([]);
    expect(analysis.hasDynamicWrite).toBe(false);
  });

  it("counts required parameters up to the last one without a default", () => {
    expect(analysisOf('return roll("1d6");', [])).toMatchObject({
      paramCount: 0,
      requiredParamCount: 0,
    });
    expect(
      analysisOf('return roll("1d6");', [
        { name: "a", default: "1" },
        { name: "b" },
        { name: "c", default: "0" },
      ]),
    ).toMatchObject({ paramCount: 3, requiredParamCount: 2 });
    expect(analyzeMacroDefinition(GLOBAL_MACROS.randomOption)).toMatchObject({
      success: true,
      analysis: { paramCount: 1, requiredParamCount: 0 },
    });
  });

  it("collects references from conditions, values, defaults and roll placeholders", () => {
    expect(
      references(
        'roll("1d100<={{@skill}}"); if (@margin >= @floor) { return half(@str); } else { return 0; }',
        [{ name: "floor", default: "@dex" }],
      ).sort(),
    ).toEqual(["dex", "floor", "margin", "skill", "str"]);
  });

  it("fails with the parser's reason", () => {
    expect(analyzeMacroDefinition({ params: [], body: 'for (;;) { roll("1d6"); }' })).toEqual({
      success: false,
      reason: "Loop constructs (for/while) are not supported in macro bodies.",
    });
    expect(
      analyzeMacroDefinition({ params: [{ name: "n", default: "(" }], body: 'return roll("1d6");' }),
    ).toMatchObject({ success: false });
  });

  it("keeps parameter defaults and return expressions apart from the rest", () => {
    const analysis = analysisOf(
      'roll("1d6"); if (@rolled > @n) { return \'high\'; } else { return @rolled + 1; }',
      [{ name: "n", default: "@dex + 1" }],
    );
    expect(analysis.defaultExpressions).toHaveLength(1);
    expect(analysis.returnExpressions.map((expression) => expression.type)).toEqual([
      "string",
      "binary",
    ]);
    for (const expression of [
      ...analysis.defaultExpressions,
      ...analysis.returnExpressions,
    ]) {
      expect(analysis.expressions).toContain(expression);
    }
  });

  it("counts the rolls and writes of the longest path, not of the whole body", () => {
    const branch = (rolls: number, writes: number) =>
      'roll("1d6");'.repeat(rolls) + "@hp := 1;".repeat(writes);
    const analysis = analysisOf(
      `roll("1d6"); if (@rolled > 3) { ${branch(4, 1)} } elif (@rolled > 1) { ${branch(2, 6)} return 0; } else { ${branch(1, 0)} } roll("1d6"); @hp := 2;`,
    );
    expect(analysis.rollTemplates).toHaveLength(9);
    // 1 + the 4-roll branch + 1; the 6-write branch returns before the last write.
    expect(analysis.maxRollsPerRun).toBe(6);
    expect(analysis.maxWritesPerRun).toBe(6);
  });

  describe("roll results read before a roll bound them", () => {
    const unbound = (body: string) => analysisOf(body).unboundReads.sort();

    it("finds @rolled read before any roll, as the interpreter does", () => {
      const body = 'if (@rolled > 3) { return roll("1d6"); } else { return roll("1d4"); }';
      expect(unbound(body)).toEqual(["rolled"]);
      const definition = new MacroResolver({ macros: { m: { params: [], body } } }).resolve("m")!;
      expect(() =>
        evaluateMacro(definition, { macroId: "m", args: [], raw: "" }, { str: 50 }),
      ).toThrow("Formula reference not found: rolled");
    });

    it("accepts @rolled and @total once every path has rolled", () => {
      expect(
        unbound(
          'if (@str > 3) { roll("1d6"); } else { roll("1d4"); } return @rolled + @total;',
        ),
      ).toEqual([]);
    });

    it("finds @rolled when one path reaches the read without a roll", () => {
      expect(
        unbound('if (@str > 3) { roll("1d6"); } else { @hp := 1; } return @rolled;'),
      ).toEqual(["rolled"]);
    });

    it("ignores a path that has already returned", () => {
      expect(
        unbound('if (@str > 3) { roll("1d6"); } else { return roll("1d4"); } return @rolled;'),
      ).toEqual([]);
    });

    it("binds @target and @margin only after a roll with a comparison", () => {
      expect(unbound('roll("1d100"); return @margin + @target;')).toEqual([
        "margin",
        "target",
      ]);
      expect(unbound('roll("1d100<={{@str}}"); roll("1d6"); return @margin;')).toEqual([]);
    });

    it("reads a roll's placeholders before that roll binds its result", () => {
      expect(unbound('return roll("1d6+{{@rolled}}");')).toEqual(["rolled"]);
      expect(unbound('roll("1d6"); return roll("1d6+{{@rolled}}");')).toEqual([]);
    });
  });

  it("reports an if without else, which fails when no branch matches", () => {
    const body = 'roll("1d6"); if (@rolled > 6) { return 1; }';
    expect(analysisOf(body).hasIfWithoutElse).toBe(true);
    expect(
      analysisOf('roll("1d6"); if (@rolled > 6) { return 1; } else { return 2; }')
        .hasIfWithoutElse,
    ).toBe(false);
    const definition = new MacroResolver({ macros: { m: { params: [], body } } }).resolve("m")!;
    expect(() =>
      evaluateMacro(definition, { macroId: "m", args: [], raw: "" }, {}),
    ).toThrow("No matching if/elif branch");
  });

  it("fails without throwing or logging the text when the nesting is too deep", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const deep = `${"(".repeat(100_000)}1${")".repeat(100_000)}`;
      expect(
        analyzeMacroDefinition({ params: [], body: `roll("1d6"); return ${deep};` }),
      ).toMatchObject({ success: false });
      expect(
        analyzeMacroDefinition({
          params: [{ name: "n", default: deep }],
          body: 'return roll("1d6");',
        }),
      ).toEqual({ success: false, reason: 'Parameter "n" has an invalid default.' });
      const logged = warn.mock.calls.flat().filter((part) => typeof part === "string");
      expect(Math.max(0, ...logged.map((part) => part.length))).toBeLessThan(300);
    } finally {
      warn.mockRestore();
    }
  });
});
