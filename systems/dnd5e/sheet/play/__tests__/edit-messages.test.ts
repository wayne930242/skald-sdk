import { describe, expect, it } from "vitest";
import { zhWithheld } from "../../../__tests__/zh-withheld";
import en from "@skald/system-dnd5e/data/dnd5e-2024/messages/edit/en.json";
import zh from "@skald/system-dnd5e/data/dnd5e-2024/messages/edit/zh-TW.json";
import tabsEn from "@skald/system-dnd5e/data/dnd5e-2024/messages/play-tabs/en.json";
import tabsZh from "@skald/system-dnd5e/data/dnd5e-2024/messages/play-tabs/zh-TW.json";
import playEn from "@skald/system-dnd5e/data/dnd5e-2024/messages/play/en.json";
import playZh from "@skald/system-dnd5e/data/dnd5e-2024/messages/play/zh-TW.json";
import { loadEditMessages } from "../edit-messages";

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): Array<[string, string]> {
  return Object.entries(tree).flatMap(([key, value]) => (typeof value === "string" ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`)));
}

const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe("the lazy play catalogs (messages/edit, messages/play-tabs, plan-uat2 §4)", () => {
  it.each([
    ["edit", en, zh, "messages/edit/zh-TW.json"],
    ["play-tabs", tabsEn, tabsZh, "messages/play-tabs/zh-TW.json"],
  ] as const)("%s has the same keys and placeholders in both locales, and zh-TW in Chinese", (_, english, chinese, file) => {
    // Where the zh-TW file is withheld it holds the English text: keys and placeholders still match.
    const chineseText = !zhWithheld(file);
    const zhLeaves = new Map(leaves(chinese as Tree));
    expect([...zhLeaves.keys()].sort()).toEqual(leaves(english as Tree).map(([key]) => key).sort());
    for (const [key, value] of leaves(english as Tree)) {
      const local = zhLeaves.get(key)!;
      expect(placeholders(local), key).toEqual(placeholders(value));
      // A label made only of placeholders (`{name}：{state}`) has no words to translate.
      if (chineseText && value.replace(/\{\w+\}/g, "").replace(/[\s:：·]/g, "")) expect(local, key).toMatch(/\p{Script=Han}/u);
    }
  });

  it("moves play labels out of the first load without overlap", () => {
    const eager = new Set(leaves(playEn as Tree).map(([key]) => key));
    expect(leaves(tabsEn as Tree).filter(([key]) => eager.has(key))).toEqual([]);
    expect(leaves(playZh as Tree).map(([key]) => key).sort()).toEqual([...eager].sort());
  });

  it("loads once per locale, marked for React's use once resolved", async () => {
    const first = loadEditMessages("zh-TW");
    expect(loadEditMessages("zh-TW")).toBe(first);
    expect(await first).toEqual({ edit: zh, play: tabsZh });
    expect(first).toMatchObject({ status: "fulfilled" });
    expect(await loadEditMessages("fr")).toEqual({ edit: en, play: tabsEn });
  });
});
