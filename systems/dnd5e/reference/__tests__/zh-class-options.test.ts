import { describe, expect, it } from "vitest";
import { zhWithheld } from "../../__tests__/zh-withheld";
import { entriesToText } from "../entries-to-text";
import { loadOverlay } from "../load-corpus";

/** UAT A2-04: the zh-TW Divine Order and Primal Order texts name their training in Chinese. */
describe("zh-TW class option texts (T4f)", () => {
  it.for([
    ["保護者", "classFeature-cleric", "classFeature:cleric/protector-l1", ["軍用武器", "重甲"]],
    ["衛士", "classFeature-druid", "classFeature:druid/warden-l1", ["軍用武器", "中型護甲"]],
  ] as const)("%s: no English training names", async ([, part, key, terms], { skip }) => {
    skip(zhWithheld(`corpus/zh-TW/${part}.json`), "zh-TW text withheld");
    const overlay = await loadOverlay("zh-TW", part);
    const entry = overlay?.[key] as { entries?: unknown[] } | undefined;
    expect(entry?.entries).toBeDefined();
    const body = entriesToText(entry!.entries!, { label: () => "" });
    for (const term of terms) expect(body).toContain(term);
    expect(body).not.toMatch(/[A-Za-z]/);
  });
});
