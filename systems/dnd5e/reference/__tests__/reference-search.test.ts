import { describe, expect, it } from "vitest";
import { groupedReferenceSearch, type ReferenceSearchSource } from "../search";

const source: ReferenceSearchSource = {
  names: {
    spell: { suffix: "Quailfire", word: "Bundle of Fire", prefix: "Firebrand", exact: "火" },
    action: { dash: "火行" },
    condition: { tied: "火縛" },
    status: { dazed: "火暈" },
    rule: { fall: "火墜" },
    skill: { sense: "火察" },
    table: { odds: "火表" },
    chapter: { play: "火章" },
    item: { cup: "火杯" },
    baseItem: { rod: "火杖" },
    creature: { bird: "火鳥" },
    species: { winged: "火翼" },
  },
  englishNames: { spell: { exact: "Fire", alias: "Frigid Wind" } },
  overlayNames: [{ ref: "spell:alias", name: "Fire" }, { ref: "spell:word", name: "Flying Fish" }],
};

const refs = (groups: ReturnType<typeof groupedReferenceSearch>) => groups.flatMap(({ hits }) => hits.map(({ ref }) => ref));

describe("reference search", () => {
  it("sorts each kind by its strongest name match: exact > prefix > word-start > substring", () => {
    expect(refs(groupedReferenceSearch(source, "  FIRE  ", "spell", "zh-TW"))).toEqual([
      "spell:alias", "spell:exact", "spell:prefix", "spell:word", "spell:suffix",
    ]);
  });

  it("uses either locale or overlay, does not duplicate entries, and shows the matched alias", () => {
    const [{ hits }] = groupedReferenceSearch(source, "fire", "spell", "zh-TW");
    expect(hits.find((hit) => hit.ref === "spell:alias")).toMatchObject({ name: "Fire" });
    expect(hits.find((hit) => hit.ref === "spell:exact")).toMatchObject({ name: "火", matchedName: "Fire" });
    expect(refs(groupedReferenceSearch(source, "魚", "all", "zh-TW"))).toEqual([]);
    expect(refs(groupedReferenceSearch(source, "flying", "all", "zh-TW"))).toEqual(["spell:word"]);
  });

  it("returns every matching kind and supports both group and exact-kind filters", () => {
    const kinds = new Set(groupedReferenceSearch(source, "火", "rules", "zh-TW").map(({ kind }) => kind));
    expect(kinds).toEqual(new Set(["action", "condition", "status", "rule", "skill", "table", "chapter"]));
    expect(refs(groupedReferenceSearch(source, "火", "spells", "zh-TW"))).toEqual(["spell:exact"]);
    expect(new Set(refs(groupedReferenceSearch(source, "火", "items", "zh-TW")))).toEqual(new Set(["item:cup", "baseItem:rod"]));
    expect(refs(groupedReferenceSearch(source, "火", "creatures", "zh-TW"))).toEqual(["creature:bird"]);
    expect(refs(groupedReferenceSearch(source, "火", "options", "zh-TW"))).toEqual(["species:winged"]);
    expect(refs(groupedReferenceSearch(source, "", "condition", "zh-TW"))).toEqual(["condition:tied"]);
    expect(refs(groupedReferenceSearch(source, "", "all", "zh-TW"))).toEqual([]);
  });
});
