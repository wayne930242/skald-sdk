import { text } from "./values";

interface AttackText { name: string; damageType: string; mastery: string; notes: string }
interface SnapshotCatalog {
  attacks: Record<string, AttackText>;
  options: Record<string, Record<string, string>>;
}
export interface SnapshotLabels { target: SnapshotCatalog; other: SnapshotCatalog }

const pending = new Map<string, Promise<SnapshotLabels>>();
/** Both dictionaries are needed to recognize an unedited field, but only by a weapon or option row. */
export function loadSnapshotLabels(locale: string): Promise<SnapshotLabels> {
  const key = locale === "zh-TW" ? locale : "en";
  let result = pending.get(key);
  if (!result) {
    result = Promise.all([import("@skald/system-dnd5e/data/dnd5e-2024/messages/sheet-snapshot/en.json"), import("@skald/system-dnd5e/data/dnd5e-2024/messages/sheet-snapshot/zh-TW.json")])
      .then(([{ default: en }, { default: zh }]) => key === "en" ? { target: en, other: zh } : { target: zh, other: en });
    pending.set(key, result);
    result.catch(() => pending.delete(key));
  }
  return result;
}

/** Only translate fields that still match a default for this exact weapon. No sheet write. */
export function attackText(row: Record<string, unknown>, labels?: SnapshotLabels): AttackText {
  const ref = text(row.ref);
  const target = labels?.target.attacks[ref];
  const other = labels?.other.attacks[ref];
  function field(key: keyof AttackText): string {
    const saved = text(row[key]);
    if (!saved || !target || row.origin === "pack" || row.origin === "custom") return saved;
    return other?.[key] === saved ? target[key] : saved;
  }
  return { name: field("name"), notes: field("notes"), mastery: field("mastery"), damageType: field("damageType") };
}
