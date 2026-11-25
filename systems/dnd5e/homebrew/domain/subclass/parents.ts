import type { HomebrewItemRecord } from "../types";

export interface SubclassParent {
  id: string;
  builtin: boolean;
  name: { en: string; zh: string };
  subclassLevels: number[];
  caster: "full" | "half" | "pact" | "none";
  thirdCaster: boolean;
  /** The class's spell list (a class id): its own, or the built-in list a homebrew class borrows. */
  list?: string;
}
export function subclassLevelsOf(classId: string, ids: Iterable<string>): number[] {
  const levels = new Set<number>();
  for (const ref of ids) {
    const [parent, leaf, extra] = ref.replace(/^classFeature:/, "").split("/");
    if (parent !== classId || extra !== undefined) continue;
    const match = leaf?.match(/^(.+)-l([1-9]\d?)$/);
    if (match && Number(match[2]) <= 20 && [classId + "-subclass", "subclass-feature"].includes(match[1]))
      levels.add(Number(match[2]));
  }
  return [...levels].sort((a, b) => a - b);
}
function casterOf(value: unknown): SubclassParent["caster"] {
  return value === "artificer" || value === "half" ? "half" : value === "full" || value === "pact" ? value : "none";
}
export function builtinParents(
  classes: readonly { id: string; spellcasting?: { progression?: string } }[],
  ids: (id: string) => Iterable<string>,
): SubclassParent[] {
  return classes
    .map(({ id, spellcasting }) => ({
      id,
      builtin: true,
      name: { en: id, zh: id },
      subclassLevels: subclassLevelsOf(id, ids(id)),
      caster: casterOf(spellcasting?.progression),
      thirdCaster: id === "fighter" || id === "rogue",
      ...(spellcasting?.progression ? { list: id } : {}),
    }))
    .filter((p) => p.subclassLevels.length);
}
export function homebrewParents(rows: readonly HomebrewItemRecord[]): SubclassParent[] {
  const ids = rows.filter((r) => r.kind === "classFeature").map((r) => r.key);
  return rows
    .filter((r) => r.kind === "class" && r.payload.entry)
    .map(({ key: id, payload }) => {
      const sc = payload.entry?.meta?.spellcasting;
      const casting = sc && typeof sc === "object" ? (sc as { progression?: unknown; list?: unknown }) : {};
      const caster = casterOf(casting.progression);
      const en = payload.entry!.name;
      return {
        id,
        builtin: false,
        name: { en, zh: payload.zhTW?.name ?? en },
        subclassLevels: subclassLevelsOf(id, ids),
        caster,
        thirdCaster: caster === "none",
        ...(caster !== "none" ? { list: typeof casting.list === "string" && casting.list ? casting.list : id } : {}),
      };
    })
    .filter((p) => p.subclassLevels.length);
}
