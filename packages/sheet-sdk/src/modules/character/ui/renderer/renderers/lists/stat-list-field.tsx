// modules/character/ui/renderer/renderers/lists/stat-list-field.tsx
//
// `stat-list`：另一個列表欄位（技能列表、Fate 技能金字塔、一般列表）的可擲清單檢視。
// 不擁有資料——列由 `row-selectors` 提供，修改翻成來源欄位的寫入；
// 只有「常用」釘選是自己的資料（`ui.pinned.<欄位 id>`）。
//
// 擲骰一律走 `useRollAction`（與屬性磚、一般欄位同一條路徑），所以擲骰對象與
// 「下一擲」照常生效，這裡沒有第二條擲骰路徑。
"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { Field, StatListColumn, StatListField } from "@skald/types/schema";
import { useSystemOptional } from "@skald/sheet-sdk/components/providers";
import { useSystemPluginUi } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { toPlainJson } from "@skald/sheet-sdk/modules/character/domain/sheets/plain-json";
import { useFieldDisplay } from "../../field-display";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import { useRollOptional } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import {
  getRowSelector,
  type RowPatch,
  type RowSelector,
  type RowSelectorContext,
} from "../../row-selectors";
import {
  useFieldBlur,
  useFieldSetter,
  useSchemaData,
  useSchemaStatic,
} from "../../schema-context";
import { useSheetBreakpoint } from "../../sheet-breakpoint";
import { useSheetMode } from "../../sheet-mode";
import { applyInclude, togglePinned } from "../../utils/stat-list-view";
import { RowsView } from "./stat-list/rows-view";
import { StatTileItem } from "./stat-list/stat-tile-item";
import { PrintView } from "./stat-list/print-view";
import type { WriteRow } from "./stat-list/stat-row-roll";
import "./stat-list-field.css";

const DEFAULT_COLUMNS: readonly StatListColumn[] = ["improve", "base", "value", "half", "fifth"];

function pinnedPath(fieldId: string): string {
  return `ui.pinned.${fieldId}`;
}

function readPinned(data: Record<string, unknown>, fieldId: string): string[] {
  const ui = data.ui as { pinned?: Record<string, unknown> } | undefined;
  const list = ui?.pinned?.[fieldId];
  return Array.isArray(list) ? list.filter((id): id is string => typeof id === "string") : [];
}

export function StatListFieldRenderer({ field }: FieldRendererProps<StatListField>) {
  const { schema } = useSchemaStatic();
  const t = useTranslations("renderer");
  const { rowSelectors } = useSystemPluginUi();
  const source: Field | undefined = schema.fields[field.source];
  const selector = source ? getRowSelector(source.type, rowSelectors) : undefined;

  if (!source || !selector) {
    return (
      <div className="skald-stat-list-error" role="alert" data-stat-list={field.id}>
        {t("statListSourceMissing", { field: field.id, source: field.source })}
      </div>
    );
  }
  return <StatListView field={field} source={source} selector={selector} />;
}

interface ViewProps {
  field: StatListField;
  source: Field;
  selector: RowSelector;
}

function StatListView({ field, source, selector }: ViewProps) {
  const { editable, viewMode } = useSchemaStatic();
  const data = useSchemaData();
  const system = useSystemOptional();
  const { resolveI18n, t: schemaT } = useSchemaI18n();
  const setValue = useFieldSetter();
  const onBlur = useFieldBlur();
  const breakpoint = useSheetBreakpoint();
  const mode = useSheetMode();
  const refDisplay = useFieldDisplay();
  const rollContext = useRollOptional();

  const display = refDisplay === "tiles" || refDisplay === "rows" ? refDisplay : (field.display ?? "rows");
  const groupBy = field.groupBy ?? "category";

  const context = React.useMemo<RowSelectorContext>(
    () => ({ data, system, t: schemaT, resolveI18n }),
    [data, system, schemaT, resolveI18n],
  );
  const selection = React.useMemo(
    () => selector.rows(source, context),
    [selector, source, context],
  );
  const allRows = React.useMemo(
    () => applyInclude(selection.rows, field.include),
    [selection.rows, field.include],
  );

  const pinnedIds = React.useMemo(() => readPinned(data, field.id), [data, field.id]);
  const pinned = React.useMemo(() => new Set(pinnedIds), [pinnedIds]);

  // 打字中的寫入不立刻 flush（每個按鍵一次 flush 會繞過自動儲存的 debounce）：
  // 輸入框離開時才 flush；勾選這類一次性動作寫完就 flush
  const write = React.useCallback(
    (rowId: string, patch: RowPatch, options?: { flush?: boolean; plain?: boolean }) => {
      for (const [path, value] of Object.entries(selector.setRow(source, context, rowId, patch))) {
        setValue(path, options?.plain ? toPlainJson(value) : value);
      }
      if (options?.flush) onBlur?.();
    },
    [selector, source, context, setValue, onBlur],
  );
  const flush = React.useCallback(() => onBlur?.(), [onBlur]);

  // 擲骰結束（3D 動畫之後）才寫的勾要用「那時」的資料，不是按下按鈕那一刻的：
  // 這個穩定的寫入函式永遠呼叫最新一次渲染的 `write`
  const latestWrite = React.useRef(write);
  React.useEffect(() => {
    latestWrite.current = write;
  }, [write]);
  const writeLatest = React.useCallback<WriteRow>(
    (rowId, patch, options) => latestWrite.current(rowId, patch, options),
    [],
  );

  const togglePin = React.useCallback(
    (rowId: string) => {
      setValue(pinnedPath(field.id), (prev: unknown) =>
        togglePinned(Array.isArray(prev) ? (prev as string[]) : [], rowId),
      );
      onBlur?.();
    },
    [setValue, onBlur, field.id],
  );

  // 數值欄：整份清單都沒有的欄位不畫
  const columns = React.useMemo(() => {
    const wanted = field.columns ?? DEFAULT_COLUMNS;
    const has: Record<StatListColumn, boolean> = {
      improve: allRows.some((row) => row.improvable),
      base: allRows.some((row) => row.base !== undefined),
      value: true,
      half: allRows.some((row) => row.half !== undefined),
      fifth: allRows.some((row) => row.fifth !== undefined),
    };
    return wanted.filter((column) => has[column]);
  }, [field.columns, allRows]);
  // 沒有任何列能成長（Fate、一般列表）：「可成長」篩選永遠是 0，不畫
  const anyImprovable = React.useMemo(() => allRows.some((row) => row.improvable), [allRows]);

  if (viewMode === "print") {
    return (
      <PrintView
        field={field}
        rows={allRows}
        groups={selection.groups}
        groupBy={groupBy}
      />
    );
  }

  if (display === "tiles") {
    return (
      <div
        className="skald-stat-tiles"
        data-stat-list={field.id}
        data-display="tiles"
        role="group"
        aria-label={field.label || field.id}
      >
        {allRows.map((row) => (
          <StatTileItem
            key={row.id}
            field={field}
            selector={selector}
            row={row}
            columns={columns}
            editing={editable && mode === "edit"}
            editable={editable}
            onValue={(value) => write(row.id, { value })}
            onWriteLatest={writeLatest}
          />
        ))}
      </div>
    );
  }

  return (
    <RowsView
      field={field}
      selector={selector}
      rows={allRows}
      groups={selection.groups}
      groupBy={groupBy}
      columns={columns}
      pinned={pinned}
      breakpoint={breakpoint}
      canRoll={rollContext !== null}
      editable={editable}
      anyImprovable={anyImprovable}
      onWrite={write}
      onWriteLatest={writeLatest}
      onFlush={flush}
      onTogglePin={togglePin}
    />
  );
}

registerFieldRenderer("stat-list", StatListFieldRenderer);
