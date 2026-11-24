import { describe, expect, it } from "vitest";
import { normalizeInlineHead } from "../inline-head";

/** Snapshots saved before B-001 read with today's heads (PT2R-F005); nothing is written back. */
describe("normalizeInlineHead", () => {
  it.each([
    ["戲法. 自選三道法師戲法。", "戲法：自選三道法師戲法。"],
    ["• 戲法. 自選三道", "• 戲法：自選三道"],
    ["燃燒【危害】. 你受到火焰傷害。", "燃燒【危害】：你受到火焰傷害。"],
    ["準備 1 環以上法術. 你要準備", "準備 1 環以上法術：你要準備"],
    ["屬性值：. 力量、智力", "屬性值：力量、智力"],
    ["專長： 警覺", "專長：警覺"],
    ["為何？ 因為。", "為何？因為。"],
  ])("%s → %s", (saved, read) => {
    expect(normalizeInlineHead(saved)).toBe(read);
  });

  it.each([
    "戲法：自選三道法師戲法。",
    "Cantrips. Choose three.",
    "Feat: Alert",
    "你可施放此法術。之後的回合",
    "你移動。然後 X. 再說",
    "選擇兩個塑能學派法師法術（Wizard spells from the Evocation school）。",
  ])("leaves %s as it is", (line) => {
    expect(normalizeInlineHead(line)).toBe(line);
  });
});
