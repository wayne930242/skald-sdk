/**
 * A class form as rows (CLASS-IMPL §2.1, §2.3): the `class` row (description, the generated 1–20
 * progression table, level-1 meta, wizard items) and one `classFeature` row per generated and
 * authored feature. Generated features use the built-in slugs, so the subclass builder and the
 * level-up helper find them by id; the table uses the reader's English labels.
 */
import { entryOf, newHomebrewId, pair, textEntries } from "../forms/common";
import { fillSpaced } from "../spacing";
import type { HomebrewItemInput } from "../types";
import { wizardItemsOf, type HomebrewRefInfo } from "../wizard-items";
import { generatedFeatures, NONE, proficiencyAt, reservedSlugs, slotsAt, type GeneratedFeature } from "./chassis";
import {
  issues, type ClassContext, type ClassEquipmentLine, type ClassForm, type ClassLabels, type Localized, type TableCell,
} from "./form";

type Locale = "en" | "zh";
type TableKey = "level" | "proficiency" | "features" | "cantrips" | "prepared" | "slots" | "slotLevel" | "weaponMastery" | "slotGroup";

/** The English table labels the progression reader keys columns by (`reference/class-progression.ts`); fixed, not from messages. */
export const EN_TABLE_LABELS: Readonly<Record<TableKey, string>> = {
  level: "Level", proficiency: "Proficiency Bonus", features: "Class Features", cantrips: "Cantrips", prepared: "Prepared Spells",
  slots: "Spell Slots", slotLevel: "Slot Level", weaponMastery: "Weapon Mastery", slotGroup: "Spell Slots per Spell Level",
};

const GENERATED_TEXT: Record<GeneratedFeature["generated"], [keyof ClassLabels, keyof ClassLabels]> = {
  spellcasting: ["spellcastingName", "spellcastingText"],
  pactMagic: ["pactMagicName", "pactMagicText"],
  weaponMastery: ["weaponMastery", "masteryText"],
  subclass: ["subclassName", "subclassText"],
  subclassFeature: ["subclassFeatureName", "subclassFeatureText"],
  asi: ["asiName", "asiText"],
  extraAttack: ["extraAttackName", "extraAttackText"],
  epicBoon: ["epicBoonName", "epicBoonText"],
};

const ROW_BYTES = 131072;
const OPTION_LETTERS = ["A", "B", "C"];

interface Feature {
  leaf: string;
  level: number;
  name: Localized;
}

function equipmentLine(item: ClassEquipmentLine): Record<string, unknown> {
  return {
    ...(item.categories?.length ? { categories: [...item.categories] } : {}),
    ...(item.displayName.trim() ? { displayName: item.displayName.trim() } : {}),
    qty: item.qty,
    ...(item.ref ? { ref: item.ref } : {}),
  };
}

/** `meta.multiclass` in the `MulticlassRules` shape; no requirement given = the primary abilities. */
function multiclassMeta(f: ClassForm): Record<string, unknown> {
  const { requires, gains } = f.multiclass;
  const tools = gains.tools;
  return {
    requires: { abilities: [...(requires.abilities.length ? requires.abilities : f.primaryAbility)], mode: requires.mode, score: 13 },
    gains: {
      armor: [...gains.armor],
      weapons: [...gains.weapons],
      skills: gains.skills ? { count: gains.skills.count, from: gains.skills.from === "any" ? "any" : [...gains.skills.from] } : null,
      tools: tools
        ? {
            ...(tools.grant?.length ? { grant: [...tools.grant] } : {}),
            ...(tools.choice ? { choice: { category: tools.choice.category, count: tools.choice.count } } : {}),
          }
        : null,
    },
  };
}

const tagSafe = (text: string) => text.replace(/[|{}]/g, "");

export function toRows(f: ClassForm, ctx: ClassContext): HomebrewItemInput[] {
  const errors = issues(f, ctx);
  if (errors.length) throw new Error(errors.join(", "));
  const c = f.id;
  const casting = f.casting;
  const like = casting ? ctx.builtin[casting.countsLike] : undefined;
  const name = pair(f.nameEn, f.nameZh);
  const withZh = [f.nameZh, f.textZh, ...f.features.flatMap((x) => [x.nameZh, x.textZh]), ...f.columns.map((col) => col.nameZh)].some((v) => v.trim());
  const fill = (l: Locale, key: keyof ClassLabels) =>
    fillSpaced(ctx.labels[l][key], {
      class: name[l],
      ability: casting ? (ctx.abilityNames[casting.ability]?.[l] ?? casting.ability) : "",
      list: casting ? (casting.list ? (ctx.classNames[casting.list]?.[l] ?? casting.list) : name[l]) : "",
    }, !ctx.legacyText);
  const tableLabel = (l: Locale, key: TableKey) => (l === "en" ? EN_TABLE_LABELS[key] : ctx.labels.zh[key]);

  function row(kind: "class" | "classFeature", id: string, n: Localized, entries: { en: unknown[]; zh: unknown[] }, meta: Record<string, unknown>, zh: boolean) {
    return { kind, key: id, payload: entryOf(kind, { id, nameEn: n.en, nameZh: n.zh }, { ...entries, meta, withZh: zh }) } as HomebrewItemInput;
  }

  const features: Feature[] = [];
  const generatedRows: HomebrewItemInput[] = [];
  for (const g of generatedFeatures(f, ctx)) {
    const [nameKey, textKey] = GENERATED_TEXT[g.generated];
    const text = g.generated === "weaponMastery" && f.mastery === "two" ? "masteryTwoText" : textKey;
    const n = { en: fill("en", nameKey), zh: fill("zh", nameKey) };
    const leaf = `${g.slug}-l${g.level}`;
    features.push({ leaf, level: g.level, name: n });
    generatedRows.push(row("classFeature", `${c}/${leaf}`, n, { en: [fill("en", text)], zh: [fill("zh", text)] }, { level: g.level, generated: g.generated }, withZh));
  }

  const reserved = reservedSlugs(c);
  const used = new Set([...features.map((x) => x.leaf), ...f.features.flatMap((x) => (x.key ? [x.key] : []))]);
  const authoredRows: HomebrewItemInput[] = [];
  for (const x of f.features) {
    const slug = (x.key?.replace(/-l\d+$/, "") ?? newHomebrewId(x.nameEn)).slice(0, 80);
    let leaf = `${slug}-l${x.level}`;
    for (let i = 2; leaf !== x.key && (used.has(leaf) || reserved.has(leaf.replace(/-l\d+$/, ""))); i++) {
      leaf = `${slug.slice(0, 79 - String(i).length)}-${i}-l${x.level}`;
    }
    used.add(leaf);
    const n = pair(x.nameEn, x.nameZh);
    features.push({ leaf, level: x.level, name: n });
    authoredRows.push(row("classFeature", `${c}/${leaf}`, n, textEntries(x.textEn, x.textZh), { level: x.level }, Boolean(x.nameZh.trim() || x.textZh.trim())));
  }

  const masteryColumn = f.mastery === "barbarian" || f.mastery === "fighter" ? ctx.builtin[f.mastery].weaponMastery : null;
  const slotCount = casting?.progression === "full" ? 9 : casting?.progression === "artificer" ? 5 : 0;
  function table(l: Locale) {
    const colLabels = [
      tableLabel(l, "level"), tableLabel(l, "proficiency"), tableLabel(l, "features"),
      ...f.columns.map((col) => pair(col.nameEn, col.nameZh)[l]),
      ...(masteryColumn ? [tableLabel(l, "weaponMastery")] : []),
      ...(like?.cantrips ? [tableLabel(l, "cantrips")] : []),
      ...(casting ? [tableLabel(l, "prepared")] : []),
    ];
    const slotStart = colLabels.length;
    colLabels.push(...Array.from({ length: slotCount }, (_, i) => String(i + 1)));
    if (casting?.progression === "pact") colLabels.push(tableLabel(l, "slots"), tableLabel(l, "slotLevel"));
    const rows = Array.from({ length: 20 }, (_, i): TableCell[] => {
      const level = i + 1;
      const cell = features
        .filter((x) => x.level === level)
        .map((x) => `{@classFeature ${x.leaf.replace(/-l\d+$/, "")}|${c}||${level}||${tagSafe(x.name[l])}}`)
        .join(fill(l, "separator"));
      return [
        level, proficiencyAt(level), cell || NONE,
        ...f.columns.map((col) => col.values[i] || NONE),
        ...(masteryColumn ? [masteryColumn[i]] : []),
        ...(like?.cantrips ? [like.cantrips[i]] : []),
        ...(like?.prepared && casting ? [like.prepared[i]] : []),
        ...(casting && slotCount ? slotsAt(casting.progression, level).map((n) => n || NONE) : []),
        ...(casting?.progression === "pact" && like?.pact ? [like.pact.slots[i], like.pact.level[i]] : []),
      ];
    });
    return {
      type: "table", caption: fill(l, "caption"),
      ...(slotCount ? { colGroups: [{ entry: tableLabel(l, "slotGroup"), span: slotCount, start: slotStart }] } : {}),
      colLabels, rows,
    };
  }

  const level1 = features.filter((x) => x.level === 1).map((x) => `classFeature:${c}/${x.leaf}`);
  const firstCell = (cells: TableCell[] | null | undefined) => Number(cells?.[0]) || 0;
  const meta: Record<string, unknown> = {
    hitDie: f.hitDie, primaryAbility: [...f.primaryAbility], saves: [...f.saves], armor: [...f.armor], weapons: [...f.weapons],
    skillChoice: { count: f.skillChoice.count, from: f.skillChoice.from === "any" ? "any" : [...f.skillChoice.from] },
    toolGrants: [...f.toolGrants],
    ...(f.toolChoice ? { toolChoice: { category: f.toolChoice.category, count: f.toolChoice.count } } : {}),
    unarmoredDefense: f.unarmoredDefense,
    startingEquipment: f.startingEquipment.map((o, i) => ({ option: OPTION_LETTERS[i], gp: o.gp, items: o.items.map(equipmentLine) })),
    masteryCountL1: f.mastery === "none" ? 0 : f.mastery === "two" ? 2 : firstCell(masteryColumn),
    expertiseL1: 0, fightingStyleL1: false, invocationsL1: 0, level1Choices: [], level1Features: level1,
    ...(casting && like
      ? {
          spellcasting: {
            ability: casting.ability, progression: casting.progression,
            cantripsL1: firstCell(like.cantrips), preparedL1: firstCell(like.prepared), slotsL1: slotsAt(casting.progression, 1),
            ...(casting.progression === "pact" && like.pact ? { pact: { level: firstCell(like.pact.level), slots: firstCell(like.pact.slots) } } : {}),
            ...(casting.list ? { list: casting.list } : {}),
          },
        }
      : {}),
    chassis: {
      asi: f.asi, subclassLike: f.subclassLike, subclassLevels: [...(ctx.builtin[f.subclassLike]?.subclassLevels ?? [])],
      extraAttack: f.extraAttack, mastery: f.mastery, ...(casting ? { countsLike: casting.countsLike } : {}),
      columns: f.columns.map((col) => ({ nameEn: col.nameEn, nameZh: col.nameZh, values: [...col.values] })),
    },
  };
  meta.multiclass = multiclassMeta(f);
  const desc = textEntries(f.textEn, f.textZh);
  const classRow = row("class", c, name, { en: [...desc.en, table("en")], zh: [...desc.zh, table("zh")] }, meta, withZh);
  const own = new Map<string, HomebrewRefInfo>(
    [...generatedRows, ...authoredRows].map((r) => {
      const e = r.payload.entry!;
      return [e.ref!, { ref: e.ref!, name: e.name, meta: e.meta ?? {}, builtin: false }];
    }),
  );
  const refs = { lookup: (ref: string) => own.get(ref) ?? ctx.refs.lookup(ref) };
  classRow.payload.wizard = wizardItemsOf(classRow.payload.entry!, classRow.payload.zhTW, refs);
  const rows = [classRow, ...generatedRows, ...authoredRows];
  if (rows.some((r) => new TextEncoder().encode(JSON.stringify(r.payload)).length > ROW_BYTES)) throw new Error("rowBytes");
  return rows;
}
