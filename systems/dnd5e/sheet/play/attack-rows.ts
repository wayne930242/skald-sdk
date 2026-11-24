import type { ReferenceContextValue } from "../use-reference-context";
import { rows, weaponAttackRow, type AttackLabels, type GameWeapon } from "./play-model";

/** Attack rows made from weapons (S13): the items tab, the shop and the compendium share them. */

export function newWeaponRowId(): string {
  const suffix =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `weapon_${suffix}`;
}

/** Labels for an attack row in the viewer's locale: damage type, mastery and property names. */
export function attackLabels(reference: ReferenceContextValue, damageType: (code: string) => string, name: string): AttackLabels {
  return { name, damageType, mastery: (ref) => reference.nameOf(ref), property: (ref) => reference.nameOf(ref) };
}

/** Appends a weapon as an attack row. */
export function appendAttack(
  previous: Record<string, unknown>,
  weapon: GameWeapon,
  labels: AttackLabels,
  origin = "srd",
): Record<string, unknown> {
  return { ...previous, weapons: [...rows(previous.weapons), weaponAttackRow(previous, weapon, labels, newWeaponRowId(), origin)] };
}
