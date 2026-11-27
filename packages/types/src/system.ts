/**
 * Skald System Types
 *
 * 多系統架構的類型定義：
 * - SystemConfig: 系統配置檔 (system.json)
 * - LoadedSystem: 完整載入的系統資料
 * - SystemHandlers: 系統專屬處理函式
 */

import type { Schema, Template, SpecializationGroup } from "./schema";
import type { GenreId } from "./genre";
import type {
  SkillsMaster,
  TechniquesMaster,
  GameDataMeta,
} from "./schemas";
import type { LookupTablesDefinition } from "@skald/dice/formula";
import type { RollRulesDefinition, RollMacroRegistry } from "@skald/dice";

// ============================================================================
// 系統配置
// ============================================================================

/** 系統分類 */
export type SystemCategory = "pbta" | "neo-classic" | "fate";

/** 系統摘要 - 用於列表顯示（不含完整資料） */
export interface SystemSummary {
  slug: string;
  name: string;
  category: SystemCategory | "other";
  description?: string;
  isBuiltin: boolean;
  isPublished: boolean;
  authorId?: string;
}

/** 角色卡元件類型 */
export type SheetComponentType = "coc7e" | "avatar-legends" | "dnd5e" | "fate" | "generic";

/**
 * The coc7e family: Systems that share the coc7e sheet adapter, handlers,
 * renderers, dice rules and chat labels. `coc7e` is the classic skill set;
 * `coc7e-kc` uses an alternative skill list. Code that must serve "a coc7e
 * family System" asks `isCoc7eFamilySlug`, never compares one slug; what
 * differs between members (skill data, id aliases, occupation groups) comes
 * from that System's data.
 */
export const COC7E_FAMILY_SLUGS = ["coc7e", "coc7e-kc"] as const;

export type Coc7eFamilySlug = (typeof COC7E_FAMILY_SLUGS)[number];

/** The family member every unknown or missing System falls back to. */
export const COC7E_CLASSIC_SLUG: Coc7eFamilySlug = "coc7e";

export function isCoc7eFamilySlug(
  slug: string | null | undefined,
): slug is Coc7eFamilySlug {
  return (
    typeof slug === "string" &&
    (COC7E_FAMILY_SLUGS as readonly string[]).includes(slug)
  );
}

/** 系統配置 - 對應 system.json */
export interface SystemConfig {
  /** 系統唯一識別符 */
  id: string;
  /** 系統名稱 */
  name: string;
  /** 版本號 */
  version: string;
  /** 系統分類 */
  category: SystemCategory;
  /** 系統描述 */
  description?: string;
  /** 作者 */
  author?: string;
  /** 遊戲桌預設的類型主題，未指定則為中性 */
  defaultGenre?: GenreId;
  /** 角色卡元件，未指定則使用 generic */
  sheetComponent?: SheetComponentType;
  /** Schema 檔案路徑 */
  schema: string;
  /** Template 檔案路徑 */
  template: string;
  /** 預設資料檔案路徑 */
  defaultData?: string;
  /** Handler 模組路徑 */
  handlers?: string;
  /** Mapping 檔案路徑 */
  mappings?: {
    eraMappings?: string;
    categoryMappings?: string;
  };
  /** 遊戲資料檔案路徑 */
  gameData?: Record<string, string>;
  /** 角色建立精靈（skald/wizard/v1）檔案路徑，內建模板發布時一併帶入 */
  wizard?: string;
  /** Sample characters (skald/pregens/v1): the index path, `./pregens/index.json`; omit for none */
  pregens?: string;
  /** 國際化檔案路徑 */
  i18n?: Record<string, string>;
}

// ============================================================================
// 系統 Mappings
// ============================================================================

/** 系統 Mappings */
export interface SystemMappings {
  /** 時代對應表 */
  eraMappings: Record<string, string>;
  /** 分類對應表 */
  categoryMappings: Record<string, string>;
}

// ============================================================================
// DSL 配置
// ============================================================================

/** 屬性別名定義 */
export interface AliasesDefinition {
  /** 屬性別名對照表 */
  attributes: Record<string, string>;
  /** 欄位別名對照表 */
  fields?: Record<string, string>;
}

/** DSL 配置 */
export interface DSLConfig {
  /** 查表定義 */
  lookupTables?: LookupTablesDefinition;
  /** 投骰規則定義 */
  rollRules?: RollRulesDefinition;
  /** 屬性別名定義 */
  aliases?: AliasesDefinition;
  /** 擲骰巨集定義 */
  rollMacros?: RollMacroRegistry;
}

// ============================================================================
// 載入後的系統資料
// ============================================================================

/** 載入後的完整系統資料 */
export interface LoadedSystem {
  /** Immutable runtime authority when loaded from the publishing platform. */
  runtime?: {
    systemId: string;
    templateVersionId: string;
    /** The Character Sheet Template `templateVersionId` belongs to. */
    templateId?: string;
    /**
     * The Template Version carries a Character Creation Wizard: a new
     * Character is created through the wizard route instead of from default
     * data.
     */
    hasWizard?: boolean;
    /**
     * The Template Version belongs to the System's own built-in Template (no owner,
     * built-in System). A System's own presentation, such as a sheet adapter's play
     * view, applies only then; forks and user Templates keep their own layout.
     */
    builtinTemplate?: boolean;
  };
  /** 系統配置 */
  config: SystemConfig;
  /** Schema 定義 */
  schema: Schema;
  /** Template 定義 */
  template: Template;
  /** 預設角色資料 */
  defaultData: Record<string, unknown>;
  /** Mapping 資料 */
  mappings: SystemMappings;
  /** 遊戲資料 */
  gameData: SystemGameData;
  /** DSL 配置 */
  dsl?: DSLConfig;
}

/**
 * 系統遊戲資料（動態載入）
 *
 * 使用 index signature 保持擴展性，不窮舉所有可能的 key。
 * 各 key 的實際型別由對應的 Valibot schema 驗證。
 *
 * 已知的 key 有明確型別（如 skills, techniques），
 * 其他 key 使用 unknown 保持靈活性。
 */
export interface SystemGameData {
  /** 技能主檔 */
  skills?: SkillsMaster;
  /** 招式主檔 */
  techniques?: TechniquesMaster;
  /** 各時代可用技能 ID 列表 */
  skillsByEra?: Record<string, string[]>;
  /** 專門技能群組 */
  specializations?: SpecializationGroup[];
  /** 其他遊戲資料 - 保持擴展性 */
  [key: string]: unknown;
}

// ============================================================================
// 系統 Handlers
// ============================================================================

/** 基礎 Handler 函式類型 */
export type HandlerFunction = (...args: unknown[]) => unknown;

/** 已知的系統 Handler 方法 */
export interface KnownSystemHandlers {
  /** 計算衍生值 */
  calculateDerived?: (data: Record<string, unknown>) => Record<string, unknown>;
  /** 計算骰子結果 */
  calculateDiceRoll?: (
    skillName: string,
    value: number,
    data: Record<string, unknown>,
  ) => unknown;
  /** 計算資產 */
  calculateAssets?: (data: Record<string, unknown>) => {
    spending: string;
    cash: string;
    assets: string;
  };
}

/** 自訂 Handler 集合 */
export type CustomHandlers = Record<string, HandlerFunction | undefined>;

/** 系統 Handler 介面（已知方法 + 自訂 handlers） */
export type SystemHandlers = KnownSystemHandlers & CustomHandlers;
