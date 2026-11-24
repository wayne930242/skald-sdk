import type { ListField, Schema } from "@skald/types/schema";
import { newEntryId, rowDefaults } from "../compendium-rows";

/** Equipment rows the shop, the magic item dialog and the item settings add (plan-uat2 §3.3, §3.5). */

type Row = Record<string, unknown>;

/** An item's rarity, as `economy.item.rarities.*` names it. */
export const RARITIES = ["common", "uncommon", "rare", "veryRare", "legendary", "artifact"] as const;

function equipmentField(schema: Schema): ListField | undefined {
  const field = schema.fields.equipment;
  return field?.type === "list" ? field : undefined;
}

/** A bought SRD item: its ref, the name in the buyer's locale, the text resolved live. */
export function srdItemRow(schema: Schema, ref: string, name: string, qty: number): Row {
  const field = equipmentField(schema);
  return { ...rowDefaults(field), id: newEntryId(field?.idPrefix ?? "equipment"), qty, name, ref, origin: "srd", text: "", equipped: false };
}

/** A custom or magic item: `ref` names its base item (slot, weight, AC, Strength), if any. */
export function customItemRow(schema: Schema, values: Row): Row {
  const field = equipmentField(schema);
  return { ...rowDefaults(field), id: newEntryId(field?.idPrefix ?? "equipment"), equipped: false, ...values, origin: "custom" };
}
