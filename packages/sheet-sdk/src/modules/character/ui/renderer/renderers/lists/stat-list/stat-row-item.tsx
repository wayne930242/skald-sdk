"use client";

import * as React from "react";
import { Check, Dices, Pencil, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import type { StatListColumn, StatListField } from "@skald/types/schema";
import { ImeTextInput } from "@skald/sheet-sdk/components/shared/ime-text-input";
import { useRollShortcuts } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-shortcuts";
import { useFieldRollGesture } from "@skald/sheet-sdk/modules/rolls/ui/field/use-field-roll-gesture";
import { useFieldInputTarget } from "@skald/sheet-sdk/modules/rolls/ui/field/rollable-field";
import { useRollInteractionMode } from "@skald/sheet-sdk/modules/rolls/ui/context/interaction-mode";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { useRollAction } from "../../../rollable-field";
import { type RowSelector, type StatRow } from "../../../row-selectors";
import { rollLabel, useRowRoll, useRowImproveTarget, type WriteRow } from "./stat-row-roll";

interface StatRowItemProps {
  field: StatListField;
  selector: RowSelector;
  row: StatRow;
  columns: StatListColumn[];
  pinned: boolean;
  regroupsOnValue: boolean;
  showRoll: boolean;
  editable: boolean;
  onWrite: WriteRow;
  onWriteLatest: WriteRow;
  onFlush: () => void;
  onTogglePin: (rowId: string) => void;
}

export function StatRowItem({
  field,
  selector,
  row,
  columns,
  pinned,
  regroupsOnValue,
  showRoll,
  editable,
  onWrite,
  onWriteLatest,
  onFlush,
  onTogglePin,
}: StatRowItemProps) {
  const t = useTranslations("renderer");
  const { roll, invalid } = useRowRoll(field, selector, row);
  const label = rollLabel(row, t);
  const { rollKey, improveTarget } = useRowImproveTarget(row, editable, onWriteLatest);
  const action = useRollAction(roll, label, { rollKey, improveTarget });
  const { canRoll, trigger, dialog } = action;
  const rollNow = () => void trigger(0);
  // B-023：編輯模式下點名稱或骰子鈕是編輯這一列的現值；沒有可編輯的輸入框時什麼都不做
  const rowRef = React.useRef<HTMLLIElement>(null);
  const editMode = useRollInteractionMode() === "edit";
  const editValue = useFieldInputTarget(rowRef, editMode, ".skald-stat-value-input");
  const inert = editMode && !editValue;
  // 名稱與骰子鈕的手勢和欄位的骰子鈕相同：點一下就擲，長按、右鍵、Shift+Enter 開擲骰選項
  const gesture = useFieldRollGesture(action, label, { onEdit: editMode ? (editValue ?? doNothing) : undefined });

  // 聊天欄的常用技能 chip：和名稱、骰子鈕同一個擲骰函式；點了會先開表單的列要在卡上填，不登記
  const rollNowRef = React.useRef(rollNow);
  React.useEffect(() => {
    rollNowRef.current = rollNow;
  });
  const shortcuts = React.useMemo(
    () =>
      canRoll && !action.tapOpensForm
        ? [{ label, key: rollKey, value: row.value, roll: () => rollNowRef.current() }]
        : null,
    [canRoll, action.tapOpensForm, label, rollKey, row.value],
  );
  useRollShortcuts(shortcuts);

  const improveCell = columns.includes("improve") ? (
    row.improvable ? (
      <button
        type="button"
        role="checkbox"
        aria-checked={row.improved === true}
        aria-label={t("statListImproved", { name: label })}
        aria-disabled={editable ? undefined : true}
        disabled={!editable}
        className="skald-stat-check"
        onClick={() => onWrite(row.id, { improved: !row.improved }, { flush: true })}
      >
        <span className="skald-stat-check-box" aria-hidden="true">
          <Check className="skald-stat-check-tick" strokeWidth={3} />
        </span>
      </button>
    ) : (
      <span aria-hidden="true" />
    )
  ) : null;

  return (
    <li
      ref={rowRef}
      className="skald-stat-row"
      data-row-id={row.id}
      data-pinned={pinned ? "true" : undefined}
      data-improved={row.improved ? "true" : undefined}
      data-roll-invalid={invalid ? "true" : undefined}
      title={invalid ? t("statListRollInvalid") : undefined}
      {...(invalid ? { "aria-description": t("statListRollInvalid") } : {})}
    >
      {improveCell}

      <span className="skald-stat-name">
        {row.parentLabel !== undefined ? (
          <>
            <NameButton enabled={canRoll} label={t("statListParentPrefix", { parent: row.parentLabel })} rollName={label} gesture={gesture} />
            <SpecInput
              row={row}
              editable={editable}
              placeholder={t("statListSpecPlaceholder")}
              ariaLabel={t("statListSpecInput", { parent: row.parentLabel })}
              onCommit={(specName) => onWrite(row.id, { specName })}
              onLeave={onFlush}
            />
          </>
        ) : (
          <NameButton enabled={canRoll} label={row.label} rollName={label} gesture={gesture} />
        )}
        <button
          type="button"
          className="skald-stat-pin"
          aria-pressed={pinned}
          aria-label={pinned ? t("statListUnpin", { name: label }) : t("statListPin", { name: label })}
          disabled={!editable}
          onClick={() => onTogglePin(row.id)}
        >
          <Star className="skald-stat-pin-icon" aria-hidden="true" />
        </button>
      </span>

      {columns
        .filter((column) => column !== "improve")
        .map((column) => (
          <StatCell
            key={column}
            column={column}
            row={row}
            label={label}
            editable={editable}
            commitOnLeave={regroupsOnValue}
            onValue={(value) => onWrite(row.id, { value })}
            onLeave={onFlush}
          />
        ))}

      {showRoll && (
        <span className="skald-stat-roll-cell">
          {canRoll && (
            <button
              type="button"
              className={cn("skald-stat-roll", gesture.hasOptions && LONG_PRESS_CLASS)}
              {...gesture.buttonProps}
              aria-label={gesture.editing && !inert ? t("editValue", { name: label }) : t("statListRoll", { name: label })}
              aria-disabled={inert || undefined}
            >
              {gesture.editing && !inert ? (
                <Pencil className="skald-stat-roll-icon" aria-hidden="true" />
              ) : (
                <Dices className="skald-stat-roll-icon" aria-hidden="true" />
              )}
            </button>
          )}
        </span>
      )}
      {dialog}
      {gesture.dialog}
    </li>
  );
}

function doNothing() {}

// 長按不能選到文字、叫出 iOS 的放大鏡／選單；touch-action 保留捲動
const LONG_PRESS_CLASS = "touch-manipulation select-none [-webkit-touch-callout:none]";

/** 名稱可點、點了就擲；可存取名稱維持畫面上的字（骰子鈕才叫「擲 …」） */
function NameButton({
  enabled,
  label,
  rollName,
  gesture,
}: {
  enabled: boolean;
  label: string;
  rollName: string;
  gesture: ReturnType<typeof useFieldRollGesture>;
}) {
  const t = useTranslations("renderer");
  if (!enabled) return <span className="skald-stat-name-text">{label}</span>;
  return (
    <button
      type="button"
      className={cn("skald-stat-name-text skald-stat-name-button", gesture.hasOptions && LONG_PRESS_CLASS)}
      title={t("statListRoll", { name: rollName })}
      {...gesture.buttonProps}
      // 骰子鈕是這一列唯一的擲骰分頁停靠點；名稱只給滑鼠與觸控
      tabIndex={-1}
    >
      {label}
    </button>
  );
}

/** 專門技能的專門名稱：共用的 IME 輸入框（組字中不寫回、不被遠端更新蓋掉），離開時才 flush */
function SpecInput({
  row,
  editable,
  placeholder,
  ariaLabel,
  onCommit,
  onLeave,
}: {
  row: StatRow;
  editable: boolean;
  placeholder: string;
  ariaLabel: string;
  onCommit: (value: string) => void;
  onLeave: () => void;
}) {
  const stored = row.specName ?? "";
  if (!editable) {
    return <span className="skald-stat-spec-text">{stored || placeholder}</span>;
  }
  return (
    <ImeTextInput
      type="text"
      autoComplete="off"
      className="skald-stat-spec"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={stored}
      onValueChange={(value) => {
        if (value !== stored) onCommit(value);
      }}
      onBlur={onLeave}
    />
  );
}

function StatCell({
  column,
  row,
  label,
  editable,
  commitOnLeave,
  onValue,
  onLeave,
}: {
  column: Exclude<StatListColumn, "improve">;
  row: StatRow;
  label: string;
  editable: boolean;
  commitOnLeave: boolean;
  onValue: (value: number) => void;
  onLeave: () => void;
}) {
  const t = useTranslations("renderer");
  const columnName: Record<Exclude<StatListColumn, "improve">, string> = {
    base: t("statListColumnBase"),
    value: t("statListColumnValue"),
    half: t("statListColumnHalf"),
    fifth: t("statListColumnFifth"),
  };
  if (column === "value") {
    return editable ? (
      <ValueInput
        value={row.value}
        fallback={row.base}
        ariaLabel={t("statListValueInput", { name: label })}
        commitOnLeave={commitOnLeave}
        onCommit={onValue}
        onLeave={onLeave}
      />
    ) : (
      <span
        className="skald-stat-cell skald-stat-value"
        data-column="value"
        role="group"
        aria-label={columnName.value}
      >
        {row.value}
      </span>
    );
  }
  const number = row[column];
  return (
    <span className="skald-stat-cell" data-column={column} role="group" aria-label={columnName[column]}>
      {number ?? ""}
    </span>
  );
}

/**
 * 現值：看起來是粗體數字的輸入框；輸入中可以暫時空白，失焦時退回基礎值。
 * `commitOnLeave`：改現值會讓列換位置（Fate 的等級），輸入中先不寫回，離開時才寫，輸入框才不會跟著列跑掉。
 */
function ValueInput({
  value,
  fallback,
  ariaLabel,
  commitOnLeave,
  onCommit,
  onLeave,
}: {
  value: number;
  fallback: number | undefined;
  ariaLabel: string;
  commitOnLeave: boolean;
  onCommit: (value: number) => void;
  onLeave: () => void;
}) {
  const [text, setText] = React.useState(String(value));
  React.useEffect(() => setText(String(value)), [value]);
  return (
    <input
      type="number"
      inputMode="numeric"
      autoComplete="off"
      className="skald-stat-cell skald-stat-value skald-stat-value-input"
      data-column="value"
      aria-label={ariaLabel}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        if (commitOnLeave) return;
        const parsed = Number.parseInt(event.target.value, 10);
        if (!Number.isNaN(parsed)) onCommit(parsed);
      }}
      onKeyDown={(event) => {
        if (commitOnLeave && event.key === "Enter") event.currentTarget.blur();
      }}
      onBlur={() => {
        const parsed = Number.parseInt(text, 10);
        if (text === "") {
          const restored = fallback ?? value;
          setText(String(restored));
          onCommit(restored);
        } else if (commitOnLeave && !Number.isNaN(parsed) && parsed !== value) {
          onCommit(parsed);
        }
        onLeave();
      }}
    />
  );
}
