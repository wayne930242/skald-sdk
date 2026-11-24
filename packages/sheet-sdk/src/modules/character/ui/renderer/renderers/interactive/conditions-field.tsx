// modules/character/ui/renderer/renderers/interactive/conditions-field.tsx
//
// `conditions`：一排可勾選的狀況，勾選寫入 `data[item.id]`（布林）。
// 項目的 `suggest` 公式由發布流程編成隱藏的 derived 公式；建議成立且尚未勾選時，
// 項目旁顯示虛線的「建議勾選」提示。提示永遠不會自動勾選，也不受 Refresh UI 影響。
// 上游衍生值的覆寫照常生效；只有建議目標自己的覆寫 key 會被忽略。
//
// 勾選框自己畫（button role="checkbox"）而不是原生 input：原生核取方塊在深色主題
// 下不吃主題色（U-06）。
"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ConditionsField } from "@skald/types/schema";
import {
  useFieldBlur,
  useFieldSetter,
  useSchemaData,
  useSchemaStatic,
} from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@skald/sheet-sdk/components/ui/tooltip";
import { evaluateCharacterFormulaRuntime } from "@skald/sheet-sdk/modules/sheet-schema";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import {
  conditionSuggestTargetId,
  isConditionChecked,
  shouldSuggestCondition,
  suggestingItems,
} from "@skald/sheet-sdk/modules/character/domain/sheets/conditions";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import "./conditions-field.css";

/** 各項目的建議是否成立（itemId → boolean）。沒有發布過的公式時為空 */
function useConditionSuggestions(field: ConditionsField): Record<string, boolean> {
  const data = useSchemaData();
  const { formulaRuntime } = useSchemaStatic();
  return React.useMemo(() => {
    const suggesting = suggestingItems(field);
    if (!formulaRuntime || suggesting.length === 0) return {};
    // 上游衍生值的覆寫要保留（建議才會和畫面上看到的值一致）；只丟掉建議目標自己的 key
    const suggestTargets = new Set(
      suggesting.map((item) => conditionSuggestTargetId(field.id, item.id)),
    );
    const derivedOverrides = Object.fromEntries(
      Object.entries(formulaRuntime.derivedOverrides).filter(
        ([key]) => !suggestTargets.has(key),
      ),
    );
    const result = evaluateCharacterFormulaRuntime(
      { ...formulaRuntime, derivedOverrides },
      data,
    );
    return Object.fromEntries(
      suggesting.map((item) => [
        item.id,
        result.derivedValues[conditionSuggestTargetId(field.id, item.id)] === true,
      ]),
    );
  }, [field, formulaRuntime, data]);
}

/**
 * 「建議勾選」提示。是 button：可聚焦，觸控時點一下也能開說明（Tooltip 本身只認
 * hover／focus）。說明文字另外以 sr-only 節點提供給勾選框當 aria-describedby。
 */
function SuggestHint({ descriptionId }: { descriptionId: string }) {
  const t = useTranslations("renderer");
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <span id={descriptionId} className="sr-only">
        {t("conditionsSuggest")}. {t("conditionsSuggestTooltip")}
      </span>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="skald-condition-hint"
            data-condition-hint=""
            onClick={(event) => {
              // 擋掉 Radix 在 click 時關閉 tooltip 的行為，改成切換
              event.preventDefault();
              setOpen((current) => !current);
            }}
          >
            {t("conditionsSuggest")}
          </button>
        </TooltipTrigger>
        <TooltipContent>{t("conditionsSuggestTooltip")}</TooltipContent>
      </Tooltip>
    </>
  );
}

export function ConditionsFieldRenderer({
  field,
}: FieldRendererProps<ConditionsField>) {
  const { editable, viewMode } = useSchemaStatic();
  const { resolveI18n } = useSchemaI18n();
  const data = useSchemaData();
  const setValue = useFieldSetter();
  const onBlur = useFieldBlur();
  const suggestions = useConditionSuggestions(field);
  const idBase = React.useId();

  const isPrint = viewMode === "print";
  const items = Array.isArray(field.items) ? field.items : [];
  const label = field.label ? resolveI18n(field.label) : "";
  const style =
    typeof field.columns === "number" && field.columns > 1
      ? ({ "--cond-cols": String(Math.floor(field.columns)) } as React.CSSProperties)
      : undefined;

  const toggle = (itemId: string, checked: boolean) => {
    if (!editable) return;
    setValue(itemId, !checked);
    onBlur?.();
  };

  return (
    <div
      className="skald-conditions"
      data-conditions-id={field.id}
      data-view-mode={isPrint ? "print" : undefined}
      role="group"
      aria-label={label || field.id}
    >
      {field.labelPosition !== "hidden" && label && (
        <span className="skald-conditions-label">{label}</span>
      )}
      <ul className="skald-conditions-list" style={style}>
        {items.map((item) => {
          const checked = isConditionChecked(data[item.id]);
          const suggested =
            editable && !isPrint && shouldSuggestCondition(suggestions[item.id], data[item.id]);
          const hintId = `${idBase}-${item.id}-suggest`;
          return (
            <li
              key={item.id}
              className="skald-condition"
              data-condition-id={item.id}
              data-checked={checked ? "true" : "false"}
              data-suggested={suggested ? "true" : undefined}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                aria-disabled={editable ? undefined : true}
                aria-describedby={suggested ? hintId : undefined}
                disabled={!editable}
                className="skald-condition-toggle"
                onClick={() => toggle(item.id, checked)}
              >
                <span className="skald-condition-box" aria-hidden="true">
                  <Check className="skald-condition-tick" strokeWidth={3} />
                </span>
                <span className="skald-condition-label">
                  {resolveI18n(item.label)}
                </span>
              </button>
              {suggested && <SuggestHint descriptionId={hintId} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

registerFieldRenderer("conditions", ConditionsFieldRenderer);
