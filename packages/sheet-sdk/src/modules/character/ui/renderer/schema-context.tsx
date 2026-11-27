"use client";

import { createContext, useContext, useCallback, useMemo, type ReactNode } from "react";
import type { Schema, Field, SelectOption } from "@skald/types/schema";
import {
  type FormulaLifecycleIssue,
  type FormulaValue,
  type FormulaValueType,
} from "@skald/formula";
import {
  evaluateCharacterFormulaRuntime,
  type CharacterFormulaRuntime,
  type EditorHandlerContext,
} from "@skald/sheet-sdk/modules/sheet-schema";

export type ViewMode = "print" | "web";

/** Handler function type */
export type FieldHandler = (
  data: Record<string, unknown>,
  setData: (
    updater:
      | Record<string, unknown>
      | ((prev: Record<string, unknown>) => Record<string, unknown>),
  ) => void,
  /** In a list row (`data` is the row): the whole character. */
  context?: EditorHandlerContext,
) => void | Promise<void>;

/** Handlers map */
export interface FieldHandlers {
  [key: string]: FieldHandler;
}

/** Option sources for dynamic select fields */
export interface OptionSources {
  [key: string]: SelectOption[] | unknown[] | Record<string, unknown>;
}

export interface SchemaStaticContextValue {
  schema: Schema;
  onChange?: (path: string, value: unknown | ((prev: unknown) => unknown)) => void;
  setData?: (
    updater:
      | Record<string, unknown>
      | ((prev: Record<string, unknown>) => Record<string, unknown>),
  ) => void;
  /**
   * Computes a write from the sheet's latest data — other tabs' merged changes included, even before
   * they render — and writes the top-level keys `update` returns; `null` writes nothing. True when
   * something was written. A host without it offers `setData` only.
   */
  updateData?: (update: (data: Record<string, unknown>) => Record<string, unknown> | null) => boolean;
  handlers?: FieldHandlers;
  /** Dynamic option sources for select fields with optionModule */
  optionSources?: OptionSources;
  editable: boolean;
  /** 設定模式：是否顯示進階設定按鈕（資產計算、年齡調整等） */
  setupMode: boolean;
  printMode: boolean;
  viewMode: ViewMode;
  /** 欄位失焦回調（用於觸發 Yjs 儲存） */
  onBlur?: () => void;
  onOpenPanel?: (panelId: string) => void;
  formulaRuntime?: CharacterFormulaRuntime;
  onSetDerivedOverride?: (
    fieldId: string,
    value: FormulaValue,
  ) => void | Promise<void>;
  onRefreshDerivedOverride?: (fieldId: string) => void | Promise<void>;
  /**
   * 只有 Template Editor 的編輯畫布會設定這個欄位。用來把 section/field 的渲染結果
   * 包一層編輯態外殼（選取框、拖曳把手等），live sheet 與 Preview 都不會設定它，
   * 所以它們的渲染結果不受影響。
   *
   * 之所以是「包裝渲染結果」而不是「注入 ref/style props」，是因為拖曳套件
   * 的 useSortable 是 React hook，不能從存在 context 裡的一般函式呼叫——
   * 外殼元件必須是畫布層自己的真實元件，渲染器套件完全不需要知道拖曳套件的存在。
   */
  wrapCanvasElement?: (
    elementId: string,
    kind: "section" | "field",
    node: ReactNode,
    /** field 的解析後 schema 定義；section 沒有對應欄位，恆為 undefined */
    resolvedField?: Field,
  ) => ReactNode;
  /** 只有編輯畫布會設定；在 section 的子元素之間畫出可放置的拖放區。 */
  renderCanvasDropZone?: (
    parentId: string,
    index: number,
    /** 這個 section／page 目前完全沒有子元素時傳 true，讓拖放區顯示成大範圍的空狀態提示 */
    isEmpty?: boolean,
  ) => ReactNode;
  /**
   * `"form"`：欄位畫在表單裡（角色建立精靈的 fill 步驟），不是角色卡上。表單外框
   * 已把欄位標籤畫在輸入框上方，所以 renderer 要做到：輸入框都有框線、列表的
   * 新增鈕說出新增的是什麼、列表項目佔滿整列並有看得到的移除鈕。角色卡不設定。
   */
  presentation?: "form";
  /**
   * 列表項目內的長文字欄位：文字框隨內容長高（`rows` 是最小高度），不出現內捲軸也不截斷。
   * 只有 list renderer 在列內設定。
   */
  growTextareas?: boolean;
}

interface SchemaDataContextValue {
  data: Record<string, unknown>;
  /** Set by a list row, whose `data` is the row: the whole character. */
  character?: Record<string, unknown>;
}

export const SchemaStaticContext = createContext<SchemaStaticContextValue | null>(null);
export const SchemaDataContext = createContext<SchemaDataContextValue | null>(null);
// Backward-compatible export alias
export const SchemaContext = SchemaStaticContext;

export function useSchemaStatic() {
  const context = useContext(SchemaStaticContext);
  if (!context) {
    throw new Error("useSchemaStatic must be used within SchemaStaticContext.Provider");
  }
  return context;
}

export function useSchemaData() {
  const context = useContext(SchemaDataContext);
  if (!context) {
    throw new Error("useSchemaData must be used within SchemaDataContext.Provider");
  }
  return context.data;
}

/**
 * Runs a field's handler: inside a list row it also gets the whole character, elsewhere the
 * two-argument call stays as it was.
 */
export function useRunFieldHandler() {
  const character = useContext(SchemaDataContext)?.character;
  return useCallback(
    (
      handler: FieldHandler,
      data: Record<string, unknown>,
      setData: Parameters<FieldHandler>[1],
    ) => (character ? handler(data, setData, { character }) : handler(data, setData)),
    [character],
  );
}

export function useSchema() {
  return {
    ...useSchemaStatic(),
    data: useSchemaData(),
  };
}

/** 取得顯示模式 */
export function useViewMode(): ViewMode {
  const { viewMode } = useSchemaStatic();
  return viewMode;
}

/** 取得欄位定義 */
export function useField(fieldId: string): Field | undefined {
  const { schema } = useSchemaStatic();
  return schema.fields[fieldId];
}

/** 取得欄位值 */
export function useFieldValue<T = unknown>(path: string): T {
  const data = useSchemaData();
  return getNestedValue(data, path) as T;
}

/**
 * 設定欄位值
 *
 * value 可以是實際值，也可以是 (prev) => next 的 updater。updater 形式會拿到
 * 當下最新的值（不是呼叫當下 render 快照到的值）再運算——避免連續操作
 * （例如快速點兩次「新增」）因為用了過期的陣列/物件快照而互相覆蓋掉彼此的變更。
 */
export function useFieldSetter() {
  const { onChange, editable } = useSchemaStatic();

  return useCallback(
    (path: string, value: unknown | ((prev: unknown) => unknown)) => {
      if (editable && onChange) {
        onChange(path, value);
      }
    },
    [onChange, editable],
  );
}

/** 取得 onBlur 回調（用於觸發 Yjs 儲存） */
export function useFieldBlur() {
  const { onBlur } = useSchemaStatic();
  return onBlur;
}

export interface DerivedFormulaValue {
  value: FormulaValue | undefined;
  resultType: FormulaValueType;
  hasOverride: boolean;
  issues: FormulaLifecycleIssue[];
  setOverride?: (value: FormulaValue) => void | Promise<void>;
  refresh?: () => void | Promise<void>;
}

export function useDerivedFormulaValue(
  fieldId: string,
): DerivedFormulaValue | null {
  const data = useSchemaData();
  const {
    formulaRuntime,
    onSetDerivedOverride,
    onRefreshDerivedOverride,
  } = useSchemaStatic();
  return useMemo(() => {
    const formula = formulaRuntime?.artifact.programs.find(
      (program) =>
        program.kind === "derived" && program.targetFieldId === fieldId,
    );
    if (!formulaRuntime || !formula) return null;
    const result = evaluateCharacterFormulaRuntime(formulaRuntime, data);
    return {
      value: result.derivedValues[fieldId],
      resultType: formula.resultType,
      hasOverride: Object.hasOwn(formulaRuntime.derivedOverrides, fieldId),
      issues: result.issues.filter((issue) => issue.targetFieldId === fieldId),
      setOverride: onSetDerivedOverride
        ? (value: FormulaValue) => onSetDerivedOverride(fieldId, value)
        : undefined,
      refresh: onRefreshDerivedOverride
        ? () => onRefreshDerivedOverride(fieldId)
        : undefined,
    };
  }, [
    data,
    fieldId,
    formulaRuntime,
    onSetDerivedOverride,
    onRefreshDerivedOverride,
  ]);
}

/** 取得巢狀物件的值 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/** 設定巢狀物件的值 */
export function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = path.split(".");
  const result = { ...obj };
  let current: Record<string, unknown> = result;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== "object") {
      current[part] = {};
    } else {
      current[part] = { ...(current[part] as Record<string, unknown>) };
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
  return result;
}
