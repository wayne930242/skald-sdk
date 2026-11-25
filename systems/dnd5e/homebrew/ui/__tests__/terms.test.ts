// @vitest-environment node
import { expect, it } from "vitest";
import mainEn from "@skald/system-dnd5e/data/dnd5e-2024/messages/en.json";
import homebrewEn from "@skald/system-dnd5e/data/dnd5e-2024/messages/homebrew/en.json";
import homebrewZh from "@skald/system-dnd5e/data/dnd5e-2024/messages/homebrew/zh-TW.json";
import { zhWithheld } from "../../../__tests__/zh-withheld";
import { SKILL_FIELDS } from "../../domain/wizard-items";
import { loadClassCatalog } from "../class-context";
import { loadSubclassCatalog } from "../subclass-context";

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
type Field = keyof typeof mainEn.skill;
// The zh-TW terms are written out: the public export swaps withheld zh-TW catalogs for the English text.
const zhSkipped = zhWithheld("messages/zh-TW.json", "messages/homebrew/zh-TW.json");

it("names abilities and skills in the class and subclass editors as the sheet does", async () => {
  const [cls, sub] = await Promise.all([loadClassCatalog([]), loadSubclassCatalog([])]);
  for (const a of ABILITIES) {
    expect(cls.abilityNames[a].en).toBe(mainEn.ability[a]);
    expect(cls.context.abilityNames[a]).toEqual(cls.abilityNames[a]);
    expect(sub.abilityNames[a]).toEqual(cls.abilityNames[a]);
  }
  for (const [id, field] of Object.entries(SKILL_FIELDS)) expect(cls.skillNames[id].en).toBe(mainEn.skill[field as Field]);
  expect(cls.abilityNames.wis.en).toBe("Wisdom");
  expect(cls.skillNames.perception.en).toBe("Perception");
  expect(cls.skillNames["animal-handling"].en).toBe("Animal Handling");
});

it.skipIf(zhSkipped)("uses the sheet's zh-TW terms for Wisdom and Perception", async () => {
  const [cls, sub] = await Promise.all([loadClassCatalog([]), loadSubclassCatalog([])]);
  expect(cls.abilityNames.wis.zh).toBe("睿知");
  expect(cls.context.abilityNames.wis.zh).toBe("睿知");
  expect(sub.abilityNames.wis.zh).toBe("睿知");
  expect(cls.abilityNames.str.zh).toBe("力量");
  expect(cls.skillNames.perception.zh).toBe("感知");
  expect(cls.skillNames.survival.zh).toBe("生存");
});

it("keeps the simple forms' ability and skill options in the sheet's terms", () => {
  for (const option of [homebrewEn.homebrew.option, homebrewZh.homebrew.option] as Record<string, string>[]) {
    for (const id of [...ABILITIES, ...Object.keys(SKILL_FIELDS)]) expect(typeof option[id]).toBe("string");
  }
  const en = homebrewEn.homebrew.option as Record<string, string>;
  for (const a of ABILITIES) expect(en[a]).toBe(mainEn.ability[a]);
  for (const [id, field] of Object.entries(SKILL_FIELDS)) expect(en[id]).toBe(mainEn.skill[field as Field]);
});

it.skipIf(zhSkipped)("keeps the simple forms' zh-TW options in the sheet's terms", () => {
  const zh = homebrewZh.homebrew.option as Record<string, string>;
  expect(zh.wis).toBe("睿知");
  expect(zh.perception).toBe("感知");
  expect(zh["animal-handling"]).toBe("動物馴養");
  expect(zh.survival).toBe("生存");
});
