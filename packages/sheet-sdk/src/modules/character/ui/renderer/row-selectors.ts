// modules/character/ui/renderer/row-selectors.ts
//
// `stat-list` 是另一個列表欄位的「檢視」，不擁有資料。每個可當來源的欄位型別
// 在這裡註冊一個 row selector：`rows` 把來源資料變成統一的列（StatRow），
// `setRow` 把一次修改翻成「要寫回哪些頂層資料鍵」。
//
// 純函式、不碰 React：單元測試可以直接餵 data 與 system。
import type {
  Field,
  FateDefaultSkill,
  FateSkillPyramidField,
  FateSkillPyramidSkill,
  ListField,
} from "@skald/types/schema";
import type { RowSelector, RowSelectorContext, StatRow } from "@skald/sheet-sdk/modules/sheet-schema";
import { DEFAULT_FATE_SKILLS } from "./utils/fate-default-skills";

// The adapter contracts are shared with the plugin catalog; registrations stay here.
export type { RowEntryTranslator, RowPatch, RowSelection, RowSelector, RowSelectorContext, StatGroup, StatRow } from "@skald/sheet-sdk/modules/sheet-schema";

const selectors = new Map<string, RowSelector>();

export function registerRowSelector<F extends Field>(
  fieldType: F["type"],
  selector: RowSelector<F>,
): void {
  // SAFETY: the map is keyed by `fieldType`, and `getRowSelector` hands the
  // selector back only for that same type, so `F` always matches the source
  // field the caller passes. The map itself can't express that per-key type.
  selectors.set(fieldType, selector as unknown as RowSelector);
}

export function getRowSelector(
  fieldType: string,
  pluginSelectors?: ReadonlyMap<string, RowSelector>,
): RowSelector | undefined {
  return pluginSelectors?.get(fieldType) ?? selectors.get(fieldType);
}

// ============================================================================
// rowRoll：擲骰前把 @row.* 換成數字
// ============================================================================

// 前面的 +／- 一起吃進來，負數才能合併符號
const ROW_TOKEN = /(?:([+-])(\s*))?(?:\{\{\s*@row\.(\w+)\s*\}\}|@row\.(\w+))/g;

/** rowRoll 可用的列數值 */
export function rowRollValues(row: StatRow): Record<string, number> {
  const values: Record<string, number> = { value: row.value };
  if (row.base !== undefined) values.base = row.base;
  if (row.half !== undefined) values.half = row.half;
  if (row.fifth !== undefined) values.fifth = row.fifth;
  if (row.level !== undefined) values.level = row.level;
  return values;
}

/**
 * 把表達式裡的 `{{@row.value}}`／`@row.level` 等換成數字。
 * 負數接在 `+` 後面時合併符號（`4dF+-1` 不是合法的骰式）。
 * 列沒有這個欄位時直接丟錯：靜默換成 0 會擲出一個看起來正常的錯誤結果。
 */
export function substituteRowTokens(expression: string, row: StatRow): string {
  const values = rowRollValues(row);
  return expression.replace(
    ROW_TOKEN,
    (
      _match,
      operator: string | undefined,
      gap: string | undefined,
      braced: string | undefined,
      bare: string | undefined,
    ) => {
      const key = (braced ?? bare)!;
      const value = values[key];
      if (value === undefined) {
        throw new Error(`rowRoll uses @row.${key}, which row "${row.id}" does not have`);
      }
      // 存檔裡的數值沒有型別把關：字串或 NaN 進了骰式會在擲骰內部丟出未處理的 rejection
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`rowRoll uses @row.${key}, which is not a finite number on row "${row.id}"`);
      }
      if (!operator) return String(value);
      // `4dF+@row.level` with level -1 must become `4dF-1`, not `4dF+-1`
      const flipped = value < 0 ? (operator === "+" ? "-" : "+") : operator;
      return `${flipped}${gap ?? ""}${Math.abs(value)}`;
    },
  );
}

// ============================================================================
// fate-skill-pyramid
// ============================================================================

interface FateSkillsData {
  skills: FateSkillPyramidSkill[];
  skillOrder?: string[];
}

/** 與 fate-skill-pyramid renderer 一樣：欄位沒宣告 defaultSkills 就用內建 19 個 */
function fateDefaults(source: FateSkillPyramidField): readonly FateDefaultSkill[] {
  return source.defaultSkills ?? DEFAULT_FATE_SKILLS;
}

function fateData(source: FateSkillPyramidField, ctx: RowSelectorContext): FateSkillsData {
  const raw = ctx.data[source.id] as FateSkillsData | undefined;
  return { ...raw, skills: Array.isArray(raw?.skills) ? raw.skills : [] };
}

/** 與 fate-skill-pyramid renderer 同一套排序：存過的順序優先，其餘接在後面 */
function fateOrderedIds(source: FateSkillPyramidField, data: FateSkillsData): string[] {
  const defaultIds = fateDefaults(source).map((s) => s.id);
  const customIds = data.skills.map((s) => s.id).filter((id) => !defaultIds.includes(id));
  const all = [...defaultIds, ...customIds];
  if (data.skillOrder && data.skillOrder.length > 0) {
    const valid = new Set(all);
    const ordered = data.skillOrder.filter((id) => valid.has(id));
    return [...ordered, ...all.filter((id) => !ordered.includes(id))];
  }
  return all;
}

function fateName(
  source: FateSkillPyramidField,
  ctx: RowSelectorContext,
  data: FateSkillsData,
  id: string,
): string {
  const saved = data.skills.find((s) => s.id === id);
  if (saved?.name) return saved.name;
  const fallback = fateDefaults(source).find((s) => s.id === id);
  if (fallback) {
    const key = `${source.skillI18nPrefix ?? "skill"}.${id}`;
    const resolved = ctx.resolveI18n(`{{i18n:${key}}}`);
    return resolved !== key ? resolved : fallback.name;
  }
  return id;
}

function formatLevel(level: number): string {
  return level > 0 ? `+${level}` : String(level);
}

const fateSkillPyramidSelector: RowSelector<FateSkillPyramidField> = {
  regroupsOnValue: true,

  rows(source, ctx) {
    const data = fateData(source, ctx);
    const rows: StatRow[] = fateOrderedIds(source, data).map((id) => {
      const level = data.skills.find((s) => s.id === id)?.level ?? 0;
      const name = fateName(source, ctx, data, id);
      return {
        id,
        name,
        label: name,
        group: String(level),
        value: level,
        level,
      };
    });

    // 等級高的在前；同等級保留原本的順序（Array.sort 是穩定排序）
    rows.sort((a, b) => b.level! - a.level!);
    const levels = [...new Set(rows.map((row) => row.level!))];
    return {
      rows,
      groups: levels.map((level) => ({ id: String(level), label: formatLevel(level) })),
    };
  },

  setRow(source, ctx, rowId, patch) {
    const data = fateData(source, ctx);
    if (patch.value === undefined) return {};
    const level = patch.value;
    const existing = data.skills.find((s) => s.id === rowId);
    const isDefault = fateDefaults(source).some((s) => s.id === rowId);

    // 與 renderer 的 handleLevelChange 相同
    let skills: FateSkillPyramidSkill[];
    if (level === 0 && !existing?.name && isDefault) {
      skills = data.skills.filter((s) => s.id !== rowId);
    } else if (existing) {
      skills = data.skills.map((s) => (s.id === rowId ? { ...s, level } : s));
    } else {
      skills = [...data.skills, { id: rowId, name: fateName(source, ctx, data, rowId), level }];
    }
    return { [source.id]: { ...data, skills } };
  },
};

registerRowSelector<FateSkillPyramidField>("fate-skill-pyramid", fateSkillPyramidSelector);

// ============================================================================
// list（通用 List）
// ============================================================================

function listNumber(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "object" && raw !== null) {
    const nested = (raw as { value?: unknown }).value;
    if (typeof nested === "number" && Number.isFinite(nested)) return nested;
  }
  return undefined;
}

/**
 * 通用 List 沒有宣告哪一格是名稱、哪一格是數值，所以依列範本推：
 * 第一個 text 欄位是名稱，第一個 number／attribute 欄位是數值。
 */
function listFieldKeys(source: ListField): { name?: string; value?: string } {
  const children = source.rowTemplate?.children ?? [];
  return {
    name: children.find((child) => child.type === "text")?.id,
    value: children.find((child) => child.type === "number" || child.type === "attribute")?.id,
  };
}

function listEntries(source: ListField, ctx: RowSelectorContext): Record<string, unknown>[] {
  const raw = ctx.data[source.id];
  return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
}

const listSelector: RowSelector<ListField> = {
  rows(source, ctx) {
    const keys = listFieldKeys(source);
    const rows: StatRow[] = [];
    for (const entry of listEntries(source, ctx)) {
      const id = typeof entry.id === "string" ? entry.id : undefined;
      if (id === undefined) continue;
      const rawName = keys.name ? entry[keys.name] : undefined;
      const name = typeof rawName === "string" && rawName !== "" ? rawName : id;
      const value = (keys.value ? listNumber(entry[keys.value]) : undefined) ?? 0;
      rows.push({
        id,
        name,
        label: name,
        group: "all",
        value,
        half: Math.floor(value / 2),
        fifth: Math.floor(value / 5),
      });
    }
    return { rows, groups: [{ id: "all", label: "" }] };
  },

  setRow(source, ctx, rowId, patch) {
    const keys = listFieldKeys(source);
    if (patch.value === undefined || !keys.value) return {};
    const valueKey = keys.value;
    const next = listEntries(source, ctx).map((entry) => {
      if (entry.id !== rowId) return entry;
      const current = entry[valueKey];
      const written =
        typeof current === "object" && current !== null
          ? { ...(current as Record<string, unknown>), value: patch.value }
          : patch.value;
      return { ...entry, [valueKey]: written };
    });
    return { [source.id]: next };
  },
};

registerRowSelector<ListField>("list", listSelector);
