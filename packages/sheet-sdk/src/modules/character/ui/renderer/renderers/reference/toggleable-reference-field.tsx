// modules/character/ui/renderer/renderers/reference/toggleable-reference-field.tsx
//
// 可切換的參考清單：項目取自系統資料，啟用狀態寫入角色資料。
//
// 取代 conditions-reference 與 status-effects-reference——兩者都是「從系統資料
// 讀一份項目清單、逐項勾選、勾選狀態存回角色」，差異僅在資料的屬性名、是否分組、
// 儲存形態，以及是否在旁邊常駐顯示說明。這些差異全部可由 schema 表達。
"use client";

import * as React from "react";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { ToggleableReferenceField } from "@skald/types/schema";
import { useFieldValue, useFieldSetter, useSchema } from "../../schema-context";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import { useSystemOptional } from "@skald/sheet-sdk/components/providers/system-provider";
import { Checkbox } from "@skald/sheet-sdk/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@skald/sheet-sdk/components/ui/tooltip";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { EmptyReference } from "./empty-reference";

/** 系統資料中的參考項目；屬性名由 schema 指定，故以索引簽章讀取 */
interface ReferenceItem {
  id: string;
  [key: string]: unknown;
}

/** 多語字串：系統資料以 { en, zh-TW } 形式儲存 */
type LocalizedText = string | Record<string, string> | undefined;

function localize(text: LocalizedText, locale: string): string {
  if (!text) return "";
  if (typeof text === "string") return text;
  return text[locale] || text.en || "";
}

/** 依 "a.b.c" 路徑取值 */
function resolvePath(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => {
    if (node === null || typeof node !== "object") return undefined;
    return (node as Record<string, unknown>)[key];
  }, root);
}

function isItemArray(value: unknown): value is ReferenceItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) => typeof item === "object" && item !== null && "id" in item,
    )
  );
}

/** 來源資料整理為「分組鍵對項目」的順序化清單；flat 來源視為單一無名分組 */
function toGroups(
  source: unknown,
  shape: ToggleableReferenceField["sourceShape"],
  filter: string | undefined,
): Array<{ key: string; items: ReferenceItem[] }> {
  if (shape === "grouped") {
    if (source === null || typeof source !== "object") return [];
    return Object.entries(source as Record<string, unknown>)
      .filter(([key]) => filter === undefined || key === filter)
      .filter(([, items]) => isItemArray(items) && items.length > 0)
      .map(([key, items]) => ({ key, items: items as ReferenceItem[] }));
  }

  if (!isItemArray(source) || source.length === 0) return [];
  return [{ key: "", items: source }];
}

export function ToggleableReferenceFieldRenderer({
  field,
}: FieldRendererProps<ToggleableReferenceField>) {
  const { locale, t } = useSchemaI18n();
  const system = useSystemOptional();
  const { editable } = useSchema();
  const setValue = useFieldSetter();
  const stored = useFieldValue<Record<string, boolean> | string[]>(
    field.valuePath,
  );

  const groups = React.useMemo(
    () =>
      toGroups(
        resolvePath(system?.gameData, field.source),
        field.sourceShape,
        field.filter,
      ),
    [system, field.source, field.sourceShape, field.filter],
  );

  const isArrayStorage = field.storage === "array";
  const activeList = React.useMemo(
    () => (isArrayStorage && Array.isArray(stored) ? stored : []),
    [isArrayStorage, stored],
  );
  const activeMap = React.useMemo(
    () =>
      !isArrayStorage && stored !== null && typeof stored === "object"
        ? (stored as Record<string, boolean>)
        : {},
    [isArrayStorage, stored],
  );

  const isActive = (id: string) =>
    isArrayStorage ? activeList.includes(id) : Boolean(activeMap[id]);

  const handleToggle = (id: string) => {
    if (!editable) return;

    if (isArrayStorage) {
      setValue(
        field.valuePath,
        activeList.includes(id)
          ? activeList.filter((active) => active !== id)
          : [...activeList, id],
      );
      return;
    }

    setValue(field.valuePath, { ...activeMap, [id]: !activeMap[id] });
  };

  if (groups.length === 0) {
    // 分開兩種：來源沒填是作者還沒設定，來源填了卻空是路徑指錯或系統沒這份資料
    return (
      <EmptyReference>
        {field.source
          ? t("toggleableReference.noData", { source: field.source })
          : t("toggleableReference.noSource")}
      </EmptyReference>
    );
  }

  const isFull = field.displayStyle === "full";
  const labelPath = field.labelPath ?? "name";

  const renderItem = (item: ReferenceItem) => {
    const active = isActive(item.id);
    const trigger = (
      <label
        className={cn(
          "flex items-center cursor-pointer",
          isFull ? "gap-1.5 text-sm" : "gap-1",
          !editable && "cursor-default",
        )}
      >
        <Checkbox
          checked={active}
          onCheckedChange={() => handleToggle(item.id)}
          disabled={!editable}
          className={isFull ? "h-4 w-4" : "h-3 w-3"}
        />
        <span className={cn(active && "font-medium")}>
          {localize(item[labelPath] as LocalizedText, locale)}
        </span>
      </label>
    );

    if (!field.tooltipPath) {
      return <React.Fragment key={item.id}>{trigger}</React.Fragment>;
    }

    return (
      <Tooltip key={item.id}>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {field.tooltipPrefix && (
            <span className="font-medium">{t(field.tooltipPrefix)}</span>
          )}
          {localize(item[field.tooltipPath] as LocalizedText, locale)}
        </TooltipContent>
      </Tooltip>
    );
  };

  const checkboxes = (
    <div
      className={cn(
        "flex flex-wrap items-center",
        isFull ? "gap-x-3 gap-y-1" : "gap-x-2 gap-y-1 text-xs",
      )}
    >
      {groups.map((group, groupIndex) => (
        <React.Fragment key={group.key || "default"}>
          {groupIndex > 0 && (
            <span className="text-muted-foreground mx-1">|</span>
          )}
          {field.groupLabels?.[group.key] && (
            <span className="text-muted-foreground text-2xs">
              {t(field.groupLabels[group.key]!)}
            </span>
          )}
          {group.items.map(renderItem)}
        </React.Fragment>
      ))}
    </div>
  );

  if (!isFull || !field.detailPath) {
    return <TooltipProvider>{checkboxes}</TooltipProvider>;
  }

  const detailPath = field.detailPath;

  return (
    <TooltipProvider>
      {/* 頂端對齊：說明有幾行由資料決定，置中會讓勾選欄浮在半空 */}
      <div className="flex items-start gap-4">
        {checkboxes}
        {/* 常駐說明：不受勾選狀態影響，僅以透明度區分 */}
        <div className="text-xs text-muted-foreground space-y-0.5 border-l pl-3">
          {groups.flatMap((group) =>
            group.items.map((item) => {
              const active = isActive(item.id);
              return (
                <div key={item.id} className={cn(!active && "opacity-50")}>
                  <span
                    className={cn("font-medium", active && "text-foreground")}
                  >
                    {localize(item[labelPath] as LocalizedText, locale)}:
                  </span>{" "}
                  {localize(item[detailPath] as LocalizedText, locale)}
                </div>
              );
            }),
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

registerFieldRenderer(
  "toggleable-reference",
  ToggleableReferenceFieldRenderer,
);
