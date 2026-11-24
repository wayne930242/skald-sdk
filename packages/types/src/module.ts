/**
 * Module System (模組系統)
 *
 * 可重用的欄位和選項模組，用於跨遊戲系統共享元件
 */

/** 欄位模組 - 可重用的欄位定義集合 */
export interface FieldModule {
  /** 模組 ID */
  id: string;
  /** 模組名稱 */
  name: string;
  /** 版本 */
  version: string;
  /** 描述 */
  description?: string;
  /** 包含的欄位定義 */
  fields: Record<string, unknown>;
}

/** 選項模組 - 可重用的選項集合（如技能列表、職業列表） */
export interface OptionModule {
  /** 模組 ID */
  id: string;
  /** 模組名稱 */
  name: string;
  /** 版本 */
  version: string;
  /** 描述 */
  description?: string;
  /** 選項列表 */
  options: Array<{
    id: string;
    name: string;
    [key: string]: unknown;
  }>;
}

/** Schema 變體 - 用於支援不同遊戲設定（如現代 vs 1920s） */
export interface SchemaVariant {
  /** 變體 ID */
  id: string;
  /** 變體名稱 */
  name: string;
  /** 描述 */
  description?: string;
  /** 擴展的基礎 Schema ID */
  extends?: string;
  /** 覆蓋或新增的欄位 */
  fieldOverrides?: Record<string, unknown>;
}

/** Template 片段 - 可重用的模板區塊 */
export interface TemplateFragment {
  /** 片段 ID */
  id: string;
  /** 片段名稱 */
  name: string;
  /** 描述 */
  description?: string;
  /** 佈局內容 */
  layout: unknown;
}
