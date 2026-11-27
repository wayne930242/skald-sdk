import { expect, it } from "vitest";
import zh from "@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json";
import tabs from "@skald/system-dnd5e/data/dnd5e-2024/messages/play-tabs/zh-TW.json";
import { loadSnapshotLabels } from "../../sheet/play/snapshot-labels";
import { buildDndPrintModel } from "../print-model";

it("prints the English built-in attack but leaves edited fields and custom attacks alone", async () => {
  const weapon = { origin: "srd", ref: "baseItem:scimitar", name: zh.ref.baseItem.scimitar,
    damageType: tabs.damageType.S, notes: [zh.ref.itemProperty.finesse, zh.ref.itemProperty.light].join(" · "), mastery: zh.ref.itemMastery.nick };
  const custom = { ...weapon, origin: "custom" };
  const input = { values: { weapons: [weapon, { ...weapon, name: "Keepsake", notes: "from my father" }, custom] }, snapshotLabels: await loadSnapshotLabels("en"), blanks: false, nameOf: () => "" };
  const [builtin, edited, own] = buildDndPrintModel(input).attacks;
  expect(builtin).toMatchObject({ name: "Scimitar", damageType: "Slashing", notes: "Nick · Finesse · Light" });
  expect(edited).toMatchObject({ name: "Keepsake", damageType: "Slashing", notes: "Nick · from my father" });
  expect(own).toMatchObject({ name: weapon.name, damageType: weapon.damageType, notes: `${weapon.mastery} · ${weapon.notes}` });
});
