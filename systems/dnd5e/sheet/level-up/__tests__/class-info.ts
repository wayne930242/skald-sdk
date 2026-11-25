import { loadEnglishCorpus, type CorpusEntry } from "../../../reference/load-corpus";
import { classInfoOf, type ClassInfo, type ClassInfoEntry } from "../plan";

export const CLASS_IDS = [
  "barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard",
] as const;

export async function builtinClassEntry(id: string): Promise<CorpusEntry> {
  const classes = await loadEnglishCorpus("class");
  const entry = classes?.[`class:${id}`];
  if (!entry) throw new Error(`No built-in class ${id}`);
  return entry;
}

/** A built-in class's helper data from the corpus, as the dialog's loader would assemble it; `extra` entries (a pack's) after. */
export async function builtinClassInfo(id: string, extra: ClassInfoEntry[] = []): Promise<ClassInfo> {
  const [entry, features, subclasses, subclassFeatures] = await Promise.all([
    builtinClassEntry(id),
    loadEnglishCorpus(`classFeature-${id}`),
    loadEnglishCorpus("subclass"),
    loadEnglishCorpus(`subclassFeature-${id}`),
  ]);
  return classInfoOf({
    id,
    blocks: entry,
    meta: entry.meta,
    name: entry.name,
    entries: [...Object.values(features ?? {}), ...Object.values(subclasses ?? {}), ...Object.values(subclassFeatures ?? {}), ...extra],
  });
}

/** A sheet at `level` with the class's level-1 wizard values that matter here. */
export function sheet(classId: string, level: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    className: classId,
    classId,
    subclass: "",
    level,
    hitDieFaces: 8,
    hpMaxMisc: 0,
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    features: [],
    feats: [],
    spells: [],
    ...extra,
  };
}
