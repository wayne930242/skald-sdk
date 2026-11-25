import { planRows } from "../multi-row-plan";
import { legacyContext, readsBack } from "../read-back";
import { readNames, readTexts } from "../forms/common";
import type { HomebrewPayload, HomebrewItemRecord } from "../types";
import { empty, type SubclassForm, type SubclassContext } from "./form";
import { toRows } from "./generate";
export function rowsOf(key: string, rows: readonly HomebrewItemRecord[]) {
  return rows.filter((r) => r.kind === "subclassFeature" && r.key.startsWith(key + "/"));
}
function text(p: HomebrewPayload, trim: number) {
  const names = readNames(p);
  const cut = (a: readonly unknown[]) => (trim ? a.slice(0, -trim) : a);
  const t = readTexts(
    cut(p.entry!.entries ?? []),
    p.zhTW?.entries ? cut(p.zhTW.entries) : undefined,
    names.chineseOnly,
  );
  return { nameEn: names.nameEn, nameZh: names.nameZh, textEn: t.en, textZh: t.zh };
}
export function fromRows(subclass: HomebrewPayload, features: readonly HomebrewItemRecord[], ctx: SubclassContext) {
  const form = empty();
  try {
    const e = subclass.entry!,
      m = e.meta ?? {};
    Object.assign(form, text(subclass, 1), { id: e.id.split("/")[1], parent: m.parent, spells: m.spells ?? [] });
    for (const r of features) {
      const meta = r.payload.entry!.meta ?? {};
      if (meta.generated === "spellcasting") {
        const s = m.spellcasting as NonNullable<SubclassForm["spellcasting"]>;
        const { textEn, textZh } = text(r.payload, 3);
        form.spellcasting = {
          ability: s.ability,
          list: s.list,
          prepared: s.prepared,
          cantrips: s.cantrips,
          textEn,
          textZh,
        };
      } else if (!meta.generated)
        form.features.push({ ...text(r.payload, 0), level: Number(meta.level), key: r.key.split("/").at(-1) });
    }
    return { form, lossless: readsBack([toRows(form, ctx), toRows(form, legacyContext(ctx))], subclass, features) };
  } catch {
    return { form, lossless: false };
  }
}
/**
 * The rows to write and the stored rows to delete. `previousKey`: the key the subclass was stored
 * under when the form opened; a subclass moved to another parent class gets a new key, so its old
 * rows are deleted after the new ones are written.
 */
export function plan(form: SubclassForm, ctx: SubclassContext, stored: readonly HomebrewItemRecord[], previousKey?: string) {
  const rows = toRows(form, ctx),
    key = rows[0].key;
  const keys = new Set([key, ...(previousKey ? [previousKey] : [])]);
  return planRows(rows, [
    ...stored.filter((r) => r.kind === "subclass" && keys.has(r.key)),
    ...[...keys].flatMap((k) => rowsOf(k, stored)),
  ]);
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The parent class name a stored spell or casting table's first column label (`classLevel`, CJK-spaced or not) was filled in with. */
function storedParentName(features: readonly HomebrewItemRecord[], template: string, l: "en" | "zh"): string | undefined {
  const parts = template.split("{class}");
  if (parts.length !== 2) return undefined;
  const pattern = new RegExp(`^${escape(parts[0])}\\s?(.+?)\\s?${escape(parts[1])}$`, "s");
  for (const r of features) {
    if (!["spells", "spellcasting"].includes(String(r.payload.entry?.meta?.generated))) continue;
    const layer = l === "en" ? r.payload.entry : r.payload.zhTW;
    const table = (layer?.entries ?? []).at(-1) as { colLabels?: unknown[] } | undefined;
    const found = typeof table?.colLabels?.[0] === "string" ? pattern.exec(table.colLabels[0])?.[1] : undefined;
    if (found) return found;
  }
  return undefined;
}

/**
 * The context a subclass whose parent class is gone reads back with: a stand-in parent with the old
 * id and name, its first subclass level (the intro row's), and the casting its stored spell rows imply.
 * The name only reaches generated text: it is read from the stored class-level column of the spell or
 * casting table, else the id (no such table: the name is used nowhere). Null when the rows are not the
 * builder's (no intro row), so such a subclass stays read-only. Its sibling feature ids come from
 * `pack` (the remaining rows): other subclasses stored under the same gone parent, `ownKey` excluded.
 */
export function orphanContext(
  subclass: HomebrewPayload,
  features: readonly HomebrewItemRecord[],
  base: Omit<SubclassContext, "parent" | "otherFeatureIds">,
  pack: readonly HomebrewItemRecord[] = [],
  ownKey?: string,
): SubclassContext | null {
  const m = subclass.entry?.meta ?? {};
  const id = typeof m.parent === "string" ? m.parent : "";
  const intro = features.find((r) => r.payload.entry?.meta?.generated === "intro");
  const first = Number(intro?.payload.entry?.meta?.level);
  if (!id || !Number.isInteger(first)) return null;
  const levels = (Array.isArray(m.spells) ? m.spells : []).map((s) => Number((s as { level?: unknown }).level));
  const caster = m.spellcasting || !levels.length ? "none" : levels.every((l) => [3, 5, 9, 13, 17].includes(l)) ? "half" : "full";
  return {
    ...base,
    parent: {
      id,
      builtin: false,
      name: { en: storedParentName(features, base.labels.en.classLevel, "en") ?? id, zh: storedParentName(features, base.labels.zh.classLevel, "zh") ?? id },
      subclassLevels: [first],
      caster,
      thirdCaster: Boolean(m.spellcasting),
    },
    otherFeatureIds: new Set(
      pack
        .filter((r) => r.kind === "subclassFeature" && r.key.startsWith(id + "/") && !(ownKey && r.key.startsWith(ownKey + "/")))
        .map((r) => `subclassFeature:${r.key}`),
    ),
  };
}
