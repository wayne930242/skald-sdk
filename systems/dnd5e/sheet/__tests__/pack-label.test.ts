import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@skald/system-dnd5e/data/dnd5e-2024/messages/play/en.json";
import zh from "@skald/system-dnd5e/data/dnd5e-2024/messages/play/zh-TW.json";
import { zhWithheld } from "../../__tests__/zh-withheld";
import { packLabel } from "../pack-label";

/** The public export ships the play messages' zh-TW file as an English fallback. */
const zhSkipped = zhWithheld("messages/play/zh-TW.json");

/** The reference badge's labels as `ReferenceIntl` merges them into `referenceUi`. */
function tUi(locale: "en" | "zh-TW", packNames: Record<string, string> = {}) {
  const play = locale === "en" ? en : zh;
  const messages = {
    referenceUi: {
      packFrom: locale === "en" ? "Pack: {name}" : "內容包：{name}",
      homebrewFrom: play.homebrewFrom,
      gmHomebrew: play.gmHomebrew,
      gmHomebrewFrom: play.gmHomebrewFrom,
      packNames,
    },
  };
  return createTranslator({ locale, messages, namespace: "referenceUi" }) as unknown as Parameters<typeof packLabel>[0];
}

describe("packLabel", () => {
  it("names a table's shared GM homebrew, with the sharer when the host names one", () => {
    expect(packLabel(tUi("en"), "table/T/owner")).toBe("GM's homebrew");
    expect(packLabel(tUi("en", { "table/T/aide": "Ade" }), "table/T/aide")).toBe("GM's homebrew: Ade");
  });

  it.skipIf(zhSkipped)("says 「GM 的自製內容」 in zh-TW", () => {
    expect(packLabel(tUi("zh-TW"), "table/T/owner")).toBe("GM 的自製內容");
    expect(packLabel(tUi("zh-TW", { "table/T/aide": "阿德" }), "table/T/aide")).toBe("GM 的自製內容：阿德");
    expect(packLabel(tUi("zh-TW", { "homebrew/p1": "我的包" }), "homebrew/p1")).toBe("自製：我的包");
  });

  it("keeps the badges of other packs", () => {
    expect(packLabel(tUi("en", { "homebrew/p1": "My pack" }), "homebrew/p1")).toBe("Homebrew: My pack");
    expect(packLabel(tUi("en"), "drive-pack")).toBe("Pack: drive-pack");
    expect(packLabel(tUi("en"), undefined)).toBeUndefined();
  });
});
