import type { EffectivePacks, PackEntry } from "../../content-pack/domain/types";
import { loadEnglishCorpus, type CorpusEntry } from "../../reference/load-corpus";
import type { ReferenceSources } from "../../reference/sources";
import { classInfoOf, type ClassInfo, type ClassInfoEntry } from "./plan";

/**
 * Loads one sheet class for the level-up helper (phase 2b §4.2): a built-in class from the lazy
 * English corpus (its features, the subclasses and their features), a Drive-pack or homebrew class
 * from the device's enabled packs. Both feed `classInfoOf`, so one plan reads all three.
 */

export interface LoadedClass {
  info: ClassInfo;
  /** Localized labels of the progression table's columns by column index (zh table), for the info list. */
  columnLabels: Record<number, string>;
}

export interface LoadClassInput {
  classId: string;
  packs: EffectivePacks | null;
  /** Localized entry names (the reference context's `nameOf`). */
  nameOf: (ref: string) => string;
  sources: Pick<ReferenceSources, "resolve">;
  locale: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const CLASS_KINDS = new Set(["classFeature", "subclass", "subclassFeature"]);

function packClassEntries(packs: EffectivePacks | null, classId: string): { classEntry: PackEntry | null; entries: PackEntry[] } {
  const all = packs?.content.entries ?? [];
  return {
    classEntry: all.find((entry) => entry.ref === `class:${classId}`) ?? null,
    entries: all.filter((entry) => CLASS_KINDS.has(entry.kind) && entry.id.split("/")[0] === classId),
  };
}

/** The class's borrowed spell list (`meta.spellcasting.list`), when it has one. */
function spellListOf(meta: unknown): string | undefined {
  const casting = isRecord(meta) && isRecord(meta.spellcasting) ? meta.spellcasting : null;
  return casting && typeof casting.list === "string" && casting.list ? casting.list : undefined;
}

/**
 * The localized label of each column of the class's table: the English progression table's index
 * among the entry's blocks picks the same block of the localized layer (overlays keep the indexes).
 */
async function localColumnLabels(input: LoadClassInput, english: readonly unknown[]): Promise<Record<number, string>> {
  if (input.locale === "en") return {};
  const index = english.findIndex((block) => isRecord(block) && block.type === "table" && Array.isArray(block.colLabels) && block.colLabels[0] === "Level");
  if (index < 0) return {};
  const resolved = await input.sources.resolve(`class:${input.classId}`, input.locale).catch(() => null);
  const block = resolved?.blocks[index]?.block;
  if (!isRecord(block) || !Array.isArray(block.colLabels)) return {};
  return Object.fromEntries(block.colLabels.flatMap((label, column) => (typeof label === "string" && label ? [[column, label]] : [])));
}

/**
 * The sheet class's helper data, or null when the sheet names no class or no loaded source knows it
 * (a custom class text, a disabled pack): the helper then offers level and hit points only.
 */
export async function loadClass(input: LoadClassInput): Promise<LoadedClass | null> {
  const { classId } = input;
  if (!classId) return null;
  const classes = await loadEnglishCorpus("class");
  const builtin: CorpusEntry | undefined = classes?.[`class:${classId}`];
  const pack = packClassEntries(input.packs, classId);
  const entries: ClassInfoEntry[] = [];
  if (builtin) {
    const [features, subclasses, subclassFeatures] = await Promise.all([
      loadEnglishCorpus(`classFeature-${classId}`),
      loadEnglishCorpus("subclass"),
      loadEnglishCorpus(`subclassFeature-${classId}`),
    ]);
    entries.push(...Object.values(features ?? {}), ...Object.values(subclasses ?? {}), ...Object.values(subclassFeatures ?? {}));
  }
  // Built-in first: the first entry of a ref wins (a pack cannot replace a built-in feature).
  entries.push(...pack.entries);
  const blocks = builtin?.entries ?? pack.classEntry?.entries ?? null;
  if (!blocks && entries.length === 0) return null;
  const meta = builtin?.meta ?? pack.classEntry?.meta;
  const spellList = spellListOf(meta);
  const classRef = `class:${classId}`;
  const localName = input.nameOf(classRef);
  const info = classInfoOf({
    id: classId,
    blocks,
    entries,
    // `nameOf` falls back to the bare id for a ref no catalog names: the entry's own name reads better.
    localize: (ref, english) => {
      const name = input.nameOf(ref);
      return name === ref.slice(ref.indexOf(":") + 1) ? english : name;
    },
    ...(spellList ? { spellList } : {}),
    ...(isRecord(meta) ? { meta } : {}),
    name: localName && localName !== classId ? localName : builtin?.name ?? pack.classEntry?.name ?? classId,
    origin: builtin ? "srd" : "pack",
  });
  return { info, columnLabels: blocks ? await localColumnLabels(input, blocks) : {} };
}

/**
 * Every sheet class (`classIds`: the starting class's id and each `multiclass` row's), loaded in
 * parallel, for the multiclass plan's `classes`. An empty id (a custom starting class) maps to null.
 */
export async function loadClasses(input: Omit<LoadClassInput, "classId"> & { classIds: readonly string[] }): Promise<Map<string, LoadedClass | null>> {
  const ids = [...new Set(input.classIds)];
  const loaded = await Promise.all(ids.map((classId) => loadClass({ ...input, classId })));
  return new Map(ids.map((classId, index) => [classId, loaded[index]]));
}
