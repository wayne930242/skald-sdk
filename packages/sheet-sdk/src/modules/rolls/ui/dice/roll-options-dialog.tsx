"use client";

import * as React from "react";
import { Dices, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { DECLARED_DIFFICULTIES, isDeclaredDifficulty, type DeclaredDifficulty } from "@skald/dice";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@skald/sheet-sdk/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@skald/sheet-sdk/components/ui/toggle-group";
import {
  nextRollOptions,
  thresholdsFor,
  type NextRollRange,
  type RollThresholds,
} from "@skald/sheet-sdk/modules/rolls/domain/roll-panel";

export interface RollOptionsChoice {
  bonusDice: number;
  difficulty: DeclaredDifficulty;
}

interface RollOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 技能或屬性名稱 */
  name: string;
  /** 目標值；有值時標題帶上它，難度旁顯示各自的門檻 */
  targetValue?: number;
  showBonusDice: boolean;
  showDifficulty: boolean;
  /** 獎懲骰範圍（系統巨集宣告的 bonusDice min／max） */
  range: NextRollRange;
  onRoll: (choice: RollOptionsChoice) => void;
}

/**
 * 角色卡擲骰的選項視窗：長按（電腦按右鍵）擲骰鈕時開，選獎勵骰／懲罰骰與宣告難度後按「擲骰」。
 * 每次打開都從一般、不加獎懲骰開始；打開時焦點在「擲骰」，Enter 擲、Esc 關。
 * 焦點在選項上時 Enter 只改選該項（按鈕的原生行為），不會用舊選項擲出。
 */
export function RollOptionsDialog({ open, onOpenChange, ...rest }: RollOptionsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <RollOptionsContent {...rest} />}
    </Dialog>
  );
}

/** 分段控制的一格；每個系統的擲骰選項視窗都用同一個樣式 */
export const SEGMENT_ITEM_CLASS =
  "h-11 min-w-11 flex-1 rounded-full data-[spacing=0]:rounded-full data-[spacing=0]:first:rounded-l-full data-[spacing=0]:last:rounded-r-full px-3 text-sm font-semibold data-[state=on]:bg-background data-[state=on]:shadow-sm data-[state=on]:inset-ring-0 md:h-9 md:min-w-9 md:px-1.5";

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

interface RollOptionsFrameProps {
  title: React.ReactNode;
  /** Rolls with the dialog's current choices. */
  onRoll: () => void;
  /** The roll button's text; 「擲骰」 when absent. */
  rollLabel?: React.ReactNode;
  /** The system's choices, between the title and the buttons. */
  children: React.ReactNode;
}

/**
 * 選項視窗的外框：標題、本地化的關閉鈕、「取消／擲骰」。打開時焦點在「擲骰」，Enter 擲、Esc 關；
 * 焦點在按鈕上時 Enter 交給按鈕。中間的選項由系統自己放（CoC 的獎懲骰與難度、D&D 的優劣勢與加減）。
 */
export function RollOptionsFrame({ title, onRoll: roll, rollLabel, children }: RollOptionsFrameProps) {
  const t = useTranslations("dice");
  const tCommon = useTranslations("common");
  const rollButtonRef = React.useRef<HTMLButtonElement>(null);

  return (
    <DialogContent
      className="gap-5 sm:max-w-md"
      aria-describedby={undefined}
      // 預設的 × 讀作英文 Close；改用下方本地化的關閉鈕
      showCloseButton={false}
      data-roll-options-dialog
      // 先聚焦「擲骰」：打開就能直接按 Enter
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        rollButtonRef.current?.focus();
      }}
      // 視窗是 portal，事件仍會沿 React 樹冒到角色卡的列上；擋在這裡
      onClick={stop}
      onContextMenu={stop}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
        // 按鈕自己處理 Enter：選項改選、關閉鈕關、擲骰鈕擲
        if ((event.target as HTMLElement).closest("button")) return;
        event.preventDefault();
        roll();
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <DialogClose asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 size-9"
          aria-label={tCommon("close")}
        >
          <X />
        </Button>
      </DialogClose>

      {children}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {t("rollOptions.cancel")}
          </Button>
        </DialogClose>
        <Button ref={rollButtonRef} type="button" onClick={roll}>
          <Dices />
          {rollLabel ?? t("rollOptions.roll")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/** 獎懲骰的分段控制（懲罰 … 一般 … 獎勵）；CoC 的選項視窗也用它 */
export function BonusDiceOptions({
  range,
  value,
  onChange,
}: {
  range: NextRollRange;
  value: number;
  onChange: (value: number) => void;
}) {
  const t = useTranslations("dice");
  return (
    <div className="grid gap-2">
      <span className="text-xs font-semibold text-muted-foreground">
        {t("rollOptions.bonusLabel")}
      </span>
      <ToggleGroup
        type="single"
        value={String(value)}
        // 永遠要有一個值（0＝一般）
        onValueChange={(next) => {
          if (next !== "") onChange(Number(next));
        }}
        aria-label={t("rollOptions.bonusGroup")}
        className="w-full gap-0 rounded-full border bg-muted p-1"
      >
        {nextRollOptions(range).map((option) => {
          const count = Math.abs(option);
          return (
            <ToggleGroupItem
              key={option}
              value={String(option)}
              aria-label={
                option === 0
                  ? t("rollOptions.normalLabel")
                  : option < 0
                    ? t("rollOptions.penaltyCountLabel", { count })
                    : t("rollOptions.bonusCountLabel", { count })
              }
              className={SEGMENT_ITEM_CLASS}
            >
              {option === 0
                ? t("rollOptions.normal")
                : option < 0
                  ? t("rollOptions.penaltyShort", { count })
                  : t("rollOptions.bonusShort", { count })}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}

/** 宣告難度（一般／困難／極難）的分段控制，有目標值時帶各自的門檻；CoC 的選項視窗也用它 */
export function DifficultyOptions({
  value,
  onChange,
  thresholds,
}: {
  value: DeclaredDifficulty;
  onChange: (value: DeclaredDifficulty) => void;
  thresholds: RollThresholds | null;
}) {
  const t = useTranslations("dice");
  return (
    <div className="grid gap-2">
      <span className="text-xs font-semibold text-muted-foreground">
        {t("difficulty.label")}
      </span>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(next) => {
          if (isDeclaredDifficulty(next)) onChange(next);
        }}
        aria-label={t("difficulty.label")}
        className="w-full gap-0 rounded-full border bg-muted p-1"
      >
        {DECLARED_DIFFICULTIES.map((option) => (
          <ToggleGroupItem
            key={option}
            value={option}
            data-difficulty={option}
            aria-label={t(`rollOptions.${option}Label`)}
            className={SEGMENT_ITEM_CLASS}
          >
            <span>{t(`difficulty.${option}`)}</span>
            {thresholds && (
              <span className="tabular-nums font-normal text-muted-foreground">
                {thresholds[option]}
              </span>
            )}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

function RollOptionsContent({
  name,
  targetValue,
  showBonusDice,
  showDifficulty,
  range,
  onRoll,
}: Omit<RollOptionsDialogProps, "open" | "onOpenChange">) {
  const t = useTranslations("dice");
  const [bonusDice, setBonusDice] = React.useState(0);
  const [difficulty, setDifficulty] = React.useState<DeclaredDifficulty>("regular");

  const hasTarget = typeof targetValue === "number" && Number.isFinite(targetValue);
  const thresholds = hasTarget ? thresholdsFor(targetValue) : null;
  const title = hasTarget ? t("rollOptions.title", { name, value: targetValue }) : name;

  const roll = () =>
    onRoll({
      bonusDice: showBonusDice ? bonusDice : 0,
      difficulty: showDifficulty ? difficulty : "regular",
    });

  return (
    <RollOptionsFrame title={title} onRoll={roll}>
      {showBonusDice && <BonusDiceOptions range={range} value={bonusDice} onChange={setBonusDice} />}
      {showDifficulty && (
        <DifficultyOptions value={difficulty} onChange={setDifficulty} thresholds={thresholds} />
      )}
    </RollOptionsFrame>
  );
}
