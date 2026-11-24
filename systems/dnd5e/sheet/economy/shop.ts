import { catalogItem, type Catalog, type CatalogItem } from "./catalog";
import { purseOf, spend, totalCp, type Purse } from "./coins";

/**
 * A purchase in the shop (plan-uat2 §3.5): the cart's total is paid from the purse (`spend`), each
 * line merges into an unequipped row of the same `ref` or becomes a new row, and a weapon can
 * also become an attack linked to its row. Pure; the shop dialog supplies the row builders.
 */

type Row = Record<string, unknown>;
type Data = Record<string, unknown>;

/** `ref → quantity`. */
export type Cart = Readonly<Record<string, number>>;

const listOf = (value: unknown): Row[] =>
  Array.isArray(value) ? value.filter((row): row is Row => typeof row === "object" && row !== null) : [];

const lines = (cart: Cart) => Object.entries(cart).filter(([, qty]) => Number.isInteger(qty) && qty > 0);

/** The cart's price in copper; null when it holds an item the catalog does not price. */
export function cartCost(cart: Cart, catalog: Catalog): number | null {
  let total = 0;
  for (const [ref, qty] of lines(cart)) {
    const cost = catalogItem(catalog, ref)?.costCp;
    if (cost === null || cost === undefined) return null;
    total += cost * qty;
  }
  return total;
}

export interface PurchaseBuilders {
  /** A new equipment row of `qty` units of `ref`. */
  row: (ref: string, qty: number) => Row;
  /** The attack row of a weapon row, or null when it is not a weapon or no attack is wanted. */
  attack?: (row: Row) => Row | null;
}

export interface Purchase {
  data: Data;
  spentCp: number;
  /** The purse before, for 復原. */
  before: Purse;
}

/** Null when the cart is empty, unpriced, or more than the purse holds. */
export function purchase(data: Data, cart: Cart, catalog: Catalog, build: PurchaseBuilders): Purchase | null {
  const cost = cartCost(cart, catalog);
  if (cost === null || lines(cart).length === 0) return null;
  const before = purseOf(data);
  const after = spend(before, cost);
  if (!after) return null;
  const equipment = [...listOf(data.equipment)];
  const weapons = [...listOf(data.weapons)];
  for (const [ref, qty] of lines(cart)) {
    const at = equipment.findIndex((row) => row.ref === ref && row.equipped !== true);
    let row: Row;
    if (at >= 0) {
      const own = Number(equipment[at].qty);
      row = { ...equipment[at], qty: (Number.isFinite(own) ? own : 1) + qty };
      equipment[at] = row;
    } else {
      row = build.row(ref, qty);
      equipment.push(row);
    }
    const id = typeof row.id === "string" ? row.id : "";
    const linked = id !== "" && weapons.some((attack) => attack.itemId === id);
    const attack = linked ? null : build.attack?.(row);
    if (attack) weapons.push(attack);
  }
  return { data: { ...data, ...after, equipment, weapons }, spentCp: cost, before };
}

/** Whether the purse covers the cart. */
export function affordable(data: Data, cart: Cart, catalog: Catalog): boolean {
  const cost = cartCost(cart, catalog);
  return cost !== null && cost <= totalCp(purseOf(data));
}

/**
 * What the shop sells: every priced catalog item, less the single units a bundle already prices
 * (the library's rule, F014: `arrow` beside `arrows-20`, `iron-spike` beside `iron-spikes`).
 */
export function shopItems(catalog: Catalog): CatalogItem[] {
  const refs = Object.keys(catalog);
  const ids = new Set(refs.map((ref) => ref.slice(ref.indexOf(":") + 1)));
  const bundled = (id: string) => ids.has(`${id}s`) || [...ids].some((other) => other.startsWith(`${id}s-`) && /^\d+$/.test(other.slice(id.length + 2)));
  return refs
    .map((ref) => catalogItem(catalog, ref)!)
    .filter((item) => item.costCp !== null && !bundled(item.ref.slice(item.ref.indexOf(":") + 1)));
}
