"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { RollConfig } from "@skald/dice/roll-expression";
import {
  MacroResolver,
  hasMacroReference,
  parseMacroReference,
  type DeclaredDifficulty,
  type DiceVisibility,
} from "@skald/dice";
import { useRollOptional, type RollImproveTarget } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import { useRollInteractionMode } from "@skald/sheet-sdk/modules/rolls/ui/context/interaction-mode";
import { useSystemOptional } from "@skald/sheet-sdk/components/providers/system-provider";
import { useSystemPluginUi } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import { useDifficultySupported } from "@skald/sheet-sdk/modules/rolls/ui/hooks/use-difficulty-supported";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { RollDialog, untouchedRollDialogValues } from "@skald/sheet-sdk/modules/rolls/ui/dice/roll-dialog";
import { SheetRollControl } from "@skald/sheet-sdk/modules/rolls/ui/dice/sheet-roll-control";
import { parseFormula, evaluateFormula } from "@skald/dice/formula";
import { flattenDataToContext } from "../../domain/flatten-data-context";
import { substituteDiceFields } from "../../domain/dice-field-substitution";
import "./rollable-field.css";

export interface RollableFieldProps {
  children: React.ReactNode;
  /** Roll configuration: can be RollConfig object, macro string like "{{#str}}", or boolean */
  roll?: RollConfig | string | boolean;
  fieldLabel?: string;
  fieldType?: string;
  /** 擲後動作規則（`notFor`）比對用：欄位 id */
  rollKey?: string;
  className?: string;
  /** B-023: why the dice button does nothing in edit mode when the field has no input (a computed value). */
  editHint?: string;
}

const EDITABLE_INPUT = "input:not([type='hidden']):not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled]), select:not([disabled])";

/** The field's own input inside a rollable's wrapper: what a dice tap edits in edit mode (B-023). */
export function editableInputIn(
  root: HTMLElement | null,
  within = "",
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  const selector = within ? EDITABLE_INPUT.split(", ").map((part) => `${within} ${part}, ${part}${within}`).join(", ") : EDITABLE_INPUT;
  return root?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector) ?? null;
}

/** Focuses a field's input and selects its text, so typing replaces the value. */
export function focusFieldInput(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null): void {
  if (!input) return;
  input.focus();
  if (!(input instanceof HTMLSelectElement)) input.select();
}

/**
 * B-023: in edit mode, a callback that focuses the editable input inside `ref`'s element (the
 * first one, or the one matching `within`); undefined when there is none. Checked after each
 * render, since the field's own renderer draws the input.
 */
export function useFieldInputTarget(ref: React.RefObject<HTMLElement | null>, active: boolean, within = "") {
  const [found, setFound] = React.useState(true);
  // Every render: the input comes and goes with the field's own renderer; the guard stops the loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useLayoutEffect(() => {
    if (!active) return;
    const next = !!editableInputIn(ref.current, within);
    if (next !== found) setFound(next);
  });
  const focus = React.useCallback(() => focusFieldInput(editableInputIn(ref.current, within)), [ref, within]);
  return active && found ? focus : undefined;
}

/** 擲骰時交給擲骰 context 的擲後資訊 */
export interface RollActionOptions {
  /** 擲的是哪個欄位或哪一列；SAN、幸運擲骰不能孤注一擲就是靠它判斷 */
  rollKey?: string;
  /**
   * 擲骰當下才呼叫，回傳這一列的「可成長」勾；不能勾（唯讀、不能成長、已經勾了）時回 undefined。
   * 在擲骰時而不是渲染時建立，勾的寫入才不會拿到過期的資料。
   */
  improveTarget?: () => RollImproveTarget | undefined;
}

/** 欄位存的值是數字，或 `{ value: 數字 }`（屬性）時取出那個數字：選項視窗標題用 */
function numericFieldValue(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === "object" && "value" in raw) {
    const value = (raw as { value: unknown }).value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

/**
 * RollableField 與 `display: "tile"` 共用的擲骰邏輯：解析 roll 設定（含巨集的
 * bonusDice 與 dialog）、組出 context 後呼叫 executeRoll。
 * 兩者只差在觸發的外觀：RollableField 是欄位旁的骰子鈕，tile 是整塊可點。
 */
export function useRollAction(
  data: Record<string, unknown>,
  roll: RollConfig | string | boolean | undefined,
  fieldLabel: string | undefined,
  actionOptions?: RollActionOptions,
) {
  const rollContext = useRollOptional();
  const system = useSystemOptional();
  const { rollControls } = useSystemPluginUi();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [pendingBonusDice, setPendingBonusDice] = React.useState(0);
  const [pendingDifficulty, setPendingDifficulty] =
    React.useState<DeclaredDifficulty>("regular");
  const [pendingVisibility, setPendingVisibility] = React.useState<DiceVisibility | undefined>();
  const difficultySupported = useDifficultySupported();

  // Resolve roll config from various input types. `expression` is kept as
  // the RAW macro-call string (e.g. "{{#coc[@str]}}") when applicable — not
  // flattened — so a roll-time picker (e.g. bonus/penalty dice) can override
  // an argument's value at the point of execution instead of the template's
  // stored call needing to supply it (see dice-macro-functions design.md D12).
  const resolvedRoll = React.useMemo<RollConfig | undefined>(() => {
    // No roll config
    if (!roll) return undefined;

    // Legacy: create simple roll config
    if (roll === true) {
      return { expression: "1d100", target: "local" };
    }

    // A bare expression string is a local roll; a macro call ("{{#coc[@str]}}")
    // leaves the target open so the macro's own target (default "session") applies —
    // pinning "local" here made every sheet roll skip the table chat.
    const base: RollConfig =
      typeof roll === "string"
        ? hasMacroReference(roll)
          ? { expression: roll }
          : { expression: roll, target: "local" }
        : roll;

    if (hasMacroReference(base.expression) && system?.dsl?.rollMacros) {
      const parsed = parseMacroReference(base.expression);
      const resolver = new MacroResolver(system.dsl.rollMacros);
      const macro = parsed ? resolver.resolve(parsed.macroId) : null;
      if (!macro) {
        // Macro reference but couldn't resolve
        return typeof roll === "string" ? undefined : base;
      }
      return {
        ...base,
        system: base.system ?? macro.system,
        target: base.target ?? macro.target,
        // Field-level override (e.g. san/luck disabling the picker) wins
        // over the macro's own default.
        bonusDice: base.bonusDice ?? macro.bonusDice,
        dialog: base.dialog ?? macro.dialog,
      };
    }

    return base;
  }, [roll, system]);

  const macroBonusDiceParam = resolvedRoll?.bonusDice?.param;
  // Bonus dice 設定：巨集開了 bonusDice，且這條擲骰規則有外掛註冊的擲骰控制
  // （CoC 的獎勵／懲罰骰、D&D 的優勢／劣勢）才把選擇帶進巨集參數
  const showBonusDice =
    !!resolvedRoll?.bonusDice?.enabled &&
    !!resolvedRoll?.system &&
    rollControls.has(resolvedRoll.system) &&
    !!macroBonusDiceParam;
  const minDice = resolvedRoll?.bonusDice?.min ?? -2;
  const maxDice = resolvedRoll?.bonusDice?.max ?? 2;

  // 沒有 roll config 或 roll context 就不能擲
  const canRoll = !!resolvedRoll && !!rollContext;

  // 範本自訂的表單（roll.dialog）：通用路徑（擲骰規則沒有外掛的擲骰控制）點一下就用表單打開時的值擲，
  // 長按、右鍵才開表單（B-022）。有擲骰控制的規則（CoC）照舊：點了先選獎懲骰，再開表單。
  // 表單要填值才能擲（輸入數字、單選）時點一下也開表單（BUAT-F001）
  const untouchedValues =
    resolvedRoll?.dialog && !(resolvedRoll.system && rollControls.has(resolvedRoll.system))
      ? untouchedRollDialogValues(resolvedRoll.dialog)
      : null;
  const formOnLongPress = !!untouchedValues;

  // 能加獎勵骰的檢定（SAN、幸運關掉了）才能宣告難度，而且系統的擲骰規則要能判
  const showDifficulty = showBonusDice && difficultySupported;

  // 這一擲自己選的獎懲骰與難度（長按的選項視窗）；沒有黏著的「下一擲」
  const resolvePicked = (picked: number, pickedDifficulty: DeclaredDifficulty) => ({
    bonusDice: picked,
    difficulty: showDifficulty ? pickedDifficulty : ("regular" as const),
  });

  // 擲的當下才把資料裡的骰子文字（武器傷害骰 `1d8`）放進表達式：context 只收數字
  const rollWithData = (config: RollConfig): RollConfig => {
    const expression = substituteDiceFields(config.expression, data);
    return expression === config.expression ? config : { ...config, expression };
  };

  // 共用的擲骰邏輯
  const trigger = async (
    picked: number,
    pickedDifficulty: DeclaredDifficulty = "regular",
    transformExpression?: (expression: string) => string,
    /** More macro arguments from a system's roll options (D&D's extra dice). */
    extraArgs?: Record<string, number>,
    /** Who sees this roll, when the roll's options picked it (CoC's 送到). */
    visibility?: DiceVisibility,
  ) => {
    if (!resolvedRoll || !rollContext) return;
    const { bonusDice, difficulty } = resolvePicked(picked, pickedDifficulty);
    const context = flattenDataToContext(data);
    setPendingBonusDice(picked);
    setPendingDifficulty(pickedDifficulty);
    setPendingVisibility(visibility);
    const bonusOverride =
      showBonusDice && macroBonusDiceParam
        ? { [macroBonusDiceParam]: bonusDice }
        : undefined;
    const argOverrides = extraArgs ? { ...extraArgs, ...bonusOverride } : bonusOverride;
    if (untouchedValues && formOnLongPress) {
      await handleDialogConfirm(untouchedValues);
      return;
    }
    if (resolvedRoll.dialog) {
      setDialogOpen(true);
      return;
    }
    const withData = rollWithData(resolvedRoll);
    const rollToExecute = transformExpression
      ? { ...withData, expression: transformExpression(withData.expression) }
      : withData;
    await rollContext.executeRoll(rollToExecute, context, fieldLabel, argOverrides, {
      ...(difficulty !== "regular" && { difficulty }),
      ...(visibility && { visibility }),
      rollKey: actionOptions?.rollKey,
      improveTarget: actionOptions?.improveTarget?.(),
    });
  };

  // Dialog 確認處理
  const handleDialogConfirm = async (
    values: Record<string, number | string>,
  ) => {
    if (!resolvedRoll || !rollContext) return;
    const context = flattenDataToContext(data);
    const { bonusDice, difficulty } = resolvePicked(pendingBonusDice, pendingDifficulty);
    const argOverrides =
      showBonusDice && macroBonusDiceParam
        ? { [macroBonusDiceParam]: bonusDice }
        : undefined;

    // Merge dialog values into context
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === "number") {
        context[key] = value;
      } else if (typeof value === "string" && value.startsWith("{{")) {
        // Handle formula values (for single-select attributes)
        const ast = parseFormula(value);
        if (ast) {
          const evaluated = evaluateFormula(ast, context);
          if (typeof evaluated === "number") {
            context[key] = evaluated;
          }
        }
      }
    }

    await rollContext.executeRoll(rollWithData(resolvedRoll), context, fieldLabel, argOverrides, {
      ...(difficulty !== "regular" && { difficulty }),
      ...(pendingVisibility && { visibility: pendingVisibility }),
      rollKey: actionOptions?.rollKey,
      improveTarget: actionOptions?.improveTarget?.(),
    });
  };

  const dialog = resolvedRoll?.dialog ? (
    <RollDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      config={resolvedRoll.dialog}
      onConfirm={handleDialogConfirm}
      title={fieldLabel}
    />
  ) : null;

  return {
    canRoll,
    rollRule: resolvedRoll?.system,
    // 擲骰規則自己的選項（rollOptions）用的規則：沒寫 system 的擲骰由系統的預設規則判（Avatar 的 pbta）
    optionsRule: resolvedRoll ? (resolvedRoll.system ?? system?.dsl?.rollRules?.default) : undefined,
    showBonusDice,
    showDifficulty,
    minDice,
    maxDice,
    targetValue: actionOptions?.rollKey
      ? numericFieldValue(data[actionOptions.rollKey])
      : undefined,
    trigger,
    /** The roll's expression as defined, before data and options: what a rule's own options read. */
    expression: resolvedRoll?.expression,
    /** Opens the template-defined form: the long-press of a roll whose tap rolls with the form untouched. */
    openForm: formOnLongPress ? () => {
      setPendingBonusDice(0);
      setPendingDifficulty("regular");
      setPendingVisibility(undefined);
      setDialogOpen(true);
    } : undefined,
    /** A tap opens the form first (a rule with its own roll control): such a roll is not a one-tap shortcut. */
    tapOpensForm: !!resolvedRoll?.dialog && !formOnLongPress,
    dialog,
  };
}

export function RollableField({
  data,
  children,
  roll,
  fieldLabel,
  fieldType,
  rollKey,
  className,
  editHint,
}: RollableFieldProps & { data: Record<string, unknown> }) {
  const t = useTranslations("renderer");
  // B-023: in edit mode the dice button edits the field's own input; inert when it has none
  const editing = useRollInteractionMode() === "edit";
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const onEdit = useFieldInputTarget(wrapperRef, editing);
  const { canRoll, rollRule, optionsRule, showBonusDice, showDifficulty, minDice, maxDice, targetValue, trigger, expression, openForm, dialog } =
    useRollAction(data, roll, fieldLabel, { rollKey });

  // 如果沒有 roll config 或 roll context，直接渲染 children
  if (!canRoll) {
    return <>{children}</>;
  }

  return (
    <div
      ref={wrapperRef}
      className={cn("rollable-field group relative", className)}
      data-field-type={fieldType}
    >
      {children}
      <SheetRollControl
        rule={rollRule}
        optionsRule={optionsRule}
        onOpenForm={openForm}
        ariaLabel={fieldLabel ? t("rollField", { name: fieldLabel }) : t("rollDice")}
        rollName={fieldLabel}
        targetValue={targetValue}
        onRoll={trigger}
        expression={expression}
        showBonusDice={showBonusDice}
        showDifficulty={showDifficulty}
        minDice={minDice}
        maxDice={maxDice}
        onEdit={onEdit}
        editHint={editHint}
      />
      {dialog}
    </div>
  );
}
