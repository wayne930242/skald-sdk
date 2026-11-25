import { describe, expect, it } from "vitest";
import type { ReferenceContextValue } from "../../use-reference-context";
import { spellLine } from "../row-text";

/** B-014: a pack spell row reads its casting time and range in the viewer's locale. */
const zh: Record<string, string> = {
  "{{i18n:spellCastingTime.1-action}}": "1 個動作",
  "{{i18n:spellRange.point-60-feet}}": "60呎",
};

function context(gameSpells: Array<{ id: string; castingTime?: string; range?: string }> = []): ReferenceContextValue {
  return {
    gameSpells: new Map(gameSpells.map((spell) => [spell.id, { ...spell, ref: `spell:${spell.id}`, level: 0, classes: [] }])),
    token: (value: unknown) => (typeof value === "string" ? zh[value] ?? value : ""),
  } as unknown as ReferenceContextValue;
}

describe("spell row line (B-014)", () => {
  it("keeps the copied time and range until the player updates a stamped spell", () => {
    const loaded = context([{ id: "bolt", castingTime: "new time", range: "new range" }]);
    expect(spellLine(loaded, { ref: "spell:bolt", origin: "custom", homebrewPack: "p", homebrewItem: "i", homebrewRev: 1, castingTime: "old time", range: "old range" })).toBe("old time · old range");
  });

  it("reads the message tokens a pack row saved", () => {
    const row = { ref: "spell:sample-bolt", origin: "pack", castingTime: "{{i18n:spellCastingTime.1-action}}", range: "{{i18n:spellRange.point-60-feet}}" };
    expect(spellLine(context(), row)).toBe("1 個動作 · 60呎");
  });

  it("reads a loaded pack's spell catalog for a row saved with English text", () => {
    const row = { ref: "spell:sample-bolt", origin: "pack", castingTime: "1 action", range: "60 feet" };
    const loaded = context([{ id: "sample-bolt", castingTime: "{{i18n:spellCastingTime.1-action}}", range: "{{i18n:spellRange.point-60-feet}}" }]);
    expect(spellLine(loaded, row)).toBe("1 個動作 · 60呎");
    // Without the pack on this device the saved text is all there is.
    expect(spellLine(context(), row)).toBe("1 action · 60 feet");
  });
});

describe("pack spell catalog on the sheet (B-014)", () => {
  it("uses the built-in token when this locale has a message for the code, else the pack's words", async () => {
    const { packSpells } = await import("../../use-reference-context");
    const pack = {
      wizard: {
        spells: [
          { id: "sample-bolt", ref: "spell:sample-bolt", level: 0, castingTimeCode: "1-action", rangeCode: "point-60-feet", w: { castingTime: "1 action", range: "60 feet" } },
          { id: "sample-ring", ref: "spell:sample-ring", level: 0, castingTimeCode: "1-action", rangeCode: "emanation-5-feet", w: { castingTime: "1 action", range: "5 feet" } },
        ],
      },
    } as never;
    const known = new Set(["spellCastingTime.1-action", "spellRange.point-60-feet"]);
    const [bolt, ring] = packSpells(pack, (key) => known.has(key));
    expect(bolt).toMatchObject({ castingTime: "{{i18n:spellCastingTime.1-action}}", range: "{{i18n:spellRange.point-60-feet}}" });
    expect(ring).toMatchObject({ castingTime: "{{i18n:spellCastingTime.1-action}}", range: "5 feet" });
  });
});
