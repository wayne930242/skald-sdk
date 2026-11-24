import { beforeAll, describe, expect, it } from "vitest";
import { zhWithheld } from "../../__tests__/zh-withheld";
import IntlMessageFormat from "intl-messageformat";
import en from "@skald/system-dnd5e/data/dnd5e-2024/messages/print/en.json";
import zhTW from "@skald/system-dnd5e/data/dnd5e-2024/messages/print/zh-TW.json";
import { loadEnglishCorpus } from "../../reference/load-corpus";
import { componentsText, durationText, spellStats, type SpellStatLabels } from "../spell-stats";

function labels(locale: "en" | "zh-TW"): SpellStatLabels {
  const catalog = (locale === "en" ? en : zhTW).dndPrint;
  return {
    school: (code) => (catalog.school as Record<string, string>)[code] ?? null,
    duration: (key, values) =>
      String(new IntlMessageFormat((catalog.duration as Record<string, string>)[key], locale).format(values)),
  };
}

type Part = Record<string, { meta: Record<string, unknown> }>;
const meta = (part: Part, ref: string) => part[ref].meta;

// Through the loader: plugin code (tests included) never names the corpus path (budgets.test.ts).
let spellOne: Part;
let spellThree: Part;
beforeAll(async () => {
  spellOne = (await loadEnglishCorpus("spell-1")) as unknown as Part;
  spellThree = (await loadEnglishCorpus("spell-3")) as unknown as Part;
});

describe("spell stat line", () => {
  it.skipIf(zhWithheld("messages/print/zh-TW.json"))("durations: instant, timed, Concentration, until dispelled", () => {
    expect(durationText([{ type: "instant" }], labels("en"))).toBe("Instantaneous");
    expect(durationText([{ type: "timed", duration: { type: "hour", amount: 8 } }], labels("en"))).toBe("8 hours");
    expect(durationText([{ type: "timed", duration: { type: "minute", amount: 1 }, concentration: true }], labels("en"))).toBe("Concentration, up to 1 minute");
    expect(durationText([{ type: "timed", duration: { type: "minute", amount: 1 }, concentration: true }], labels("zh-TW"))).toBe("專注，至多 1 分鐘");
    expect(durationText([{ type: "permanent", ends: ["dispel", "trigger"] }], labels("zh-TW"))).toBe("直到被解除或觸發");
    expect(durationText(undefined, labels("en"))).toBe("");
  });

  it("components with the material, or the row's M flag without meta", () => {
    expect(componentsText(meta(spellOne, "spell:alarm").components, {})).toBe("V, S, M (a bell and silver wire)");
    expect(componentsText(undefined, { material: true })).toBe("M");
    expect(componentsText(undefined, {})).toBe("");
  });

  it.skipIf(zhWithheld("messages/print/zh-TW.json"))("Fireball and Alarm from the corpus meta", () => {
    const line = { castingTime: "Action", range: "150 feet" };
    expect(spellStats(meta(spellThree, "spell:fireball"), {}, line, labels("en"))).toEqual({
      school: "Evocation",
      castingTime: "Action",
      range: "150 feet",
      components: "V, S, M (a ball of bat guano and sulfur)",
      duration: "Instantaneous",
    });
    expect(spellStats(meta(spellOne, "spell:alarm"), {}, line, labels("zh-TW"))).toMatchObject({ school: "防護", duration: "8 小時" });
    expect(spellStats(null, { material: true }, line, labels("zh-TW"))).toEqual({ school: "", castingTime: "Action", range: "150 feet", components: "M", duration: "" });
  });
});
