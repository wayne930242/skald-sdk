import { canonicalJson } from "../../../content-pack/domain/canonical-json";
import { planRows } from "../multi-row-plan";
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
    const all = toRows(form, ctx),
      old = new Map(features.map((r) => [r.key, r.payload]));
    return {
      form,
      lossless:
        all.length === features.length + 1 &&
        all.every((r, i) => canonicalJson(r.payload) === canonicalJson(i ? old.get(r.key) : subclass)),
    };
  } catch {
    return { form, lossless: false };
  }
}
export function plan(form: SubclassForm, ctx: SubclassContext, stored: readonly HomebrewItemRecord[]) {
  const rows = toRows(form, ctx),
    key = rows[0].key;
  return planRows(rows, [...stored.filter((r) => r.kind === "subclass" && r.key === key), ...rowsOf(key, stored)]);
}
