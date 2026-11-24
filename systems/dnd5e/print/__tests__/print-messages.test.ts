import { describe, expect, it } from "vitest";
import { zhWithheld } from "../../__tests__/zh-withheld";
import IntlMessageFormat from "intl-messageformat";
import en from "@skald/system-dnd5e/data/dnd5e-2024/messages/print/en.json";
import zhTW from "@skald/system-dnd5e/data/dnd5e-2024/messages/print/zh-TW.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) =>
      typeof value === "string" ? [[`${prefix}${key}`, value]] : Object.entries(flatten(value, `${prefix}${key}.`)),
    ),
  );
}

const VALUES = {
  ability: "", amount: 1, base: 1, capacity: 1, carried: 1, coins: 1, count: 1, d20: 2, date: "", dc: 1, faces: 6, feet: 5,
  level: 1, lineage: "", max: 1, name: "", page: 1, pages: 2, species: "", time: "", title: "", total: 1, value: 1,
};

/** The D&D print's lazy catalog (loaded with the print chunk, not the sheet). */
describe("D&D print messages", () => {
  const english = flatten(en.dndPrint as Tree);
  const chinese = flatten(zhTW.dndPrint as Tree);

  it("has the same keys in en and zh-TW", () => {
    expect(Object.keys(chinese).sort()).toEqual(Object.keys(english).sort());
  });

  it.each([["en", english], ["zh-TW", chinese]] as const)("%s: every message parses", (locale, messages) => {
    for (const [key, message] of Object.entries(messages)) {
      expect(() => new IntlMessageFormat(message, locale).format(VALUES), key).not.toThrow();
    }
  });

  it.skipIf(zhWithheld("messages/print/zh-TW.json"))("uses the glossary's terms in zh-TW", () => {
    expect(chinese["regions.features"]).toBe("職業特性");
    expect(chinese["regions.speciesTraits"]).toBe("種族特性");
    expect(chinese["continued"]).toBe("{title}（續）");
    expect(chinese["goto"]).toBe("→ 見「{title}」");
    expect(chinese["texts.packMissing"]).toContain("此內容包尚未載入於此裝置");
    expect(chinese["hitDice.title"]).toBe("生命骰");
    expect(chinese["combat.passive"]).toBe("被動睿知（感知）");
  });
});
