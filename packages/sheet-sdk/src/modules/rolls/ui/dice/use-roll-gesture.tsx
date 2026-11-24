"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import type { DeclaredDifficulty, DiceVisibility } from "@skald/dice";
import { useRollInteractionMode } from "@skald/sheet-sdk/modules/rolls/ui/context/interaction-mode";
import { LoadFailureBoundary } from "./load-failure-boundary";
import { RollOptionsDialog } from "./roll-options-dialog";
import { useLongPress } from "./use-long-press";
import {
  markRollOptionsHintSeen,
  rollOptionsHintSeen,
  showRollOptionsHintOnce,
} from "./roll-options-hint";

export interface RollControlPayload {
  bonusDice: number;
  /** 宣告的難度；沒開 `cocDifficulty` 時一律是一般 */
  difficulty: DeclaredDifficulty;
  flatModifier: number;
  extraDice: string;
  /** From a system's own dialog: a rewrite of this roll's expression (D&D's modifier). */
  transformExpression?: (expression: string) => string;
  /** From a system's own dialog: more macro arguments (D&D's extra dice). */
  macroArgs?: Record<string, number>;
  /** From a system's own dialog: who sees this roll (CoC's 送到); absent keeps the table's audience. */
  visibility?: DiceVisibility;
}

export interface RollGestureOptions {
  onRoll: (payload: RollControlPayload) => void | Promise<void>;
  /** 選項視窗的標題（技能或屬性名稱） */
  rollName: string;
  /** 目標值：選項視窗標題帶上它，難度旁顯示門檻 */
  targetValue?: number;
  controls?: {
    cocBonusDice?: boolean;
    /** CoC 宣告難度（一般／困難／極難）；系統的擲骰規則能判難度時才開 */
    cocDifficulty?: boolean;
  };
  limits?: {
    minBonusDice?: number;
    maxBonusDice?: number;
  };
  /**
   * 系統自己的選項視窗（D&D 的優劣勢、加減值、額外骰），取代 CoC 的獎懲骰／難度視窗；手勢不變。
   * 視窗模組按需載入：第一次按下擲骰鈕時先載，提示文字也從它來（只在還沒提示過時才載）。
   */
  customOptions?: {
    /** A stable (module-level) loader: its identity keys the lazy dialog. */
    load: () => Promise<CustomRollOptionsModule>;
    /** Passed to the dialog as `data`. */
    data?: Record<string, unknown>;
  };
  /**
   * The roll's options are the caller's own form (a template-defined `roll.dialog`, B-022): the
   * gesture opens it instead of a dialog of its own, and renders none.
   */
  openForm?: () => void;
  /**
   * B-023. When the interaction mode is "edit": a tap, Enter, Space, Shift+Enter and the
   * context-menu key call this, never a roll. A long-press does nothing, a right-click is the
   * browser's (no preventDefault), no options dialog or hint renders, nothing preloads, and
   * aria-haspopup/aria-keyshortcuts are unset (the contract on `InteractionMode`).
   * Absent: the gesture rolls in both modes (callers that have not adopted).
   */
  onEdit?: () => void;
}

export interface CustomRollOptionsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rolls this choice; what is left out stays as a tap's roll (no bonus, Regular, nothing added). */
  onRoll: (choice: Partial<RollControlPayload>) => void;
  /** The dialog's title (the roll's name). */
  name: string;
  data?: Record<string, unknown>;
}

export interface CustomRollOptionsModule {
  default: React.ComponentType<CustomRollOptionsProps>;
  /** Loads the dialog's labels in `locale` and gives the one-time hint's text. */
  loadHint: (locale: string) => Promise<string>;
}

const lazyDialogs = new WeakMap<() => Promise<CustomRollOptionsModule>, React.ComponentType<CustomRollOptionsProps>>();

function lazyDialog(load: () => Promise<CustomRollOptionsModule>) {
  let found = lazyDialogs.get(load);
  if (!found) {
    found = React.lazy(load);
    lazyDialogs.set(load, found);
  }
  return found;
}

const REGULAR_ROLL: RollControlPayload = {
  bonusDice: 0,
  difficulty: "regular",
  flatModifier: 0,
  extraDice: "",
};

/**
 * 角色卡擲骰鈕的手勢：點一下（Enter、空白鍵）就擲，一般難度、不加獎懲骰。
 * 這一擲有選項（獎勵骰／懲罰骰、宣告難度）時，長按、右鍵、Shift+Enter 或選單鍵
 * 打開選項視窗。第一次擲骰後跳一次提示告訴使用者可以長按。
 *
 * 回傳要接到 `<button>` 上的屬性與要一起渲染的選項視窗；任何外觀的擲骰鈕
 * （小骰子鈕、整塊屬性磚）都用同一套手勢。
 *
 * 編輯模式（B-023）且給了 `onEdit` 時改成打開編輯，規則見 `InteractionMode` 的說明。
 */
export function useRollGesture({ onRoll, rollName, targetValue, controls, limits, customOptions, openForm, onEdit }: RollGestureOptions) {
  const t = useTranslations("dice");
  const locale = useLocale();
  // B-023: edit mode with an editor to open; see the contract on `InteractionMode`
  const editing = useRollInteractionMode() === "edit" && !!onEdit;
  const showBonus = controls?.cocBonusDice ?? false;
  const showDifficulty = controls?.cocDifficulty ?? false;
  const hasOptions = !editing && (showBonus || showDifficulty || !!customOptions || !!openForm);
  const range = {
    min: limits?.minBonusDice ?? -2,
    max: limits?.maxBonusDice ?? 2,
  };

  const [dialogOpen, setDialogOpen] = React.useState(false);
  // 系統自己的視窗：載入模組與它的文字，回傳提示文字
  const prepare = () => customOptions?.load().then((module) => module.loadHint(locale));
  const openOptions = React.useCallback(() => (openForm ? openForm() : setDialogOpen(true)), [openForm]);
  const longPress = useLongPress(openOptions, hasOptions);

  const rollNow = async () => {
    await onRoll(REGULAR_ROLL);
    if (!hasOptions) return;
    if (openForm) showRollOptionsHintOnce(t("rollOptions.formHint"));
    else if (!customOptions) showRollOptionsHintOnce(t("rollOptions.hint"));
    else if (!rollOptionsHintSeen()) void prepare()?.then(showRollOptionsHintOnce, () => {});
  };

  const rollWithOptions = async (choice: Partial<RollControlPayload>) => {
    setDialogOpen(false);
    // 自己開過視窗就不需要提示了
    markRollOptionsHintSeen();
    await onRoll({ ...REGULAR_ROLL, ...choice });
  };

  const onClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (editing) {
      longPress.consumeLongPress();
      onEdit?.();
      return;
    }
    // 長按放開時瀏覽器還會送一個 click：視窗已經開了，不擲
    if (longPress.consumeLongPress()) return;
    await rollNow();
  };

  const onContextMenu = (event: React.MouseEvent) => {
    // 沒有選項的擲骰（傷害）照常給瀏覽器選單
    if (!hasOptions) return;
    event.preventDefault();
    event.stopPropagation();
    longPress.takeOverPress();
    openOptions();
  };

  const onKeyDown = async (event: React.KeyboardEvent) => {
    if (editing) {
      if (event.key !== "Enter" && event.key !== " " && event.key !== "ContextMenu") return;
      event.preventDefault();
      event.stopPropagation();
      onEdit?.();
      return;
    }
    if (hasOptions && (event.key === "ContextMenu" || (event.key === "Enter" && event.shiftKey))) {
      event.preventDefault();
      event.stopPropagation();
      openOptions();
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    await rollNow();
  };

  return {
    hasOptions,
    editing,
    buttonProps: {
      onClick,
      onContextMenu,
      onKeyDown,
      ...longPress.handlers,
      onPointerDown: (event: React.PointerEvent) => {
        // 按下就先載系統的視窗：長按滿 500 ms 時它已經在了
        if (customOptions && !editing) void prepare()?.catch(() => {});
        longPress.handlers.onPointerDown(event);
      },
      "aria-haspopup": hasOptions ? ("dialog" as const) : undefined,
      "aria-keyshortcuts": hasOptions ? "Shift+Enter" : undefined,
    },
    dialog: editing || openForm ? null : customOptions ? (
      dialogOpen ? (
        <CustomDialog
          load={customOptions.load}
          open
          onOpenChange={setDialogOpen}
          onRoll={rollWithOptions}
          name={rollName}
          data={customOptions.data}
          onFailed={() => {
            // React.lazy keeps a failed import: drop it, so the retry loads again (BUAT-F003)
            lazyDialogs.delete(customOptions.load);
            setDialogOpen(false);
            toast.error(t("rollOptions.loadFailed"), {
              action: { label: t("rollOptions.retry"), onClick: () => setDialogOpen(true) },
            });
          }}
        />
      ) : null
    ) : hasOptions ? (
      <RollOptionsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        name={rollName}
        targetValue={targetValue}
        showBonusDice={showBonus}
        showDifficulty={showDifficulty}
        range={range}
        onRoll={rollWithOptions}
      />
    ) : null,
  };
}

function CustomDialog({
  load,
  onFailed,
  ...props
}: CustomRollOptionsProps & { load: () => Promise<CustomRollOptionsModule>; onFailed: () => void }) {
  const Dialog = lazyDialog(load);
  return (
    <LoadFailureBoundary onFailed={onFailed}>
      <React.Suspense fallback={null}>
        {/* eslint-disable-next-line react-hooks/static-components -- lazyDialog caches one component per loader */}
        <Dialog {...props} />
      </React.Suspense>
    </LoadFailureBoundary>
  );
}
