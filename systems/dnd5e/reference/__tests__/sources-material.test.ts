import { describe, expect, it } from "vitest";
import { localizeEntry } from "../sources";

const alarm = {
  ref: "spell:alarm",
  kind: "spell",
  id: "alarm",
  name: "Alarm",
  entries: ["You set an alarm."],
  meta: { level: 1, components: { v: true, s: true, m: true, mText: "a bell and silver wire" } },
} as const;

describe("localizeEntry material component", () => {
  it("shows the material component in the overlay's language", () => {
    const zh = localizeEntry(structuredClone(alarm) as never, { name: "警報術", material: "一個鈴鐺和一段銀線" }, "zh-TW", "srd");
    expect((zh.meta.components as { mText: string }).mText).toBe("一個鈴鐺和一段銀線");
  });

  it("keeps the English text when the overlay has none", () => {
    const en = localizeEntry(structuredClone(alarm) as never, undefined, "en", "srd");
    expect((en.meta.components as { mText: string }).mText).toBe("a bell and silver wire");
  });
});
