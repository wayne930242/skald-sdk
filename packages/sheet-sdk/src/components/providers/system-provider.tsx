"use client";

import * as React from "react";
import type {
  LoadedSystem,
  SystemMappings,
  SystemGameData,
  SystemHandlers,
  DSLConfig,
} from "@skald/types/system";
import type {
  Schema,
  Template,
  SkillsMaster,
  SpecializationGroup,
} from "@skald/types/schema";
import type { DslSuccessLevel as SuccessLevel } from "@skald/dice";
import { createLookupResolver } from "@skald/dice/formula";
import { createRollEvaluator } from "@skald/dice";
import {
  setExcelFormulaEvaluator,
  setLookupResolver,
} from "@skald/dice/formula";
import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { corePorts } from "@skald/sheet-sdk/modules/systems/ui/core-ports";

/** System Context 值 */
export interface SystemContextValue {
  /** 系統 ID */
  systemId: string;
  /** Proven by the published-template loader; absent for render-only/legacy hosts. */
  readonly builtinTemplate?: boolean;
  /** 系統配置 */
  config: LoadedSystem["config"];
  /** Schema 定義 */
  schema: Schema;
  /** Template 定義 */
  template: Template;
  /** 系統 mappings */
  mappings: SystemMappings;
  /** 遊戲資料 */
  gameData: SystemGameData;
  /** Handler 函數 */
  handlers: SystemHandlers;
  /** DSL 配置 */
  dsl: DSLConfig | undefined;
  /** 便利方法：取得技能 master */
  getSkillsMaster: () => SkillsMaster | undefined;
  /** 便利方法：取得專門技能 */
  getSpecializations: () => SpecializationGroup[] | undefined;
  /** 便利方法：取得 era mapping */
  getEraMappingId: (era: string) => string;
  /** 便利方法：取得 category mapping */
  getCategoryMapping: (masterCategory: string) => string;
  /** DSL 便利方法：檢查是否有查表 */
  hasLookupTable: (tableId: string) => boolean;
  /** DSL 便利方法：查表 */
  lookup: (tableId: string, value: number) => string | number | undefined;
  /** DSL 便利方法：檢查是否有投骰規則 */
  hasRollRule: (ruleId: string) => boolean;
  /** DSL 便利方法：評估成功等級 */
  evaluateSuccessLevel: (
    ruleId: string,
    rolled: number,
    target: number,
    context?: Record<string, number>
  ) => SuccessLevel | null | undefined;
  /** DSL 便利方法：取得別名 */
  getAlias: (alias: string) => string | undefined;
}

const SystemContext = React.createContext<SystemContextValue | null>(null);

export interface SystemProviderProps {
  children: React.ReactNode;
  system: LoadedSystem;
  handlers?: SystemHandlers;
}

export function SystemProvider({
  children,
  system,
  handlers = {},
}: SystemProviderProps) {
  // The host's Excel engine for {{excel:…}} formulas; without one they report it is not configured
  const createExcelEvaluator = useHostPort(corePorts.excelFormulaEvaluator);
  const [excelReady, setExcelReady] = React.useState(createExcelEvaluator === null);
  // Create DSL resolvers once
  // Note: Using system.dsl as dependency since React Compiler
  // cannot infer the more specific optional property access
  const lookupResolver = React.useMemo(
    () =>
      system.dsl?.lookupTables
        ? createLookupResolver(system.dsl.lookupTables)
        : null,
    [system.dsl]
  );

  const rollEvaluator = React.useMemo(
    () =>
      system.dsl?.rollRules
        ? createRollEvaluator(system.dsl.rollRules)
        : null,
    [system.dsl]
  );

  // Connect lookup resolver to formula parser globally
  // This enables {{lookup(@attr, 'table')}} syntax in schema formulas
  React.useEffect(() => {
    if (lookupResolver) {
      setLookupResolver(lookupResolver);
    }
    return () => {
      setLookupResolver(null);
    };
  }, [lookupResolver]);

  // Connect the host's Excel evaluator globally for {{excel:...}} formulas.
  React.useEffect(() => {
    if (!createExcelEvaluator) {
      setExcelFormulaEvaluator(null);
      return;
    }
    let mounted = true;

    (async () => {
      try {
        const evaluator = await createExcelEvaluator();
        if (!mounted) return;
        setExcelFormulaEvaluator(evaluator);
      } catch (error) {
        console.warn("Failed to initialize the Excel formula evaluator", error);
        if (!mounted) return;
        setExcelFormulaEvaluator(null);
      } finally {
        if (mounted) setExcelReady(true);
      }
    })();

    return () => {
      mounted = false;
      setExcelFormulaEvaluator(null);
    };
  }, [createExcelEvaluator]);

  const value = React.useMemo<SystemContextValue>(
    () => ({
      systemId: system.config.id,
      builtinTemplate: system.runtime?.builtinTemplate,
      config: system.config,
      schema: system.schema,
      template: system.template,
      mappings: system.mappings,
      gameData: system.gameData,
      handlers,
      dsl: system.dsl,

      getSkillsMaster: () => system.gameData.skills as SkillsMaster | undefined,
      getSpecializations: () => {
        // Specializations are stored inside skills-master.json, not the legacy specializations.json
        const skillsMaster = system.gameData.skills as SkillsMaster | undefined;
        return skillsMaster?.specializations;
      },
      getEraMappingId: (era: string) => system.mappings.eraMappings[era] || era,
      getCategoryMapping: (masterCategory: string) =>
        system.mappings.categoryMappings[masterCategory] || "other",

      // DSL helpers
      hasLookupTable: (tableId: string) =>
        !!system.dsl?.lookupTables?.tables[tableId],
      lookup: (tableId: string, value: number) =>
        lookupResolver?.(tableId, value),
      hasRollRule: (ruleId: string) => !!system.dsl?.rollRules?.rules[ruleId],
      evaluateSuccessLevel: (
        ruleId: string,
        rolled: number,
        target: number,
        context?: Record<string, number>
      ) => rollEvaluator?.evaluateSuccessLevel(ruleId, rolled, target, context),
      getAlias: (alias: string) =>
        system.dsl?.aliases?.attributes[alias] ??
        system.dsl?.aliases?.fields?.[alias],
    }),
    [system, handlers, lookupResolver, rollEvaluator]
  );

  return (
    <SystemContext.Provider value={value}>
      {excelReady ? children : null}
    </SystemContext.Provider>
  );
}

export function useSystem(): SystemContextValue {
  const context = React.useContext(SystemContext);
  if (!context) {
    throw new Error("useSystem must be used within a SystemProvider");
  }
  return context;
}

export function useSystemOptional(): SystemContextValue | null {
  return React.useContext(SystemContext);
}
