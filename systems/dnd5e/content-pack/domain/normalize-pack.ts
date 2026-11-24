import type { PackOverlay, PackReport, PackWizardItem, PackZhEntry, ValidatedPack } from "./types";

/**
 * What a pack built before T5b lacks, filled in at load so a pack already on
 * a device reads like a fresh one (`scripts/dnd5e-2024` now writes all of it):
 *
 * - zh-TW text: feet as 呎 (the built-in unit), not 尺; the lineage term 血統.
 * - Equipment package labels in zh-TW: the owner's name and the option, `工匠（A）`.
 * - "Any artisan item" package rows: the built-in message token for the choice.
 * - Spells: `w.self`, the keyed row the wizard prepares a spellbook spell by.
 * - Tough: 2 HP per character level (5etools has no structured field for it, so packs built
 *   before T4f carry 0), on the feat and on a background whose origin feat it is.
 *
 * The zh-TW text fix covers overlay text (pack v2) too.
 */

const FEET = /(?<=\d)\s*尺(?!寸)/g;

/** A zh-TW pack text with the built-in units and terms. */
export function normalizeZhText(text: string): string {
  return text.replace(FEET, "呎").replaceAll("血系", "血統");
}

function mapStrings(value: unknown, map: (text: string) => string): unknown {
  if (typeof value === "string") return map(value);
  if (Array.isArray(value)) return value.map((child) => mapStrings(child, map));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, mapStrings(child, map)]));
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Built-in tokens of a package row that names a choice instead of an item. */
const ANY_ITEM: Record<string, string> = {
  "Any artisan item": "{{i18n:wizard.equipment.any-artisan}}",
  "Any gaming item": "{{i18n:wizard.equipment.any-gaming}}",
  "Any instrument item": "{{i18n:wizard.equipment.any-instrument}}",
};

function packageItem(item: PackWizardItem, zhTW: Record<string, PackZhEntry>): PackWizardItem {
  const w = isRecord(item.w) ? item.w : undefined;
  const rows = Array.isArray(w?.items)
    ? w.items.map((row) =>
        isRecord(row) && typeof row.label === "string" && ANY_ITEM[row.label] ? { ...row, label: ANY_ITEM[row.label] } : row,
      )
    : undefined;
  const owner = typeof item.owner === "string" && typeof item.ownerKind === "string" ? zhTW[`${item.ownerKind}:${item.owner}`] : undefined;
  const label = isRecord(item.label) ? item.label : undefined;
  const option = typeof item.option === "string" ? item.option : undefined;
  const zhLabel = owner && option && label && label["zh-TW"] === label.en ? `${owner.name}（${option}）` : undefined;
  return {
    ...item,
    ...(zhLabel ? { label: { ...label, "zh-TW": zhLabel } } : {}),
    ...(w && rows ? { w: { ...w, items: rows } } : {}),
  };
}

function spellItem(item: PackWizardItem): PackWizardItem {
  const w = isRecord(item.w) ? item.w : undefined;
  if (!w || Array.isArray(w.self) || typeof item.ref !== "string") return item;
  return { ...item, w: { ...w, self: [{ id: item.ref }] } };
}

/** The XPHB Tough feat adds 2 Hit Points to the maximum per character level. */
const TOUGH_HP_PER_LEVEL = 2;

function toughItem(key: string, item: PackWizardItem): PackWizardItem {
  const w = isRecord(item.w) ? item.w : undefined;
  if (!w) return item;
  if (key === "feats" && item.ref === "feat:tough" && !w.hp) return { ...item, w: { ...w, hp: TOUGH_HP_PER_LEVEL } };
  if (key === "backgrounds" && w.feat === "tough" && !w.featHp) return { ...item, w: { ...w, featHp: TOUGH_HP_PER_LEVEL } };
  return item;
}

/** The pack with the fixes above; idempotent, so a pack that already has them is unchanged. */
export function normalizePack(pack: ValidatedPack): ValidatedPack {
  const zhTW = mapStrings(pack.zhTW, normalizeZhText) as Record<string, PackZhEntry>;
  const overlays: Record<string, PackOverlay> = {};
  for (const [ref, overlay] of Object.entries(pack.overlays ?? {})) {
    overlays[ref] = overlay.zhTW ? { ...overlay, zhTW: mapStrings(overlay.zhTW, normalizeZhText) as PackOverlay["zhTW"] } : overlay;
  }
  const wizard: Record<string, PackWizardItem[]> = {};
  for (const [key, items] of Object.entries(pack.wizard)) {
    wizard[key] = items.map((original) => {
      let item = original;
      if (isRecord(item.label) && typeof item.label["zh-TW"] === "string") {
        item = { ...item, label: { ...item.label, "zh-TW": normalizeZhText(item.label["zh-TW"]) } };
      }
      if (key === "equipment-packages") item = packageItem(item, zhTW);
      if (key === "spells") item = spellItem(item);
      return toughItem(key, item);
    });
  }
  return { ...pack, zhTW, wizard, overlays };
}

/**
 * A pack record cached before pack format v2 (IndexedDB stays at version 1), read as a current
 * one: no overlays, no dropped overlay keys and no name drops (B-025; the next revalidation
 * fills them). A current record is returned unchanged.
 */
export function upgradeCachedPack<T extends { pack: ValidatedPack; report: PackReport }>(record: T): T {
  if (record.pack.overlays && Array.isArray(record.report.droppedOverlays) && Array.isArray(record.report.droppedByName)) return record;
  return {
    ...record,
    pack: { ...record.pack, overlays: record.pack.overlays ?? {} },
    report: { ...record.report, droppedOverlays: record.report.droppedOverlays ?? [], droppedByName: record.report.droppedByName ?? [] },
  };
}
