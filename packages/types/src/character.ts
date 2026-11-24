/**
 * Character Data - 角色資料結構
 *
 * 設計原則：
 * 1. 鬆散綁定 - 資料結構靈活，由模板 Schema 決定如何解讀
 * 2. 版本鎖定 - 每個角色綁定特定模板版本
 * 3. JSONPath 存取 - 使用路徑字串存取巢狀資料
 */

// =============================================================================
// 角色資料
// =============================================================================

/**
 * 角色資料根結構
 *
 * 資料以 key-value 形式儲存，key 對應模板中的 bind 路徑
 * 例如模板定義 bind: "$.characteristics.str"
 * 則資料為 { characteristics: { str: { value: 50 } } }
 */
export interface CharacterData {
  /** 角色基本資訊 (必填) */
  character: CharacterBasicInfo;

  /** 動態資料區塊 - 由模板 Schema 決定結構 */
  [key: string]: unknown;
}

/** 角色基本資訊 */
export interface CharacterBasicInfo {
  /** 角色名稱 */
  name: string;
  /** 角色頭像 (Base64 或 URL) */
  portrait?: string;
  /** 玩家名稱 */
  playerName?: string;
  /** 其他基本資訊 */
  [key: string]: unknown;
}

// =============================================================================
// 特定欄位值類型 (對應模板 FieldType)
// =============================================================================

/** 屬性值 (對應 StatFieldDef) */
export interface StatValue {
  value: number;
  /** 暫時調整值 */
  tempModifier?: number;
  /** 備註 */
  note?: string;
}

/** 資源值 (對應 ResourceFieldDef) */
export interface ResourceValue {
  current: number;
  max: number;
  /** 暫時最大值調整 */
  tempMax?: number;
}

/** 技能值 (對應 SkillFieldDef) */
export interface SkillValue {
  /** 技能名稱 */
  name: string;
  /** 基礎值 */
  base: number;
  /** 當前值 */
  current: number;
  /** 是否已成長/標記 */
  improved?: boolean;
  /** 專業領域 */
  specialization?: string;
  /** 備註 */
  note?: string;
}

/** 裝備項目 */
export interface EquipmentItem {
  id?: string;
  name: string;
  description?: string;
  quantity?: number;
  weight?: number;
  equipped?: boolean;
  properties?: Record<string, unknown>;
}

/** 可重複區塊項目 */
export interface RepeatingItem {
  _id: string; // 內部 ID，用於排序和刪除
  [key: string]: unknown;
}

// =============================================================================
// 資料庫模型 (Supabase)
// =============================================================================

/** 角色卡資料表 */
export interface CharacterRecord {
  id: string;
  /** 所屬模板 ID */
  template_id: string;
  /** 綁定的模板版本 */
  template_version: string;
  /** 擁有者 ID */
  owner_id: string;
  /** 角色名稱 (冗餘，方便查詢) */
  name: string;
  /** 角色資料 (JSON) */
  data: CharacterData;
  /** 是否公開 */
  is_public: boolean;
  /** 備註 */
  notes?: string;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// 資料操作類型
// =============================================================================

/** 資料變更事件 */
export interface DataChangeEvent {
  /** 變更的路徑 */
  path: string;
  /** 舊值 */
  oldValue: unknown;
  /** 新值 */
  newValue: unknown;
  /** 變更時間 */
  timestamp: number;
}

/** 資料驗證結果 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
  rule: string;
}

// =============================================================================
// 工具類型
// =============================================================================

/**
 * 根據路徑取得值
 * @example
 * const data = { characteristics: { str: { value: 50 } } }
 * getValueByPath(data, '$.characteristics.str.value') // 50
 */
export type PathValue<T, P extends string> = P extends `$.${infer Rest}`
  ? PathValue<T, Rest>
  : P extends `${infer Key}.${infer Rest}`
    ? Key extends keyof T
      ? PathValue<T[Key], Rest>
      : never
    : P extends keyof T
      ? T[P]
      : never;

/**
 * 創建新角色的輸入
 */
export interface CreateCharacterInput {
  templateId: string;
  templateVersion: string;
  name: string;
  data?: Partial<CharacterData>;
}

/**
 * 更新角色的輸入
 */
export interface UpdateCharacterInput {
  id: string;
  name?: string;
  data?: Partial<CharacterData>;
  notes?: string;
  isPublic?: boolean;
}
