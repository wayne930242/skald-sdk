// @vitest-environment node
import { beforeAll, expect, it } from "vitest";
import { classCodec } from "../../domain/class";
import { subclassCodec } from "../../domain/subclass";
import { fillSpaced } from "../../domain/spacing";
import { classContext, loadClassCorpus } from "./class-fixtures";
import { sampleForm, subclassContext } from "./subclass-fixtures";

beforeAll(async () => {
  await loadClassCorpus();
});

it("sets a name with Latin letters or digits off from CJK text, and leaves CJK names and punctuation alone", () => {
  expect(fillSpaced("選一個{class}子職", { class: "UAT2-秘紋術士" })).toBe("選一個 UAT2-秘紋術士 子職");
  expect(fillSpaced("選一個{class}子職", { class: "秘紋術士" })).toBe("選一個秘紋術士子職");
  expect(fillSpaced("「{class}」：{n}", { class: "Ash", n: "3" })).toBe("「Ash」：3");
  expect(fillSpaced("{class} Subclass", { class: "Ash" })).toBe("Ash Subclass");
  expect(fillSpaced("{missing}", {})).toBe("{missing}");
});

it("spaces generated class and subclass text around a Latin-lettered name", () => {
  const ctx = classContext();
  const rows = classCodec.toRows({ ...classCodec.copyFrom("fighter", ctx.builtin), id: "uat2", nameEn: "UAT2", nameZh: "UAT2-秘紋術士" }, ctx);
  const subclassRow = rows.find((r) => r.payload.entry!.meta!.generated === "subclass")!;
  expect(subclassRow.payload.zhTW!.name).toBe("UAT2-秘紋術士 子職");
  expect(subclassRow.payload.zhTW!.entries).toEqual(["你選擇一個 UAT2-秘紋術士 子職。"]);

  const c = subclassContext();
  c.labels = { ...c.labels, zh: { ...c.labels.zh, castingName: "{sub}施法" } };
  const sub = subclassCodec.toRows(
    { ...sampleForm(), nameZh: "堡壘2", spellcasting: { ability: "int", list: "wizard", cantrips: [], prepared: [], textEn: "", textZh: "" } },
    c,
  );
  expect(sub.find((r) => r.payload.entry!.meta!.generated === "spellcasting")!.payload.zhTW!.name).toBe("堡壘2 施法");
});
