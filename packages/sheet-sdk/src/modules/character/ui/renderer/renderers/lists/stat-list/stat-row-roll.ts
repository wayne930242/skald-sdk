import * as React from "react";
import type { useTranslations } from "next-intl";
import type { StatListField } from "@skald/types/schema";
import type { RollConfig } from "@skald/dice/roll-expression";
import {
  MacroResolver,
  hasMacroReference,
  parseMacroReference,
  type RollMacroRegistry,
} from "@skald/dice";
import { useSystemOptional } from "@skald/sheet-sdk/components/providers";
import {
  substituteRowTokens,
  type RowPatch,
  type RowSelector,
  type StatRow,
} from "../../../row-selectors";

export type WriteRow = (
  rowId: string,
  patch: RowPatch,
  /** `plain`: write JSON-clean values (no undefined-valued keys); the roll's auto-tick uses it */
  options?: { flush?: boolean; plain?: boolean },
) => void;

type Translate = ReturnType<typeof useTranslations<"renderer">>;

/** 這一列擲骰時顯示的名稱；專門技能帶上專門名稱 */
export function rollLabel(row: StatRow, t: Translate): string {
  if (!row.parentLabel) return row.label;
  return row.specName
    ? t("statListSpecLabel", { parent: row.parentLabel, spec: row.specName })
    : row.parentLabel;
}

/**
 * 這一列的擲骰設定：把 `@row.*` 換成數字，字串一律包成 RollConfig 且不指定 target，
 * 讓擲骰沿用巨集或桌內的預設去向（桌內送聊天、桌外本機）。
 */
export function useRowRoll(
  field: StatListField,
  selector: RowSelector,
  row: StatRow,
): { roll: RollConfig | undefined; invalid: boolean } {
  const system = useSystemOptional();
  const rollMacros = system?.dsl?.rollMacros;
  const { id, value, base, half, fifth, level } = row;
  return React.useMemo(() => {
    // 來源的預設擲骰引用系統巨集；系統沒有那個巨集時（例如自製範本）擲下去只會每次報錯，
    // 改用來源的純骰式備案
    const own = field.rowRoll;
    const fallback = selector.fallbackRowRoll;
    const template =
      own ??
      (fallback && selector.defaultRowRoll && !macroResolves(selector.defaultRowRoll, rollMacros)
        ? fallback
        : selector.defaultRowRoll);
    if (!template) return { roll: undefined, invalid: false };
    const source: RollConfig = typeof template === "string" ? { expression: template } : template;
    try {
      const resolved = substituteRowTokens(source.expression, {
        id,
        name: id,
        label: id,
        group: "",
        value,
        base,
        half,
        fifth,
        level,
      });
      return { roll: { ...source, expression: resolved }, invalid: false };
    } catch (error) {
      console.error(`[stat-list ${field.id}]`, error);
      return { roll: undefined, invalid: true };
    }
  }, [field.rowRoll, field.id, selector, rollMacros, id, value, base, half, fifth, level]);
}

function macroResolves(expression: string, rollMacros: RollMacroRegistry | undefined): boolean {
  if (!hasMacroReference(expression)) return true;
  const parsed = parseMacroReference(expression);
  if (!parsed || !rollMacros?.macros) return false;
  return new MacroResolver(rollMacros).resolve(parsed.macroId) !== null;
}

/**
 * 擲骰達到成長條件時勾這一列。只有擁有者自己可編輯的卡、這一列能成長、而且擲之前還沒勾，
 * 才給目標：撤銷因此不會清掉更早之前就勾好的，GM 的擲骰、唯讀卡與看別人的卡也不會寫入。
 */
export function useRowImproveTarget(row: StatRow, editable: boolean, writeLatest: WriteRow) {
  const rowId = row.id;
  const canTick = editable && row.improvable === true && row.improved !== true;
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const improveTarget = React.useCallback(
    () =>
      canTick
        ? {
            mark: () => writeLatest(rowId, { improved: true }, { flush: true, plain: true }),
            unmark: () => writeLatest(rowId, { improved: false }, { flush: true, plain: true }),
            isMounted: () => mountedRef.current,
          }
        : undefined,
    [canTick, writeLatest, rowId],
  );
  return { rollKey: rowId, improveTarget };
}
