"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { useRollOptional } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import type { RollConfig } from "@skald/dice/roll-expression";
import type { DeclaredDifficulty, DiceVisibility } from "@skald/dice";
import { useDifficultySupported } from "@skald/sheet-sdk/modules/rolls/ui/hooks/use-difficulty-supported";
import { SheetRollControl } from "@skald/sheet-sdk/modules/rolls/ui/dice/sheet-roll-control";
import { buildRollExpression } from "@skald/sheet-sdk/modules/rolls";

// ============================================================================
// Types
// ============================================================================

export interface SkillInputProps {
  /** 技能名稱 */
  label: string;
  /** 當前技能值 */
  value: number;
  /** 基礎值 */
  baseValue?: number;
  /** 數值變更回調 */
  onChange?: (value: number) => void;
  /** 失焦回調（用於觸發儲存） */
  onBlur?: () => void;
  /** 是否已成長/精通 */
  improved?: boolean;
  /** 成長標記變更回調 */
  onImprovedChange?: (improved: boolean) => void;
  /** 是否為專精技能（可輸入子項目名稱） */
  isSpecialization?: boolean;
  /** 專精名稱 */
  specializationName?: string;
  /** 專精名稱變更回調 */
  onSpecializationNameChange?: (name: string) => void;
  /** 是否顯示基礎值 */
  showBase?: boolean;
  /** 是否顯示半值 */
  showHalf?: boolean;
  /** 是否顯示五分之一值 */
  showFifth?: boolean;
  /** 是否顯示成長標記 */
  showImproved?: boolean;
  /** 是否可編輯 */
  editable?: boolean;
  /** 自訂 className */
  className?: string;
  /** 變體 */
  variant?: "default" | "compact" | "detailed";
  /** 擲骰回調 */
  onRoll?: (
    skillName: string,
    targetValue: number,
    bonusDice: number,
    difficulty?: DeclaredDifficulty,
    /** Who sees the roll, when the roll's options picked it (CoC's 送到). */
    visibility?: DiceVisibility,
  ) => void;
}

// ============================================================================
// SkillInput Component
// ============================================================================

export function SkillInput({
  label,
  value,
  baseValue,
  onChange,
  onBlur,
  improved = false,
  onImprovedChange,
  isSpecialization = false,
  specializationName = "",
  onSpecializationNameChange,
  showBase = true,
  showHalf = true,
  showFifth = true,
  showImproved = true,
  editable = true,
  className,
  variant = "default",
  onRoll,
}: SkillInputProps) {
  const t = useTranslations("renderer");
  const rollContext = useRollOptional();
  const difficultySupported = useDifficultySupported();
  const base = baseValue ?? 0;
  const current = value ?? base;
  const half = Math.floor(current / 2);
  const fifth = Math.floor(current / 5);
  const [isComposingSpec, setIsComposingSpec] = React.useState(false);
  const [specDraft, setSpecDraft] = React.useState(specializationName);

  React.useEffect(() => {
    if (isComposingSpec) return;
    setSpecDraft(specializationName);
  }, [specializationName, isComposingSpec]);

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value, 10);
    if (!isNaN(newValue) && onChange) {
      onChange(newValue);
    }
  };

  const handleSpecNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    setSpecDraft(nextValue);
    if (!isComposingSpec) onSpecializationNameChange?.(nextValue);
  };

  const handleRollClick = async (
    bonusDice: number,
    difficulty: DeclaredDifficulty,
    _transform?: unknown,
    _extraArgs?: unknown,
    visibility?: DiceVisibility,
  ) => {
    const displayLabel =
      isSpecialization && specializationName
        ? `${label} (${specializationName})`
        : label;

    // 優先使用外部傳入的 onRoll
    if (onRoll) {
      if (visibility) onRoll(displayLabel, current, bonusDice, difficulty, visibility);
      else onRoll(displayLabel, current, bonusDice, difficulty);
      return;
    }

    // 若無 onRoll，使用 rollContext
    if (rollContext) {
      const expression = buildRollExpression("coc7:1d100<={{@target}}", {
        cocBonusDice: bonusDice,
      });
      const rollConfig: RollConfig = {
        expression,
        target: "session",
      };
      if (difficulty === "regular" && !visibility) {
        await rollContext.executeRoll(rollConfig, { target: current }, displayLabel);
      } else {
        await rollContext.executeRoll(rollConfig, { target: current }, displayLabel, undefined, {
          ...(difficulty !== "regular" && { difficulty }),
          ...(visibility && { visibility }),
        });
      }
    }
  };

  // Compact variant
  if (variant === "compact") {
    return (
      <div
        className={cn("flex items-center gap-1 py-0.5 text-3xs", className)}
      >
        {showImproved && (
          <input
            type="checkbox"
            checked={improved}
            onChange={(e) => onImprovedChange?.(e.target.checked)}
            disabled={!editable}
            className="w-2 h-2 flex-shrink-0"
          />
        )}
        <span className="flex-1 truncate">{label}</span>
        <input
          type="number"
          autoComplete="off"
          value={current}
          onChange={handleValueChange}
          onBlur={onBlur}
          readOnly={!editable}
          className={cn(
            "w-6 text-center border-b border-foreground print:border-black bg-transparent outline-none",
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
            !editable && "pointer-events-none",
          )}
        />
      </div>
    );
  }

  // Detailed variant (顯示所有資訊)
  if (variant === "detailed") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 py-1 px-2 border border-border rounded",
          className,
        )}
      >
        {showImproved && (
          <input
            type="checkbox"
            checked={improved}
            onChange={(e) => onImprovedChange?.(e.target.checked)}
            disabled={!editable}
            className="w-3 h-3 flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          {isSpecialization ? (
            <div className="flex items-center gap-1">
              <span className="text-xs whitespace-nowrap">{label}</span>
              <input
                type="text"
                autoComplete="off"
                value={specDraft}
                onChange={handleSpecNameChange}
                onCompositionStart={() => setIsComposingSpec(true)}
                onCompositionEnd={(e) => {
                  setIsComposingSpec(false);
                  const nextValue = e.currentTarget.value;
                  setSpecDraft(nextValue);
                  onSpecializationNameChange?.(nextValue);
                }}
                onBlur={() => {
                  onSpecializationNameChange?.(specDraft);
                  onBlur?.();
                }}
                readOnly={!editable}
                placeholder="..."
                className={cn(
                  "flex-1 text-xs border-b border-muted-foreground bg-transparent outline-none min-w-[3rem]",
                  !editable && "pointer-events-none",
                )}
              />
            </div>
          ) : (
            <span className="text-xs">{label}</span>
          )}
        </div>
        {showBase && (
          <span className="text-2xs text-muted-foreground/70 w-8 text-center">
            ({base})
          </span>
        )}
        <input
          type="number"
          autoComplete="off"
          value={current}
          onChange={handleValueChange}
          onBlur={onBlur}
          readOnly={!editable}
          className={cn(
            "w-10 text-center text-sm font-medium border-b border-foreground print:border-black bg-transparent outline-none",
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
            !editable && "pointer-events-none",
          )}
        />
        {showHalf && (
          <span className="text-2xs text-muted-foreground w-6 text-center">
            {half}
          </span>
        )}
        {showFifth && (
          <span className="text-2xs text-muted-foreground w-6 text-center">
            {fifth}
          </span>
        )}
      </div>
    );
  }

  // Default variant
  return (
    <div
      className={cn(
        "relative flex items-center gap-0.5 py-[1px] px-1 text-3xs border-b border-r border-border group",
        className,
      )}
    >
      {/* 成長標記 */}
      {showImproved && (
        <input
          type="checkbox"
          checked={improved}
          onChange={(e) => onImprovedChange?.(e.target.checked)}
          disabled={!editable}
          className="w-2 h-2 flex-shrink-0"
        />
      )}

      {/* 技能名稱 */}
      {isSpecialization ? (
        <div className="flex-1 flex items-center gap-0.5 min-w-0">
          <span className="whitespace-nowrap">{label}</span>
          <input
            type="text"
            autoComplete="off"
            value={specDraft}
            onChange={handleSpecNameChange}
            onCompositionStart={() => setIsComposingSpec(true)}
            onCompositionEnd={(e) => {
              setIsComposingSpec(false);
              const nextValue = e.currentTarget.value;
              setSpecDraft(nextValue);
              onSpecializationNameChange?.(nextValue);
            }}
            onBlur={() => {
              onSpecializationNameChange?.(specDraft);
              onBlur?.();
            }}
            readOnly={!editable}
            placeholder="..."
            className={cn(
              "flex-1 border-b border-muted-foreground bg-transparent outline-none min-w-[1.5rem] text-3xs",
              !editable && "pointer-events-none",
            )}
          />
        </div>
      ) : (
        <span className="flex-1 truncate">{label}</span>
      )}

      {/* 基礎值 */}
      {showBase && (
        <span className="text-muted-foreground/70 text-3xs w-5 text-center flex-shrink-0">
          ({base})
        </span>
      )}

      {/* 當前值 */}
      <input
        type="number"
        autoComplete="off"
        value={current}
        onChange={handleValueChange}
        onBlur={onBlur}
        readOnly={!editable}
        className={cn(
          "w-5 text-center border-b border-foreground print:border-black bg-transparent outline-none text-3xs flex-shrink-0",
          "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          !editable && "pointer-events-none",
        )}
      />

      {/* 半值/五分之一值 */}
      {showHalf && (
        <span className="w-4 text-center text-muted-foreground flex-shrink-0">
          {half}
        </span>
      )}
      {showFifth && (
        <span className="w-4 text-center text-muted-foreground flex-shrink-0">
          {fifth}
        </span>
      )}

      {/* 擲骰按鈕 */}
      {(onRoll || rollContext) && !editable && (
        <SheetRollControl
          rule="coc7"
          ariaLabel={t("rollField", { name: label })}
          rollName={label}
          targetValue={current}
          showBonusDice
          showDifficulty={difficultySupported}
          className="absolute top-0.5 right-0.5 z-10 print:hidden"
          buttonClassName="h-5 w-5 rounded-sm border-0 bg-transparent text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
          onRoll={handleRollClick}
        />
      )}
    </div>
  );
}
