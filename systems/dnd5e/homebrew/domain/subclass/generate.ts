import { entryOf, newHomebrewId, pair, textEntries } from "../forms/common";
import type { HomebrewItemInput } from "../types";
import { issues, type SubclassForm, type SubclassContext, type Localized } from "./form";
import { thirdCasterSlots } from "./slots";
import { fillSpaced } from "../spacing";
export function toRows(f: SubclassForm, c: SubclassContext): HomebrewItemInput[] {
  const errors = issues(f, c.parent);
  if (errors.length) throw Error(errors.join(", "));
  const key = `${f.parent}/${f.id}`,
    first = c.parent.subclassLevels[0],
    sc = f.spellcasting,
    rows: HomebrewItemInput[] = [];
  const name = pair(f.nameEn, f.nameZh),
    desc = textEntries(f.textEn, f.textZh);
  const label = (l: "en" | "zh", k: keyof typeof c.labels.en) =>
    fillSpaced(c.labels[l][k], {
      class: c.parent.name[l],
      sub: name[l],
      ability: sc ? c.abilityNames[sc.ability][l] : "",
      list: sc ? c.classNames[sc.list][l] : "",
    }, !c.legacyText);
  function row(
    id: string,
    n: Localized,
    entries: { en: unknown[]; zh: unknown[] },
    meta: Record<string, unknown>,
    zh: boolean,
  ) {
    const kind = id === key ? "subclass" : "subclassFeature";
    if (id.length > 200) throw Error("id");
    return {
      key: id,
      kind,
      payload: entryOf(kind, { id, nameEn: n.en, nameZh: n.zh }, { ...entries, meta, withZh: zh }),
    } as HomebrewItemInput;
  }
  const zh = Boolean(f.nameZh || f.textZh || f.features.some((x) => x.nameZh || x.textZh) || sc?.textZh);
  function generated(
    suffix: string,
    k: "spellsName" | "castingName",
    tag: string,
    body: (l: "en" | "zh") => unknown[],
  ) {
    rows.push(
      row(
        `${key}/${f.id}-${suffix}-l${first}`,
        { en: label("en", k), zh: label("zh", k) },
        { en: body("en"), zh: body("zh") },
        { level: first, generated: tag },
        zh,
      ),
    );
  }
  if (f.spells.length)
    generated("spells", "spellsName", "spells", (l) => [
      label(l, "alwaysPrepared"),
      {
        type: "table",
        caption: label(l, "spellsName"),
        colLabels: [label(l, "classLevel"), label(l, "spells")],
        rows: f.spells.map((s) => [
          String(s.level),
          s.refs.map((ref) => `{@spell ${ref.replace(/^spell:/, "")}||${c.spellNames[ref][l]}}`).join(", "),
        ]),
      },
    ]);
  if (sc)
    generated("spellcasting", "castingName", "spellcasting", (l) => [
      ...textEntries(sc.textEn, sc.textZh)[l],
      label(l, "castingRule"),
      label(l, "derived"),
      {
        type: "table",
        caption: label(l, "castingName"),
        colLabels: [
          label(l, "classLevel"),
          ...(sc.cantrips.length ? [label(l, "cantrips")] : []),
          ...(sc.prepared.length ? [label(l, "prepared")] : []),
          "1",
          "2",
          "3",
          "4",
        ],
        rows: Array.from({ length: 18 }, (_, i) => {
          const level = i + 3;
          return [
            level,
            ...[sc.cantrips, sc.prepared]
              .filter((x) => x.length)
              .map((col) => col.filter((x) => x.level <= level).at(-1)?.value ?? 0),
            // No slot of that level: "—", as the editor's derived table shows it (v4.152.0 wrote 0).
            ...thirdCasterSlots(level).map((n) => n || (c.legacyText ? 0 : "—")),
          ].map(String);
        }),
      },
    ]);
  const used = new Set([
    `${f.id}-l${first}`,
    ...rows.map((r) => r.key.split("/").at(-1)),
    ...f.features.map((x) => x.key),
  ]);
  for (const x of f.features) {
    const slug = (x.key?.replace(/-l\d+$/, "") ?? newHomebrewId(x.nameEn)).slice(0, 80);
    let leaf = `${slug}-l${x.level}`;
    for (let i = 2; used.has(leaf) && leaf !== x.key; i++)
      leaf = `${slug.slice(0, 79 - String(i).length)}-${i}-l${x.level}`;
    used.add(leaf);
    rows.push(
      row(
        `${key}/${leaf}`,
        pair(x.nameEn, x.nameZh),
        textEntries(x.textEn, x.textZh),
        { level: x.level },
        Boolean(x.nameZh || x.textZh),
      ),
    );
  }
  function links(l: "en" | "zh", features: HomebrewItemInput[]) {
    return {
      type: "list",
      name: label(l, "features"),
      items: features.map((r) => {
        const leaf = r.key.split("/").at(-1)!,
          n = (l === "zh" && r.payload.zhTW?.name) || r.payload.entry!.name;
        return [...c.otherFeatureIds].some(
          (id) => id.replace(/^subclassFeature:/, "").startsWith(f.parent + "/") && id.endsWith("/" + leaf),
        )
          ? `{@b ${n}}`
          : `{@subclassFeature ${leaf.replace(/-l\d+$/, "")}|${f.parent}||${f.id}||${r.payload.entry!.meta!.level}||${n}}`;
      }),
    };
  }
  function body(features: HomebrewItemInput[]) {
    return { en: [...desc.en, links("en", features)], zh: [...desc.zh, links("zh", features)] };
  }
  rows.unshift(
    row(
      `${key}/${f.id}-l${first}`,
      name,
      body(rows.filter((r) => r.payload.entry!.meta!.level === first)),
      { level: first, generated: "intro" },
      zh,
    ),
  );
  const meta = {
    parent: f.parent,
    ...(f.spells.length ? { spells: f.spells } : {}),
    ...(sc
      ? {
          spellcasting: {
            progression: "third",
            ability: sc.ability,
            list: sc.list,
            cantrips: sc.cantrips,
            prepared: sc.prepared,
          },
        }
      : {}),
  };
  rows.unshift(
    row(
      key,
      name,
      body([...rows].sort((a, b) => Number(a.payload.entry!.meta!.level) - Number(b.payload.entry!.meta!.level))),
      meta,
      zh,
    ),
  );
  if (rows.some((r) => new TextEncoder().encode(JSON.stringify(r.payload)).length > 131072)) throw Error("rowBytes");
  return rows;
}
