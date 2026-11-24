import { armorCategory, catalogItem, slotOf, type Catalog, type Slot } from "./catalog";

/**
 * Equip slots, AC and item links (plan-uat2 §3.3, SRD 5.2.1 p.92). "A creature can wear only one
 * suit of armor at a time and wield only one Shield at a time": equipping a row of a slot takes
 * off the others of that slot, and every equip, unequip and bonus change in a slot writes the AC
 * inputs the sheet's `ac` formula reads, in the same update. A character whose armor rows were
 * never toggled keeps its stored AC inputs. Pure: the items tab, the item settings and the tests
 * share it.
 */

type Row = Record<string, unknown>;
type Data = Record<string, unknown>;

const listOf = (value: unknown): Row[] =>
  Array.isArray(value) ? value.filter((row): row is Row => typeof row === "object" && row !== null) : [];

const numberOf = (value: unknown, fallback = 0): number => {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : fallback;
};

/** A row's magic +N (old rows have none). */
export const bonusOf = (row: Row): number => Math.trunc(numberOf(row.bonus));

export function rowSlot(row: Row, catalog: Catalog | null): Slot | null {
  return slotOf(catalogItem(catalog, row.ref));
}

/** The AC inputs of the given slots, from the rows equipped in them. */
export function armorInputs(equipment: readonly Row[], catalog: Catalog | null, slots: readonly Slot[]): Data {
  const patch: Data = {};
  const worn = (slot: Slot) => equipment.find((row) => row.equipped === true && rowSlot(row, catalog) === slot);
  if (slots.includes("body")) {
    const row = worn("body");
    const item = row ? catalogItem(catalog, row.ref) : undefined;
    const category = armorCategory(item);
    if (row && item?.armor && category) {
      Object.assign(patch, {
        armorType: category,
        armorBase: item.armor.ac + bonusOf(row),
        armorStrReq: item.armor.strReq,
        armorStealth: item.armor.stealth,
      });
    } else {
      Object.assign(patch, { armorType: "none", armorBase: 0, armorStrReq: 0, armorStealth: false });
    }
  }
  if (slots.includes("shield")) {
    const row = worn("shield");
    Object.assign(patch, { shield: row !== undefined, shieldBonus: row ? bonusOf(row) : 0 });
  }
  return patch;
}

export interface EquipResult {
  data: Data;
  /** The rows taken off to free the slot (their indexes). */
  swapped: number[];
  /** Whether an AC input changed. */
  acUpdated: boolean;
}

function changed(data: Data, patch: Data): boolean {
  return Object.entries(patch).some(([key, value]) => {
    const before = data[key];
    if (typeof value === "boolean") return (before === true) !== value;
    if (typeof value === "number") return numberOf(before) !== value;
    return (typeof before === "string" ? before : "none") !== value;
  });
}

/** Toggles a row's `equipped`. A row of a slot frees it first and rewrites that slot's AC inputs. */
export function toggleEquipped(data: Data, index: number, catalog: Catalog | null): EquipResult {
  const equipment = listOf(data.equipment);
  const row = equipment[index];
  if (!row) return { data, swapped: [], acUpdated: false };
  const wearing = row.equipped !== true;
  const slot = rowSlot(row, catalog);
  const swapped: number[] = [];
  const next = equipment.map((item, at) => {
    if (at === index) return { ...item, equipped: wearing };
    if (wearing && slot && item.equipped === true && rowSlot(item, catalog) === slot) {
      swapped.push(at);
      return { ...item, equipped: false };
    }
    return item;
  });
  if (!slot) return { data: { ...data, equipment: next }, swapped, acUpdated: false };
  const patch = armorInputs(next, catalog, [slot]);
  return { data: { ...data, equipment: next, ...patch }, swapped, acUpdated: changed(data, patch) };
}

/**
 * Applies the settings sheet's changes to a row. A new name or +N reaches the attacks made from it
 * (`weapons[].itemId`); a +N on worn armor or a worn shield rewrites that slot's AC inputs.
 */
export function patchItem(data: Data, index: number, patch: Row, catalog: Catalog | null): { data: Data; acUpdated: boolean } {
  const equipment = listOf(data.equipment);
  const row = equipment[index];
  if (!row) return { data, acUpdated: false };
  const updated = { ...row, ...patch };
  const nextEquipment = equipment.map((item, at) => (at === index ? updated : item));
  let next: Data = { ...data, equipment: nextEquipment };
  const id = typeof row.id === "string" ? row.id : "";
  const renamed = Object.hasOwn(patch, "name") && patch.name !== row.name;
  const rebonused = Object.hasOwn(patch, "bonus") && bonusOf(updated) !== bonusOf(row);
  if (id && (renamed || rebonused)) {
    next.weapons = listOf(data.weapons).map((attack) =>
      attack.itemId === id ? { ...attack, ...(renamed ? { name: updated.name } : {}), ...(rebonused ? { magic: bonusOf(updated) } : {}) } : attack,
    );
  }
  const slot = rowSlot(updated, catalog);
  if (slot && updated.equipped === true && rebonused) {
    const ac = armorInputs(nextEquipment, catalog, [slot]);
    const acUpdated = changed(next, ac);
    next = { ...next, ...ac };
    return { data: next, acUpdated };
  }
  return { data: next, acUpdated: false };
}

/** The attacks made from an item row. */
export function linkedAttacks(data: Data, row: Row): Row[] {
  const id = typeof row.id === "string" ? row.id : "";
  return id ? listOf(data.weapons).filter((attack) => attack.itemId === id) : [];
}

/** 「加為攻擊」 from an item row: the attack row with its link and the item's +N. */
export function linkAttack(attack: Row, item: Row): Row {
  return { ...attack, itemId: typeof item.id === "string" ? item.id : "", magic: bonusOf(item) };
}

// ---------------------------------------------------------------------------
// Attunement (three slots, `attunement1–3`)
// ---------------------------------------------------------------------------

export const ATTUNEMENT_FIELDS = ["attunement1", "attunement2", "attunement3"] as const;

const slotText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function isAttuned(data: Data, name: string): boolean {
  const own = name.trim();
  return own !== "" && ATTUNEMENT_FIELDS.some((field) => slotText(data[field]) === own);
}

/** Writes the name in the first free slot: `{}` when already attuned, null when all three are taken. */
export function attune(data: Data, name: string): Data | null {
  const own = name.trim();
  if (!own) return null;
  if (isAttuned(data, own)) return {};
  const free = ATTUNEMENT_FIELDS.find((field) => slotText(data[field]) === "");
  return free ? { [free]: own } : null;
}

/** Clears every slot holding the name. */
export function unattune(data: Data, name: string): Data {
  const own = name.trim();
  return Object.fromEntries(ATTUNEMENT_FIELDS.filter((field) => own !== "" && slotText(data[field]) === own).map((field) => [field, ""]));
}
