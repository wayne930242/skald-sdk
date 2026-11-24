// modules/character/ui/renderer/stat-tile.tsx
//
// `display: "tile"`：attribute／number／computed 欄位的磚狀呈現。
// 有 roll 時整塊可點（點一下就擲；長按、右鍵開擲骰選項）；編輯模式改成輸入框，擲骰退成旁邊的小鈕。
"use client";

import * as React from "react";
import { Dices, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RollConfigShorthand } from "@skald/types/schema";
import { useFieldRollGesture, type FieldRollAction } from "@skald/sheet-sdk/modules/rolls/ui/field/use-field-roll-gesture";
import { useFieldInputTarget } from "@skald/sheet-sdk/modules/rolls/ui/field/rollable-field";
import { useRollInteractionMode } from "@skald/sheet-sdk/modules/rolls/ui/context/interaction-mode";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { useRollAction, type RollActionOptions } from "./rollable-field";

/** 支援 tile 顯示的欄位型別 */
export const TILE_FIELD_TYPES: ReadonlySet<string> = new Set([
  "attribute",
  "number",
  "computed",
]);

/**
 * 這個欄位是否以磚呈現。field-renderer（決定要不要包 TileRollScope）與
 * derived-value-field（決定畫磚或一般輸入）必須用同一個判斷，否則會出現
 * 「擲骰被磚接走、但畫的不是磚」而擲不出來的欄位。
 * 衍生值的結果是布林時沒有磚的畫法（核取框），所以不走磚。
 */
export function isTileDisplay(
  display: string | undefined,
  fieldType: string,
  derivedResultType?: string,
): boolean {
  return (
    display === "tile" &&
    TILE_FIELD_TYPES.has(fieldType) &&
    derivedResultType !== "boolean"
  );
}

/** 磚的擲骰動作（rollName 由磚自己帶） */
type TileRollValue = FieldRollAction;

const TileRollContext = React.createContext<TileRollValue | null>(null);

/**
 * 把欄位的 roll 設定接成「點磚就擲」。沿用 RollableField 的擲骰邏輯
 * （巨集解析、dialog）與擲骰鈕的手勢（長按、右鍵開選項；擲骰規則有自己的選項時開它的），
 * 只是觸發的外觀不同，所以 tile 路徑不再包 RollableField。
 */
export function TileRollScope({
  roll,
  label,
  rollKey,
  improveTarget,
  children,
}: {
  roll: RollConfigShorthand | string | boolean | undefined;
  label: string | undefined;
  /** 擲後動作規則比對用的欄位或列 id */
  rollKey?: string;
  improveTarget?: RollActionOptions["improveTarget"];
  children: React.ReactNode;
}) {
  const action = useRollAction(roll, label, { rollKey, improveTarget });

  return (
    <TileRollContext.Provider value={action.canRoll ? action : null}>
      {children}
      {action.dialog}
    </TileRollContext.Provider>
  );
}

/** 目前欄位可擲時回傳擲骰設定；沒有 roll 或不在擲骰環境時為 null */
export function useTileRoll(): TileRollValue | null {
  return React.useContext(TileRollContext);
}

function doNothing() {}

/** 半值與五分之一值：只在欄位設定要求時才有 */
export function getTileFractions(
  field: { showHalf?: boolean; showFifth?: boolean },
  value: number | undefined,
): { half?: number; fifth?: number } {
  if (typeof value !== "number" || !Number.isFinite(value)) return {};
  return {
    half: field.showHalf ? Math.floor(value / 2) : undefined,
    fifth: field.showFifth ? Math.floor(value / 5) : undefined,
  };
}

/** 磚的擲骰鈕：整塊磚或編輯模式的小鈕，手勢與其他擲骰鈕相同 */
function TileRollButton({
  tileRoll,
  rollName,
  label,
  className,
  title,
  onEdit,
  editIcon,
  children,
}: {
  tileRoll: TileRollValue;
  /** 選項視窗標題用的屬性名稱 */
  rollName: string;
  /** 按鈕的可及名稱 */
  label: string;
  className: string;
  title?: string;
  /** B-023：編輯模式下點了做什麼（聚焦磚的輸入框）；沒有可編輯的就什麼都不做 */
  onEdit?: () => void;
  /** 編輯模式的小鈕換成鉛筆 */
  editIcon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTranslations("renderer");
  const editMode = useRollInteractionMode() === "edit";
  const inert = editMode && !onEdit;
  const { hasOptions, editing, buttonProps, dialog } = useFieldRollGesture(tileRoll, rollName, {
    onEdit: editMode ? (onEdit ?? doNothing) : undefined,
  });
  const edits = editing && !inert;
  return (
    <>
      <button
        type="button"
        className={cn(
          className,
          // 長按不能選到文字、叫出 iOS 的放大鏡／選單；touch-action 保留捲動
          hasOptions && "touch-manipulation select-none [-webkit-touch-callout:none]",
        )}
        aria-label={edits ? t("editValue", { name: rollName }) : label}
        aria-disabled={inert || undefined}
        title={title}
        {...buttonProps}
      >
        {edits && editIcon ? editIcon : children}
      </button>
      {dialog}
    </>
  );
}

export interface StatTileProps {
  label: string;
  /** 顯示用的數值文字；空值時顯示佔位 */
  valueText: string;
  half?: number;
  fifth?: number;
  /** 編輯模式的輸入元件；有值時取代數值顯示 */
  input?: React.ReactNode;
  /** 磚旁的附加動作（例如衍生值的重新計算鈕） */
  extra?: React.ReactNode;
  title?: string;
  fieldId?: string;
  className?: string;
}

export function StatTile({
  label,
  valueText,
  half,
  fifth,
  input,
  extra,
  title,
  fieldId,
  className,
}: StatTileProps) {
  const t = useTranslations("renderer");
  const tileRoll = useTileRoll();
  // B-023：編輯模式下骰子鈕聚焦磚的輸入框
  const tileRef = React.useRef<HTMLDivElement>(null);
  const focusInput = useFieldInputTarget(tileRef, useRollInteractionMode() === "edit" && !!input);
  const shownValue = valueText === "" ? t("tileEmptyValue") : valueText;

  const fractions =
    half !== undefined || fifth !== undefined ? (
      <span className="skald-tile-fractions">
        {half !== undefined && (
          <span title={t("tileHalf")}>
            <span aria-hidden="true">½</span> {half}
          </span>
        )}
        {fifth !== undefined && (
          <span title={t("tileFifth")}>
            <span aria-hidden="true">⅕</span> {fifth}
          </span>
        )}
      </span>
    ) : null;

  const labelNode = <span className="skald-tile-label">{label}</span>;

  const rollName = t("rollTile", { label, value: shownValue });

  // 遊玩模式：整塊就是擲骰鈕
  if (tileRoll && !input) {
    return (
      <div className={cn("skald-tile", className)} data-tile-field={fieldId}>
        <TileRollButton
          tileRoll={tileRoll}
          rollName={label}
          label={rollName}
          className="skald-tile-surface skald-tile-roll"
          title={title}
        >
          {labelNode}
          <span className="skald-tile-value">{shownValue}</span>
          {fractions}
          <Dices className="skald-tile-icon" aria-hidden="true" />
        </TileRollButton>
        {extra}
      </div>
    );
  }

  // 沒有 roll、也沒有輸入框：純顯示
  if (!input) {
    return (
      <div className={cn("skald-tile", className)} data-tile-field={fieldId}>
        <div className="skald-tile-surface" title={title}>
          {labelNode}
          <span className="skald-tile-value">{shownValue}</span>
          {fractions}
        </div>
        {extra}
      </div>
    );
  }

  // 編輯模式：輸入框為主，擲骰退成旁邊的小鈕
  return (
    <div ref={tileRef} className={cn("skald-tile", className)} data-tile-field={fieldId}>
      <div className="skald-tile-surface" title={title}>
        {labelNode}
        <div className="skald-tile-edit-row">
          {input}
          {tileRoll && (
            <TileRollButton
              tileRoll={tileRoll}
              rollName={label}
              label={rollName}
              className="skald-tile-mini-roll"
              onEdit={focusInput}
              editIcon={<Pencil className="size-4" aria-hidden="true" />}
            >
              <Dices className="size-4" aria-hidden="true" />
            </TileRollButton>
          )}
        </div>
        {fractions}
      </div>
      {extra}
    </div>
  );
}

/** 磚內的文字輸入（編輯模式；衍生值的結果是文字時用） */
export function TileTextInput({
  label,
  value,
  readOnly,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  const t = useTranslations("renderer");
  return (
    <input
      type="text"
      className="skald-tile-input"
      aria-label={t("tileValueInput", { label })}
      value={value}
      readOnly={readOnly}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    />
  );
}

/** 磚內的數字輸入（編輯模式） */
export function TileNumberInput({
  label,
  value,
  min,
  max,
  readOnly,
  onChange,
  onBlur,
}: {
  label: string;
  value: number | undefined | null;
  min?: number;
  max?: number;
  readOnly?: boolean;
  onChange: (value: number) => void;
  onBlur?: () => void;
}) {
  const t = useTranslations("renderer");
  return (
    <input
      type="number"
      inputMode="numeric"
      className="skald-tile-input"
      aria-label={t("tileValueInput", { label })}
      value={value ?? ""}
      min={min}
      max={max}
      readOnly={readOnly}
      onChange={(event) => {
        const parsed = Number.parseInt(event.target.value, 10);
        onChange(Number.isNaN(parsed) ? 0 : parsed);
      }}
      onBlur={onBlur}
    />
  );
}
