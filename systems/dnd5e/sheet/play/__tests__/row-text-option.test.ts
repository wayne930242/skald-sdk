import { describe, expect, it } from "vitest";
import { printName, type PrintNaming } from "../../../print/print-reference";
import { OPTION_ROW_MESSAGE } from "../../level-up/option-row";
import type { ReferenceContextValue } from "../../use-reference-context";
import { loadSnapshotLabels } from "../snapshot-labels";
import { catalogName, displayName } from "../row-text";

/** A named choice's pick on a built-in feature row (UAT F005): "Feature: Option" in the viewer's locale. */

// Made-up names; the pattern stands for the viewer's catalog (a full-width colon, as zh-TW writes it).
const names = { subclassFeature: { "made-up/sub/prey-l3": "虛構特性" } } as PrintNaming["names"];
const naming: PrintNaming = {
  names,
  englishNames: {},
  nameOf: (ref) => (ref === "subclassFeature:made-up/sub/prey-l3" ? "虛構特性" : ref),
  token: (value) => (value === OPTION_ROW_MESSAGE ? "{feature}：{option}" : String(value)),
};
const context = naming as unknown as ReferenceContextValue;
const row = { id: "f1", name: "Prey: Slayer", ref: "subclassFeature:made-up/sub/prey-l3", origin: "srd" };

describe("a feature row with a picked option", () => {
  it("shows the catalog name with the pick, in the play view and the print alike", () => {
    const picked = { ...row, option: "Slayer", optionName: "虛構選項" };
    expect(displayName(context, picked)).toBe("虛構特性：虛構選項");
    expect(catalogName(context, picked)).toBe("虛構特性：虛構選項");
    expect(printName(naming, picked)).toBe("虛構特性：虛構選項");
    // Only the stable id: it names the option.
    expect(displayName(context, { ...row, option: "Slayer" })).toBe("虛構特性：Slayer");
    expect(printName(naming, { ...row, option: "Slayer" })).toBe("虛構特性：Slayer");
  });

  it("names a built-in choice by its stable id in English after a Chinese level-up", async () => {
    const labels = await loadSnapshotLabels("en");
    const id = "ranger/hunter/hunters-prey-l3";
    const en = { ...naming, locale: "en", names: { subclassFeature: { [id]: "Hunter's Prey" } }, nameOf: () => "Hunter's Prey", token: () => "{feature}: {option}" };
    const picked = { ref: `subclassFeature:${id}`, option: "Colossus Slayer", optionName: "巨獸殺手" };
    expect(displayName(en as unknown as ReferenceContextValue, picked, labels)).toBe("Hunter's Prey: Colossus Slayer");
    expect(printName(en, picked, labels)).toBe("Hunter's Prey: Colossus Slayer");
  });

  it("a row without a pick keeps the catalog name; a pack row its own name", () => {
    expect(displayName(context, row)).toBe("虛構特性");
    expect(printName(naming, row)).toBe("虛構特性");
    const pack = { ...row, origin: "pack", option: "Slayer", optionName: "Slayer" };
    expect(displayName(context, pack)).toBe("Prey: Slayer");
    expect(printName(naming, pack)).toBe("Prey: Slayer");
  });

  it("falls back to an ASCII colon without the pattern in the catalog", () => {
    const bare = { ...naming, token: String };
    expect(printName(bare, { ...row, option: "Slayer" })).toBe("虛構特性: Slayer");
    expect(displayName(bare as unknown as ReferenceContextValue, { ...row, option: "Slayer" })).toBe("虛構特性: Slayer");
  });
});
