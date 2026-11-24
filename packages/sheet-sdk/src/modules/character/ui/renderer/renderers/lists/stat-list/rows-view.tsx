"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import type { StatListColumn, StatListField, StatListFilter } from "@skald/types/schema";
import { type RowSelector, type StatRow } from "../../../row-selectors";
import { resolveResponsive, type useSheetBreakpoint } from "../../../sheet-breakpoint";
import {
  DEFAULT_STAT_LIST_FILTERS,
  countStatRows,
  groupStatRows,
  isSearchShortcut,
  visibleStatRows,
  type StatRowSection,
} from "../../../utils/stat-list-view";
import { StatRowItem } from "./stat-row-item";
import type { WriteRow } from "./stat-row-roll";

/** 欄寬；name 吃剩下的空間 */
const COLUMN_WIDTH: Record<StatListColumn, string> = {
  improve: "1.75rem",
  base: "2.25rem",
  value: "3.25rem",
  half: "2rem",
  fifth: "2rem",
};

const ROLL_COLUMN_WIDTH = "2.5rem";

interface RowsViewProps {
  field: StatListField;
  selector: RowSelector;
  rows: StatRow[];
  groups: ReturnType<RowSelector["rows"]>["groups"];
  groupBy: "category" | "none";
  columns: StatListColumn[];
  pinned: ReadonlySet<string>;
  breakpoint: ReturnType<typeof useSheetBreakpoint>;
  canRoll: boolean;
  editable: boolean;
  anyImprovable: boolean;
  onWrite: WriteRow;
  /** 永遠寫到最新資料；擲骰後自動勾「可成長」用 */
  onWriteLatest: WriteRow;
  onFlush: () => void;
  onTogglePin: (rowId: string) => void;
}

export function RowsView({
  field,
  selector,
  rows,
  groups,
  groupBy,
  columns,
  pinned,
  breakpoint,
  canRoll,
  editable,
  anyImprovable,
  onWrite,
  onWriteLatest,
  onFlush,
  onTogglePin,
}: RowsViewProps) {
  const t = useTranslations("renderer");
  const [filter, setFilter] = React.useState<StatListFilter>("all");
  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);

  const filters = React.useMemo(
    () =>
      (field.filters ?? DEFAULT_STAT_LIST_FILTERS).filter(
        (id) => id !== "improvable" || anyImprovable,
      ),
    [field.filters, anyImprovable],
  );
  const showChips = filters.length > 1;
  const searchable = field.searchable !== false;
  const counts = React.useMemo(() => countStatRows(rows, pinned), [rows, pinned]);

  // 篩選設定改掉（或目前的篩選被拿掉）時，退回第一個可用的
  const activeFilter = filters.includes(filter) ? filter : (filters[0] ?? "all");

  const shown = React.useMemo(
    () => visibleStatRows(rows, activeFilter, query, pinned),
    [rows, activeFilter, query, pinned],
  );
  const sections = React.useMemo(
    () => groupStatRows(shown, groups, groupBy),
    [shown, groups, groupBy],
  );

  // `/` 聚焦搜尋：輸入中不攔截；分頁隱藏（沒有版面）的清單不搶焦點
  React.useEffect(() => {
    if (!searchable) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const input = searchRef.current;
      // checkVisibility 排除 display:none（例如被切走的分頁）；舊瀏覽器沒有就當作看得到
      if (!input || input.checkVisibility?.() === false) return;
      if (!isSearchShortcut(event)) return;
      event.preventDefault();
      input.focus();
      input.select();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [searchable]);

  const flow = resolveResponsive(field.flow, breakpoint ?? "base")?.columns ?? 1;
  const gridTemplate = [
    ...columns.filter((c) => c === "improve").map((c) => COLUMN_WIDTH[c]),
    "minmax(0, 1fr)",
    ...columns.filter((c) => c !== "improve").map((c) => COLUMN_WIDTH[c]),
    ...(canRoll ? [ROLL_COLUMN_WIDTH] : []),
  ].join(" ");
  const style = {
    "--stat-cols": String(Math.max(1, Math.floor(flow))),
    "--stat-grid": gridTemplate,
  } as React.CSSProperties;

  const chipLabel: Record<StatListFilter, string> = {
    pinned: t("statListFilterPinned"),
    improvable: t("statListFilterImproved"),
    all: t("statListFilterAll"),
  };

  const emptyMessage =
    query.trim() !== ""
      ? t("statListNoMatches")
      : activeFilter === "pinned"
        ? t("statListNoPinned")
        : activeFilter === "improvable"
          ? t("statListNoImproved")
          : t("statListNoRows");

  return (
    <div
      className="skald-stat-list"
      data-stat-list={field.id}
      data-display="rows"
      data-flow-columns={style["--stat-cols" as keyof typeof style]}
      style={style}
    >
      {(field.label || searchable || showChips) && (
        <div className="skald-stat-toolbar">
          {field.label && field.labelPosition !== "hidden" && (
            <h3 className="skald-stat-title">{field.label}</h3>
          )}
          {searchable && (
            <label className="skald-stat-search">
              <Search className="skald-stat-search-icon" aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                autoComplete="off"
                className="skald-stat-search-input"
                aria-label={t("statListSearchLabel")}
                placeholder={t("statListSearchPlaceholder")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  if (query !== "") setQuery("");
                  else event.currentTarget.blur();
                }}
              />
              <kbd className="skald-stat-search-key" aria-hidden="true">
                /
              </kbd>
            </label>
          )}
          {showChips && (
            <div className="skald-stat-chips" role="group" aria-label={t("statListFilters")}>
              {filters.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="skald-stat-chip"
                  data-filter={id}
                  aria-pressed={activeFilter === id}
                  onClick={() => setFilter(id)}
                >
                  {chipLabel[id]}
                  <span className="skald-stat-chip-count">{counts[id]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {sections.length === 0 ? (
        <p className="skald-stat-empty" role="status">
          {emptyMessage}
        </p>
      ) : (
        <div className="skald-stat-body">
          {sections.map((section) => (
            <StatSection
              key={section.group.id}
              section={section}
              field={field}
              selector={selector}
              columns={columns}
              pinned={pinned}
              regroupsOnValue={selector.regroupsOnValue === true}
              canRoll={canRoll}
              editable={editable}
              onWrite={onWrite}
              onWriteLatest={onWriteLatest}
              onFlush={onFlush}
              onTogglePin={onTogglePin}
            />
          ))}
        </div>
      )}

      {canRoll && editable && columns.includes("improve") && (
        <p className="skald-stat-hint">{t("statListHint")}</p>
      )}
    </div>
  );
}

interface StatSectionProps {
  section: StatRowSection;
  field: StatListField;
  selector: RowSelector;
  columns: StatListColumn[];
  pinned: ReadonlySet<string>;
  regroupsOnValue: boolean;
  canRoll: boolean;
  editable: boolean;
  onWrite: WriteRow;
  onWriteLatest: WriteRow;
  onFlush: () => void;
  onTogglePin: (rowId: string) => void;
}

function StatSection({
  section,
  field,
  selector,
  columns,
  pinned,
  regroupsOnValue,
  canRoll,
  editable,
  onWrite,
  onWriteLatest,
  onFlush,
  onTogglePin,
}: StatSectionProps) {
  const t = useTranslations("renderer");
  const headerLabel: Record<Exclude<StatListColumn, "improve">, string> = {
    base: t("statListColumnBase"),
    value: t("statListColumnValue"),
    half: "½",
    fifth: "⅕",
  };
  const headerTitle: Partial<Record<StatListColumn, string>> = {
    half: t("statListColumnHalf"),
    fifth: t("statListColumnFifth"),
  };

  return (
    <section
      className="skald-stat-group"
      data-group-id={section.group.id}
      aria-label={section.group.label || undefined}
    >
      <div className="skald-stat-group-header">
        {columns.includes("improve") && (
          <span data-column="improve">
            <span className="sr-only">{t("statListColumnImprove")}</span>
          </span>
        )}
        <span className="skald-stat-group-title">{section.group.label}</span>
        {columns
          .filter((column): column is Exclude<StatListColumn, "improve"> => column !== "improve")
          .map((column) => (
            <span
              key={column}
              className="skald-stat-column-label"
              data-column={column}
              title={headerTitle[column]}
            >
              {headerLabel[column]}
            </span>
          ))}
        {canRoll && <span aria-hidden="true" />}
      </div>
      <ul className="skald-stat-rows">
        {section.rows.map((row) => (
          <StatRowItem
            key={row.id}
            field={field}
            selector={selector}
            row={row}
            columns={columns}
            pinned={pinned.has(row.id)}
            regroupsOnValue={regroupsOnValue}
            showRoll={canRoll}
            editable={editable}
            onWrite={onWrite}
            onWriteLatest={onWriteLatest}
            onFlush={onFlush}
            onTogglePin={onTogglePin}
          />
        ))}
      </ul>
    </section>
  );
}
