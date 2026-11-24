import { describe, expect, it } from "vitest";
import { createRefResolver, type NamesCatalog } from "../sources";
import { parseTags, splitRef, type TextToken } from "../tags";
import { entriesToText } from "../entries-to-text";

/** The T2b tag policy (plan §2.5): candidate refs per tag, resolved built-in first, then pack. */

function only(input: string): TextToken {
  const tokens = parseTags(input);
  expect(tokens, input).toHaveLength(1);
  return tokens[0];
}

const builtin: NamesCatalog = {
  rule: { blindsight: "Blindsight", burning: "Burning" },
  creature: { owl: "Owl", "giant-insect": "Giant Insect" },
  table: { skills: "Skills", "character-advancement": "Character Advancement" },
  item: { "bag-of-holding": "Bag of Holding", rope: "Rope" },
  chapter: {
    "srd/playing-the-game": "Playing the Game",
    "srd/character-creation": "Character Creation",
    "srd/spells": "Spells",
  },
};

describe("T2b tag policy", () => {
  it("links senses and hazards to their rules", () => {
    expect(only("{@sense blindsight|XPHB}")).toEqual({ type: "link", refs: ["rule:blindsight"], text: "blindsight" });
    expect(only("{@hazard Burning|XPHB}")).toEqual({ type: "link", refs: ["rule:burning"], text: "Burning" });
    const resolve = createRefResolver(builtin);
    expect(resolve("rule:blindsight")).toBe("rule:blindsight");
  });

  it("links a creature to the built-in entry, or to a pack creature when the pack names it", () => {
    expect(only("{@creature Owl|XMM}")).toEqual({ type: "link", refs: ["creature:owl"], text: "Owl" });
    expect(only("{@creature giant insect|XPHB|giant insects}")).toEqual({ type: "link", refs: ["creature:giant-insect"], text: "giant insects" });
    const token = only("{@creature Sample Mire Lurker|XMM}");
    expect(token).toEqual({ type: "link", refs: ["creature:sample-mire-lurker"], text: "Sample Mire Lurker" });
    expect(createRefResolver(builtin)("creature:sample-mire-lurker")).toBeNull();
    const withPack: NamesCatalog = { ...builtin, creature: { ...builtin.creature, "sample-mire-lurker": "Sample Mire Lurker" } };
    expect(createRefResolver(withPack)("creature:sample-mire-lurker")).toBe("creature:sample-mire-lurker");
  });

  it("links a table by its caption, the part after `; ` when the tag names a section", () => {
    expect(only("{@table Character Advancement|XPHB}")).toEqual({ type: "link", refs: ["table:character-advancement"], text: "Character Advancement" });
    expect(only("{@table Skill List; Skills|XPHB|skills}")).toEqual({ type: "link", refs: ["table:skills", "table:skill-list-skills"], text: "skills" });
  });

  it("links an XDMG magic item to its built-in item entry", () => {
    const token = only("{@item Bag of Holding|XDMG}");
    expect(token).toMatchObject({ type: "link", text: "Bag of Holding" });
    const refs = (token as { refs: string[] }).refs;
    expect(refs).toContain("item:bag-of-holding");
    expect(refs.map(createRefResolver(builtin)).find(Boolean)).toBe("item:bag-of-holding");
  });

  it("links a book to the pack's XPHB chapter, else the SRD chapter, and shows its own text (F008)", () => {
    const token = only("{@book chapter 2|XPHB|2}");
    expect(token).toEqual({
      type: "link",
      refs: ["book:xphb/2", "chapter:srd/character-creation"],
      text: "chapter 2",
    });
    const header = only("{@book area of specialization|XPHB|1|Skill List}");
    expect(header).toEqual({
      type: "link",
      refs: [
        "book:xphb/1/skill-list",
        "book:xphb/1",
        "chapter:srd/playing-the-game/skill-list",
        "chapter:srd/playing-the-game",
      ],
      text: "area of specialization",
    });
    const resolve = createRefResolver(builtin);
    expect((token as { refs: string[] }).refs.map(resolve).find(Boolean)).toBe("chapter:srd/character-creation");
    // Other sources show their text. A chapter with no SRD equivalent can still link to the pack.
    expect(only("{@book Sample Guide|XDMG|3}")).toEqual({ type: "link", refs: ["book:xdmg/3"], text: "Sample Guide" });
    expect(resolve("book:xdmg/3")).toBeNull();
    expect(only("{@book sample appendix|XPHB|12}")).toEqual({ type: "link", refs: ["book:xphb/12"], text: "sample appendix" });
  });

  it("shows adventure and quickref tags by their own text, never a bare chapter number (F008)", () => {
    expect(only("{@adventure the sample adventure|SAMPLE|4}")).toEqual({ type: "plain", text: "the sample adventure" });
    expect(only("{@quickref difficult terrain||3}")).toEqual({ type: "plain", text: "difficult terrain" });
  });

  it("knows the T2b kinds", () => {
    for (const ref of ["creature:owl", "table:skills", "chapter:srd/playing-the-game"]) expect(splitRef(ref), ref).not.toBeNull();
  });

  it("reads the stat block rule tags as label tokens, so a zh view can localize them (coordinator 6)", () => {
    expect(only("{@hitYourSpellAttack Bonus equals your spell attack modifier}")).toMatchObject({ type: "label", key: "spellAttack", text: "Bonus equals your spell attack modifier" });
    expect(only("{@actSaveFail 2}")).toMatchObject({ type: "label", key: "saveFailNth", value: "2", text: "Second Failure:" });
    expect(only("{@actSaveFailBy 5}")).toMatchObject({ type: "label", key: "saveFailBy", value: "5", text: "Failure by 5 or More:" });
    expect(only("{@actSaveSuccessOrFail}")).toMatchObject({ type: "label", key: "saveSuccessOrFail", text: "Failure or Success:" });
    expect(only("{@hom}")).toMatchObject({ type: "label", key: "hitOrMiss", text: "Hit or Miss:" });
    expect(only("{@atkr m,r}")).toMatchObject({ type: "label", key: "attack", value: "mr" });
    // Without a resolver (snapshot text, tier A only) the English text stays as before.
    expect(entriesToText(["{@actSaveFail 1} Prone."])).toBe("First Failure: Prone.");
  });

  it("gives include and refList nodes no snapshot text", () => {
    expect(entriesToText(["Before.", { type: "include", ref: "rule:burning" }, { type: "refList", kind: "creature" }, "After."])).toBe("Before.\nAfter.");
  });

});
