import * as v from 'valibot';
import { GameDataMetaSchema, LocalizableItemSchema } from '../base';

// ============================================================================
// CoC7e Weapon
// ============================================================================

export const WeaponSchema = v.object({
  ...LocalizableItemSchema.entries, // id, name?
  category: v.optional(v.string()),
  skill: v.optional(v.string()),
  damage: v.optional(v.string()),
  damageEffect: v.optional(v.string()),
  range: v.optional(v.string()),
  rangeUnit: v.optional(v.string()),
  attacks: v.optional(v.string()),
  ammo: v.optional(v.string()),
  malfunction: v.optional(v.string()),
  /** The text `malfunction` held before it carried the rulebook number; matches legacy rows only. */
  legacyMalfunction: v.optional(v.string()),
});

// Array format (legacy, no $schema)
export const WeaponsArraySchema = v.array(WeaponSchema);

// Master format with $schema
export const WeaponsMasterSchema = v.object({
  ...GameDataMetaSchema.entries,
  weapons: v.array(WeaponSchema),
});

export type Weapon = v.InferOutput<typeof WeaponSchema>;
export type WeaponsMaster = v.InferOutput<typeof WeaponsMasterSchema>;
