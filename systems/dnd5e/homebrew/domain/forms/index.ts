/**
 * The editor's forms, one per kind it writes. Each converts a form to a stored payload and back
 * (`common.ts`); the payload's wizard items are rebuilt from the entry on every save.
 */
import type { HomebrewFormKind, HomebrewPayload } from "../types";
import { backgroundForm, type BackgroundForm } from "./background";
import type { HomebrewFormCodec } from "./common";
import { featForm, type FeatForm } from "./feat";
import { itemForm, type ItemForm } from "./item";
import { speciesForm, type SpeciesForm } from "./species";
import { spellForm, type SpellForm } from "./spell";

export interface HomebrewForms {
  feat: FeatForm;
  spell: SpellForm;
  item: ItemForm;
  species: SpeciesForm;
  background: BackgroundForm;
}

export const HOMEBREW_FORMS: { readonly [K in HomebrewFormKind]: HomebrewFormCodec<HomebrewForms[K]> } = {
  feat: featForm,
  spell: spellForm,
  item: itemForm,
  species: speciesForm,
  background: backgroundForm,
};

/** The form kind a stored payload is edited with, or null (another kind, an overlay, a wizard row). */
export function formKindOf(payload: HomebrewPayload): HomebrewFormKind | null {
  const kind = payload.entry?.kind;
  if (kind === "item") return payload.entry?.meta?.magic === true ? "item" : null;
  return kind === "feat" || kind === "spell" || kind === "species" || kind === "background" ? kind : null;
}

export type { FormIssue, FormRead, HomebrewFormCodec, NamedForm, TextForm } from "./common";
export { newHomebrewId } from "./common";
export type { BackgroundForm, EquipmentLine } from "./background";
export type { FeatForm, FeatCategory } from "./feat";
export type { ItemForm, MagicItemCategory, MagicItemRarity } from "./item";
export type { SpeciesForm, SpeciesSize, SpeciesTraitForm } from "./species";
export type { Ability, CastingUnit, DistanceUnit, DurationType, DurationUnit, RangeShape, SpellForm, SpellSchool } from "./spell";
