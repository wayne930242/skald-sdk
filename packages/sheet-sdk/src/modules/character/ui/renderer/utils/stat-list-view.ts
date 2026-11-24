// modules/character/ui/renderer/utils/stat-list-view.ts
//
// `stat-list` 的檢視邏輯：篩選、搜尋、分組、列印分欄、`/` 快捷鍵的判斷。
// 純函式，不碰 React。
import type { StatListFilter } from "@skald/types/schema";
import type { StatGroup, StatRow } from "../row-selectors";

export const DEFAULT_STAT_LIST_FILTERS: readonly StatListFilter[] = [
  "pinned",
  "improvable",
  "all",
];

/** 列的搜尋文字：顯示名稱、原始名稱、專門技能的父名稱與專門名稱 */
function searchText(row: StatRow): string {
  return [row.label, row.name, row.parentLabel, row.specName]
    .filter((part): part is string => !!part)
    .join(" ")
    .toLowerCase();
}

export function matchesQuery(row: StatRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle === "" || searchText(row).includes(needle);
}

/** `include` 省略＝全部；有值就只留這些列 */
export function applyInclude(rows: StatRow[], include: readonly string[] | undefined): StatRow[] {
  if (!include) return rows;
  const wanted = new Set(include);
  return rows.filter((row) => wanted.has(row.id));
}

export function matchesFilter(
  row: StatRow,
  filter: StatListFilter,
  pinned: ReadonlySet<string>,
): boolean {
  if (filter === "pinned") return pinned.has(row.id);
  // 「可成長」＝已勾選成長標記的列
  if (filter === "improvable") return row.improved === true;
  return true;
}

export interface StatListCounts {
  pinned: number;
  improvable: number;
  all: number;
}

/** chip 上的數字：不受搜尋影響 */
export function countStatRows(rows: StatRow[], pinned: ReadonlySet<string>): StatListCounts {
  return {
    pinned: rows.filter((row) => pinned.has(row.id)).length,
    improvable: rows.filter((row) => row.improved === true).length,
    all: rows.length,
  };
}

export function visibleStatRows(
  rows: StatRow[],
  filter: StatListFilter,
  query: string,
  pinned: ReadonlySet<string>,
): StatRow[] {
  return rows.filter((row) => matchesFilter(row, filter, pinned) && matchesQuery(row, query));
}

export interface StatRowSection {
  group: StatGroup;
  rows: StatRow[];
}

/** 依來源的分組順序分段；沒有列的分組略過。`none` 把全部放成一段無標題的區塊 */
export function groupStatRows(
  rows: StatRow[],
  groups: StatGroup[],
  groupBy: "category" | "none",
): StatRowSection[] {
  if (groupBy === "none") {
    return rows.length > 0 ? [{ group: { id: "all", label: "" }, rows }] : [];
  }
  const sections: StatRowSection[] = [];
  const placed = new Set<string>();
  for (const group of groups) {
    const members = rows.filter((row) => row.group === group.id);
    if (members.length === 0) continue;
    sections.push({ group, rows: members });
    for (const row of members) placed.add(row.id);
  }
  // 來源沒宣告的分組不能讓列憑空消失
  const orphans = rows.filter((row) => !placed.has(row.id));
  if (orphans.length > 0) {
    sections.push({ group: { id: "other", label: "" }, rows: orphans });
  }
  return sections;
}

export function togglePinned(current: readonly string[], rowId: string): string[] {
  return current.includes(rowId)
    ? current.filter((id) => id !== rowId)
    : [...current, rowId];
}

// ---------------------------------------------------------------------------
// 列印：顯式分欄，每欄底部補空白列
// ---------------------------------------------------------------------------

export type PrintItem =
  | { kind: "header"; group: StatGroup }
  | { kind: "row"; row: StatRow }
  | { kind: "blank"; key: string };

/**
 * 把分段攤平（標題＋列）後平均切成 `columns` 欄，每欄底部補 `blankRows` 列空白。
 * 標題不會孤立在欄底：落在欄底的標題移到下一欄的開頭。
 */
export function splitIntoPrintColumns(
  sections: StatRowSection[],
  columns: number,
  blankRows: number,
): PrintItem[][] {
  const count = Math.max(1, Math.floor(columns));
  const items: PrintItem[] = [];
  for (const section of sections) {
    if (section.group.label) items.push({ kind: "header", group: section.group });
    for (const row of section.rows) items.push({ kind: "row", row });
  }

  const perColumn = Math.max(1, Math.ceil(items.length / count));
  const result: PrintItem[][] = Array.from({ length: count }, () => []);
  let column = 0;
  for (const item of items) {
    if (result[column].length >= perColumn && column < count - 1) column += 1;
    result[column].push(item);
  }
  // 標題不孤立在欄底
  for (let c = 0; c < count - 1; c += 1) {
    const last = result[c][result[c].length - 1];
    if (last?.kind === "header") result[c + 1].unshift(result[c].pop()!);
  }

  const blanks = Math.max(0, Math.floor(blankRows));
  return result.map((columnItems, index) => [
    ...columnItems,
    ...Array.from({ length: blanks }, (_, n): PrintItem => ({
      kind: "blank",
      key: `blank-${index}-${n}`,
    })),
  ]);
}

// ---------------------------------------------------------------------------
// `/` 聚焦搜尋
// ---------------------------------------------------------------------------

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  defaultPrevented?: boolean;
  target: EventTarget | null;
}

/** 目標是不是會吃字元的地方：輸入框、文字區、選單、contenteditable、帶輸入角色的元件 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  const role = target.getAttribute("role");
  return role === "textbox" || role === "searchbox" || role === "combobox";
}

/** `/` 要不要聚焦搜尋：單獨按下，且不在輸入中、沒有被別人處理過 */
export function isSearchShortcut(event: KeyLike): boolean {
  return (
    event.key === "/" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.defaultPrevented &&
    !isTypingTarget(event.target)
  );
}
