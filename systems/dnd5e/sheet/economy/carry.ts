import { catalogItem, type Catalog } from "./catalog";
import { coinWeight, purseOf } from "./coins";

/**
 * Carrying capacity (plan-uat2 §3.5, SRD 5.2.1 p.178): Strength × 7.5 / 15 / 30 / 60 / 120 lb for
 * Tiny / Small–Medium / Large / Huge / Gargantuan; drag, lift and push at twice that. Over capacity,
 * the Speed "can be no more than 5 feet" only while dragging, lifting or pushing, so the sheet
 * warns and never changes Speed. Coins weigh 1 lb per 50 (p.89). Powerful Build (p.86) counts one
 * size larger. Pure: plan-print reads `inventorySummary` too.
 */

const SIZES = ["tiny", "small", "medium", "large", "huge", "gargantuan"] as const;
type Size = (typeof SIZES)[number];
const SIZE_FACTOR: Readonly<Record<Size, number>> = { tiny: 7.5, small: 15, medium: 15, large: 30, huge: 60, gargantuan: 120 };

type Row = Record<string, unknown>;

const listOf = (value: unknown): Row[] =>
  Array.isArray(value) ? value.filter((row): row is Row => typeof row === "object" && row !== null) : [];

const numberOf = (value: unknown): number | undefined => {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
};

/** Powerful Build, from the species trait the wizard writes (`species:goliath#powerful-build`) or its name. */
export function hasPowerfulBuild(values: Row): boolean {
  return listOf(values.speciesTraits).some((row) => {
    const id = typeof row.id === "string" ? row.id : "";
    const name = typeof row.name === "string" ? row.name : "";
    return id.endsWith("#powerful-build") || /^(powerful build|強壯體格)$/i.test(name.trim());
  });
}

/** The size carrying capacity counts: the character's size, one larger with Powerful Build. */
export function carrySize(values: Row): Size {
  const own = SIZES.indexOf((typeof values.size === "string" ? values.size : "medium") as Size);
  const index = own < 0 ? SIZES.indexOf("medium") : own;
  return SIZES[Math.min(SIZES.length - 1, index + (hasPowerfulBuild(values) ? 1 : 0))];
}

export function carryingCapacity(values: Row): number {
  const strength = Math.max(0, numberOf(values.str) ?? 10);
  return strength * SIZE_FACTOR[carrySize(values)];
}

/** A row's weight per unit: its own `weight`, else the catalog's, else 0. */
export function unitWeight(row: Row, catalog: Catalog | null): number {
  const own = numberOf(row.weight);
  if (own !== undefined && own >= 0) return own;
  return catalogItem(catalog, row.ref)?.weight ?? 0;
}

export type CarryStatus = "ok" | "over" | "overDrag";

export interface InventoryRow {
  index: number;
  ref: string;
  qty: number;
  unitWeight: number;
  weight: number;
}

export interface InventorySummary {
  rows: InventoryRow[];
  /** The coins' weight in lb. */
  coins: number;
  /** Everything carried, coins included, in lb. */
  carried: number;
  capacity: number;
  /** Drag, lift or push: twice the capacity. */
  dragLimit: number;
  status: CarryStatus;
}

const tenth = (value: number) => Math.round(value * 10) / 10;

export function inventorySummary(values: Row, catalog: Catalog | null): InventorySummary {
  const rows = listOf(values.equipment).map((row, index): InventoryRow => {
    const qty = Math.max(0, numberOf(row.qty) ?? 1);
    const unit = unitWeight(row, catalog);
    return { index, ref: typeof row.ref === "string" ? row.ref : "", qty, unitWeight: unit, weight: unit * qty };
  });
  const coins = coinWeight(purseOf(values));
  const carried = tenth(rows.reduce((sum, row) => sum + row.weight, 0) + coins);
  const capacity = carryingCapacity(values);
  const dragLimit = capacity * 2;
  const status: CarryStatus = carried > dragLimit ? "overDrag" : carried > capacity ? "over" : "ok";
  return { rows, coins, carried, capacity, dragLimit, status };
}
