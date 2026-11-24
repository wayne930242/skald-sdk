import { describe, it, expect } from "vitest";
import {
  applyFieldWrites,
  numberAtPath,
  readResourceValue,
  setAtPath,
  spendResource,
  tickSkillImproved,
} from "../roll-effects";

const LUCK_RULE = { resource: "luck.current", fallback: "luck.value" } as const;

describe("numberAtPath / setAtPath", () => {
  it("reads a finite number at a dotted path and gives undefined for anything else", () => {
    const data = { luck: { current: 40, text: "x", nan: Number.NaN }, name: "Ada", list: [1], top: 3 };
    expect(numberAtPath(data, "luck.current")).toBe(40);
    expect(numberAtPath(data, "top")).toBe(3);
    expect(numberAtPath(data, "luck.missing")).toBeUndefined();
    expect(numberAtPath(data, "luck.text")).toBeUndefined();
    expect(numberAtPath(data, "luck.nan")).toBeUndefined();
    expect(numberAtPath(data, "name.first")).toBeUndefined();
    expect(numberAtPath(data, "missing.deeper")).toBeUndefined();
    expect(numberAtPath(data, "list.0")).toBeUndefined();
  });

  it("sets along a path without touching the input, creating missing objects", () => {
    const data = { luck: { current: 40, max: 99 }, name: "Ada" };
    const next = setAtPath(data, "luck.current", 35);
    expect(next).toEqual({ luck: { current: 35, max: 99 }, name: "Ada" });
    expect(data.luck.current).toBe(40);

    expect(setAtPath({}, "luck.current", 7)).toEqual({ luck: { current: 7 } });
    // an existing non-object on the way is replaced by an object, as the web's setValueByPath does
    expect(setAtPath({ luck: 5 }, "luck.current", 7)).toEqual({ luck: { current: 7 } });
  });
});

describe("readResourceValue", () => {
  it("reads the declared path, then the fallback for a character that never stored it", () => {
    expect(readResourceValue({ luck: { current: 12, value: 50 } }, LUCK_RULE)).toBe(12);
    expect(readResourceValue({ luck: { value: 50 } }, LUCK_RULE)).toBe(50);
  });

  it("treats a stored 0 as 0, not as missing", () => {
    expect(readResourceValue({ luck: { current: 0, value: 50 } }, LUCK_RULE)).toBe(0);
  });

  it("is undefined when neither path holds a finite number", () => {
    expect(readResourceValue({ luck: { current: "x" } }, LUCK_RULE)).toBeUndefined();
    expect(readResourceValue({ luck: { current: Number.NaN } }, LUCK_RULE)).toBeUndefined();
    expect(readResourceValue({}, LUCK_RULE)).toBeUndefined();
    expect(readResourceValue({ luck: { value: 5 } }, { resource: "luck.current" })).toBeUndefined();
  });
});

describe("spendResource", () => {
  it("subtracts the cost at the declared path and reports before and after", () => {
    const result = spendResource({ luck: { current: 50, max: 99 } }, LUCK_RULE, 12);
    expect(result).toEqual({
      ok: true,
      data: { luck: { current: 38, max: 99 } },
      before: 50,
      after: 38,
    });
  });

  it("starts from the fallback and writes the declared path (a new character shows its start value)", () => {
    const result = spendResource({ luck: { value: 60 } }, LUCK_RULE, 10);
    expect(result).toEqual({ ok: true, data: { luck: { value: 60, current: 50 } }, before: 60, after: 50 });
  });

  it("can spend the whole pool", () => {
    const result = spendResource({ luck: { current: 7 } }, LUCK_RULE, 7);
    expect(result).toMatchObject({ ok: true, before: 7, after: 0 });
  });

  it("refuses to go below zero and says how much there is", () => {
    expect(spendResource({ luck: { current: 6 } }, LUCK_RULE, 7)).toEqual({
      ok: false,
      reason: "insufficient",
      available: 6,
    });
  });

  it("refuses when the resource cannot be read", () => {
    expect(spendResource({ luck: {} }, LUCK_RULE, 1)).toEqual({ ok: false, reason: "unreadable" });
  });

  it("refuses a cost that is not a positive whole number", () => {
    for (const cost of [0, -3, 1.5, Number.NaN]) {
      expect(spendResource({ luck: { current: 10 } }, LUCK_RULE, cost)).toEqual({
        ok: false,
        reason: "bad-cost",
      });
    }
  });

  it("matches the web's own update, finiteOr(prev, stored) - cost, on the same data", () => {
    const finiteOr = (value: unknown, fallback: number) =>
      typeof value === "number" && Number.isFinite(value) ? value : fallback;
    for (const data of [{ luck: { current: 31 } }, { luck: { value: 31 } }]) {
      const stored = readResourceValue(data, LUCK_RULE) as number;
      const webNext = setAtPath(data, "luck.current", finiteOr(numberAtPath(data, "luck.current"), stored) - 9);
      expect(spendResource(data, LUCK_RULE, 9)).toMatchObject({ ok: true, data: webNext });
    }
  });
});

describe("tickSkillImproved", () => {
  const skills = [
    { id: "spot_hidden", name: "spot_hidden", value: 25, improved: false },
    { id: "dodge", name: "dodge", value: 40, improved: true },
    { id: "fixed", name: "fixed", value: 10, improved: false, canImprove: false },
  ];

  it("flips improved on the one item and leaves the rest of the data alone", () => {
    const data = { skills, name: "Ada" };
    const result = tickSkillImproved(data, { fieldId: "skills", itemId: "spot_hidden" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe("Ada");
    expect(result.data.skills).toEqual([
      { id: "spot_hidden", name: "spot_hidden", value: 25, improved: true },
      skills[1],
      skills[2],
    ]);
    expect(skills[0].improved).toBe(false);
  });

  it("does not tick twice, nor a skill that cannot improve, nor one that is not there", () => {
    expect(tickSkillImproved({ skills }, { fieldId: "skills", itemId: "dodge" })).toEqual({
      ok: false,
      reason: "already",
    });
    expect(tickSkillImproved({ skills }, { fieldId: "skills", itemId: "fixed" })).toEqual({
      ok: false,
      reason: "not-improvable",
    });
    expect(tickSkillImproved({ skills }, { fieldId: "skills", itemId: "nope" })).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(tickSkillImproved({}, { fieldId: "skills", itemId: "dodge" })).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("writes JSON-clean items (no undefined-valued keys)", () => {
    const data = { skills: [{ id: "a", value: 1, improved: false, note: undefined }] };
    const result = tickSkillImproved(data, { fieldId: "skills", itemId: "a" });
    expect(result.ok && JSON.stringify(result.data)).toBe(
      JSON.stringify({ skills: [{ id: "a", value: 1, improved: true }] }),
    );
    expect(result.ok && Object.hasOwn((result.data.skills as object[])[0], "note")).toBe(false);
  });
});

describe("applyFieldWrites", () => {
  it("sets each resolved path to its value", () => {
    const result = applyFieldWrites(
      { hp: { current: 10, max: 12 }, status: "ok", str: 50 },
      [
        { path: ["hp", "current"], value: 7 },
        { path: ["status"], value: "dazed" },
      ],
    );
    expect(result).toEqual({
      ok: true,
      data: { hp: { current: 7, max: 12 }, status: "dazed", str: 50 },
    });
  });

  it("applies in order, so a later write to the same place wins", () => {
    const result = applyFieldWrites({ hp: { current: 10 } }, [
      { path: ["hp", "current"], value: 7 },
      { path: ["hp", "current"], value: 3 },
    ]);
    expect(result).toEqual({ ok: true, data: { hp: { current: 3 } } });
  });

  it("is all or nothing: a number into a string field (or the reverse) changes nothing", () => {
    const data = { status: "ok", str: 50 };
    expect(applyFieldWrites(data, [{ path: ["str"], value: 60 }, { path: ["status"], value: 5 }])).toEqual({
      ok: false,
      reason: "type-mismatch",
      path: ["status"],
    });
    expect(applyFieldWrites(data, [{ path: ["str"], value: "strong" }])).toEqual({
      ok: false,
      reason: "type-mismatch",
      path: ["str"],
    });
  });

  it("refuses a target that is not in the data, and a non-finite number", () => {
    expect(applyFieldWrites({ str: 50 }, [{ path: ["dex"], value: 5 }])).toEqual({
      ok: false,
      reason: "missing",
      path: ["dex"],
    });
    expect(applyFieldWrites({ str: 50 }, [{ path: ["str"], value: Number.POSITIVE_INFINITY }])).toEqual({
      ok: false,
      reason: "type-mismatch",
      path: ["str"],
    });
  });

  it("an empty list is a no-op success", () => {
    expect(applyFieldWrites({ a: 1 }, [])).toEqual({ ok: true, data: { a: 1 } });
  });
});
