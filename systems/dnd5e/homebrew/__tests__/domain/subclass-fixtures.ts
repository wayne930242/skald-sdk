import { subclassCodec, type SubclassContext } from "../../domain/subclass";
import type { HomebrewItemInput } from "../../domain/types";
export function subclassContext(id = "fighter"): SubclassContext {
  const labels = {
    features: "Features",
    spellsName: "{sub} Spells",
    alwaysPrepared: "Always prepared.",
    classLevel: "{class} Level",
    spells: "Spells",
    castingName: "{sub} Spellcasting",
    castingRule: "Prepare from {list} using {ability}.",
    derived: "Derived from the SRD multiclass table; not SRD content.",
    cantrips: "Cantrips",
    prepared: "Prepared Spells",
  };
  return {
    parent: {
      id,
      builtin: true,
      name: { en: id, zh: id },
      caster: id === "paladin" ? "half" : id === "cleric" ? "full" : "none",
      subclassLevels: id === "paladin" ? [3, 7, 15, 20] : [3, 7, 10, 15, 18],
      thirdCaster: id === "fighter",
    },
    labels: { en: labels, zh: labels },
    spellNames: {},
    classNames: { wizard: { en: "Wizard", zh: "Wizard" } },
    abilityNames: { int: { en: "Intelligence", zh: "Intelligence" } },
    otherFeatureIds: new Set(),
  };
}
export const sampleForm = () => ({
  ...subclassCodec.empty("fighter"),
  id: "lamplighter",
  nameEn: "Lamplighter",
  features: [{ level: 3, nameEn: "Flare", nameZh: "", textEn: "Light.", textZh: "" }],
});
export const records = (rows: HomebrewItemInput[]) =>
  rows.map((r, i) => ({
    ...r,
    id: String(i),
    packUuid: "test",
    revision: 1,
    bytes: JSON.stringify(r.payload).length,
    updatedAt: "",
  }));
