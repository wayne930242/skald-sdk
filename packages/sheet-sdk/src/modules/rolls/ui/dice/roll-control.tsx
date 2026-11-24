"use client";

import { Dices, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { useRollInteractionMode } from "@skald/sheet-sdk/modules/rolls/ui/context/interaction-mode";
import { useRollGesture, type RollControlPayload, type RollGestureOptions } from "./use-roll-gesture";

export type { RollControlPayload };

interface RollControlProps {
  ariaLabel: string;
  onRoll: RollGestureOptions["onRoll"];
  /** 選項視窗的標題（技能或屬性名稱）；沒給就用 ariaLabel */
  rollName?: string;
  /** 目標值：選項視窗標題帶上它，難度旁顯示門檻 */
  targetValue?: number;
  className?: string;
  buttonClassName?: string;
  variant?: "overlay" | "inline";
  showOnHover?: boolean;
  controls?: RollGestureOptions["controls"];
  limits?: RollGestureOptions["limits"];
  /** A rule's own options dialog (B-022), in place of the bonus/penalty dice one. */
  customOptions?: RollGestureOptions["customOptions"];
  /** Opens the roll's template-defined form on a long-press (B-022). */
  openForm?: RollGestureOptions["openForm"];
  /** B-023: edit mode opens this (the field's own input, an editor) instead of rolling. */
  onEdit?: () => void;
  /** B-023: edit mode has nothing to edit here: the button is inert (aria-disabled, no roll). */
  editInert?: boolean;
  /** Why an inert button does nothing (a computed value's 自動計算 hint); shown as its title. */
  editHint?: string;
}

function doNothing() {}

/**
 * 角色卡的擲骰鈕。點一下（Enter、空白鍵）就擲：一般難度、不加獎懲骰。
 * 這一擲有選項（獎勵骰／懲罰骰、宣告難度）時，長按、右鍵、Shift+Enter 或選單鍵
 * 打開選項視窗（手勢見 useRollGesture）。
 * 編輯模式（B-023）：有 `onEdit` 時是編輯鈕（鉛筆）；`editInert` 時什麼都不做（aria-disabled）。
 */
export function RollControl({
  ariaLabel,
  onRoll,
  rollName,
  targetValue,
  className,
  buttonClassName,
  variant = "overlay",
  showOnHover = true,
  controls,
  limits,
  customOptions,
  openForm,
  onEdit,
  editInert = false,
  editHint,
}: RollControlProps) {
  const t = useTranslations("renderer");
  const editMode = useRollInteractionMode() === "edit";
  const inert = editMode && !onEdit && editInert;
  const { hasOptions, editing, buttonProps, dialog } = useRollGesture({
    onRoll,
    rollName: rollName ?? ariaLabel,
    targetValue,
    controls,
    limits,
    customOptions,
    openForm,
    onEdit: onEdit ?? (editInert ? doNothing : undefined),
  });

  return (
    <div
      className={cn(
        variant === "overlay"
          ? "absolute inset-0 pointer-events-none group/roll-control"
          : "relative inline-flex items-center group/roll-control",
        className,
      )}
    >
      <button
        type="button"
        className={cn(
          "z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition-colors duration-150 hover:bg-muted hover:text-foreground hover:shadow print:hidden",
          "pointer-events-auto",
          // 長按不能選到文字、叫出 iOS 的放大鏡／選單；touch-action 保留捲動
          hasOptions && "touch-manipulation select-none [-webkit-touch-callout:none]",
          // Always visible: hover only brightens it. Touch has no hover, so it is full
          // strength there. An inline button grows to a 44px tap target; an overlay
          // button sits on a small tile, so it keeps its size and gets a 44px hit area
          // from a transparent pseudo-element instead.
          showOnHover &&
            "opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 group-hover/roll-control:opacity-100 pointer-coarse:opacity-100 [@media(hover:none)]:opacity-100",
          showOnHover &&
            (variant === "inline"
              ? "pointer-coarse:h-11 pointer-coarse:w-11"
              : "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-['']"),
          buttonClassName,
        )}
        {...buttonProps}
        aria-label={editing && !inert ? t("editValue", { name: rollName ?? ariaLabel }) : ariaLabel}
        aria-disabled={inert || undefined}
        title={inert ? editHint : undefined}
      >
        {editing && !inert ? <Pencil className="h-[18px] w-[18px]" /> : <Dices className="h-[18px] w-[18px]" />}
      </button>
      {dialog}
    </div>
  );
}
