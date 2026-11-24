/**
 * Skald Schema System v1
 *
 * 資料驅動的模板系統，支援：
 * - 多種欄位類型（文字、數值、計算、追蹤資源、狀態標記等）
 * - 彈性佈局（grid, flex, stack）
 * - 公式計算 {{@attr * 2}}
 * - 資源追蹤（HP/SAN/MP 等）
 */

import type { RollConfig } from "@skald/dice/roll-expression";

// ============================================================================
// 基礎類型
// ============================================================================

/** 尺寸單位 */
export type SizeUnit =
  | `${number}px` // 固定像素
  | `${number}fr` // flex 比例
  | `${number}%` // 百分比
  | "auto" // 自動
  | "fill"; // 填滿剩餘空間

/** 對齊方式 */
export type Alignment = "start" | "center" | "end" | "stretch" | "baseline";

/** 間距 */
export type Spacing = "none" | "xs" | "sm" | "md" | "lg" | "xl" | `${number}px`;

// ============================================================================
// 佈局系統
// ============================================================================

/** 基礎佈局屬性 */
export interface LayoutBase {
  /** 寬度 */
  width?: SizeUnit;
  /** 高度 */
  height?: SizeUnit;
  /** 最小寬度 */
  minWidth?: SizeUnit;
  /** 最大寬度 */
  maxWidth?: SizeUnit;
  /** 內邊距 */
  padding?: Spacing;
  /** 外邊距 */
  margin?: Spacing;
  /** 上邊距 */
  marginTop?: SizeUnit;
  /** 是否隱藏（可用公式） */
  hidden?: boolean | string;
  /** 列印時是否隱藏 */
  printHidden?: boolean;
  /** 螢幕上是否隱藏 */
  screenHidden?: boolean;
}

/** Stack 佈局（垂直或水平堆疊） */
export interface StackLayout extends LayoutBase {
  type: "stack";
  /** 方向 */
  direction: "row" | "column";
  /** 子元素間距 */
  gap?: Spacing;
  /** 主軸對齊 */
  justify?: "start" | "center" | "end" | "between" | "around" | "evenly";
  /** 交叉軸對齊 */
  align?: Alignment;
  /** 是否換行 */
  wrap?: boolean;
  /**
   * 響應式反轉：在 web mode 時，使響應式行為與預設相反
   * - 預設 direction: "row" → flex-col sm:flex-row（手機垂直，桌面水平）
   * - 反轉 direction: "row" + responsiveReverse → flex-row sm:flex-col（手機水平，桌面垂直）
   * 常用於子元素需要與父元素相反的響應式行為時
   */
  responsiveReverse?: boolean;
}

/** Grid 佈局 */
export interface GridLayout extends LayoutBase {
  type: "grid";
  /** 欄位定義 */
  columns: SizeUnit[] | number | string;
  /**
   * `pages` 版面以網頁模式顯示時，在 `sm`（640px）以下的欄數，預設 1（直排）。
   * 數值欄位窄小的格子（屬性、HP／MP／SAN）宣告 2–4，手機上才不會每格佔滿一整列。
   * 不超過 `columns` 的欄數；列印版面不受影響；`views.web` 的區塊用 `at` 定位，不讀這個值。
   */
  baseColumns?: number;
  /** 行定義 */
  rows?: SizeUnit[] | number | string;
  /** 最大行數（搭配 flow: column 使用） */
  maxRows?: number;
  /** 欄間距 */
  columnGap?: Spacing;
  /** 行間距 */
  rowGap?: Spacing;
  /** 統一間距 */
  gap?: Spacing;
  /** 對齊 */
  align?: Alignment;
  /** 內容對齊 */
  justifyItems?: Alignment;
  /** 自動流動方向 */
  flow?: "row" | "column";
}

/** 固定佈局（絕對定位） */
export interface FixedLayout extends LayoutBase {
  type: "fixed";
  /** 相對於父元素的位置 */
  top?: SizeUnit;
  left?: SizeUnit;
  right?: SizeUnit;
  bottom?: SizeUnit;
}

/** 佈局類型聯合 */
export type Layout = StackLayout | GridLayout | FixedLayout;

/** 元素在 Grid 中的位置 */
export interface GridPosition {
  /** 起始欄 (1-based) */
  column?: number;
  /** 跨越欄數 */
  columnSpan?: number;
  /** 起始行 (1-based) */
  row?: number;
  /** 跨越行數 */
  rowSpan?: number;
}

// ============================================================================
// 響應式（僅 views.web 使用）
// ============================================================================

/**
 * 斷點：看的是角色卡根節點的「容器寬度」，不是視窗寬度。
 * base < 720px ≤ md < 1200px ≤ lg
 */
export type Breakpoint = "base" | "md" | "lg";

/**
 * 響應式值：直接給值表示所有斷點相同；給 `{ base, md?, lg? }` 表示行動優先、
 * 往上覆寫（缺少的斷點沿用較小斷點的值）。
 */
export type Responsive<T> = T | { base: T; md?: T; lg?: T };

/** 依斷點覆寫版面（只需寫與較小斷點不同的屬性） */
export interface LayoutOverrides {
  md?: Partial<Layout>;
  lg?: Partial<Layout>;
}

/** 依斷點覆寫欄位引用的版面屬性 */
export interface FieldLayoutOverrides {
  md?: Partial<LayoutBase>;
  lg?: Partial<LayoutBase>;
}

/** 角色卡的操作模式：遊玩或編輯（建卡） */
export type SheetMode = "play" | "edit";

/** `sticky` 的進階設定；`true` 等同 `{}` */
export interface StickyConfig {
  /** 黏附的上緣位移（CSS 長度），預設 0 */
  top?: string;
  /** `viewport`：高度上限為視窗減去 top，超出時內部捲動 */
  maxHeight?: "viewport";
}

/** 宿主注入內容的保留位置名稱 */
export type SectionSlot = "campaign-rules";

/**
 * GM 規則（由宿主透過 context 提供，目前一律為 null）。
 * 只定義最小介面；讀取與 UI 由衍生模板的 CS 接上。
 */
export interface CampaignRules {
  /** 鎖定的時代 */
  era?: string;
  /** 允許的職業 ID */
  allowedOccupations?: string[];
  /** 各點數池的上限，key 為 point-pool 欄位 ID */
  pointCaps?: Record<string, number>;
}

// ============================================================================
// 欄位類型
// ============================================================================

/** 欄位基礎屬性 */
export interface FieldBase {
  /** 唯一識別符 */
  id: string;
  /** 顯示標籤 */
  label?: string;
  /** 標籤位置 */
  labelPosition?: "top" | "left" | "inline" | "hidden";
  /** 說明文字 */
  description?: string;
  /** 佈局屬性 */
  layout?: Partial<LayoutBase>;
  /** 列印模式寬度；未設定時沿用 layout.width。 */
  printWidth?: SizeUnit;
  /** 通用文字內容對齊。 */
  textAlign?: "left" | "center" | "right";
  /** Grid 位置 */
  gridPosition?: GridPosition;
  /** 是否必填 */
  required?: boolean;
  /** 是否唯讀 */
  readonly?: boolean;
  /** 預設值 */
  defaultValue?: unknown;
  /** 條件顯示（公式） */
  visibleWhen?: string;
  /**
   * 完全不渲染此欄位（不同於 `LayoutBase.hidden` 的版面條件隱藏、
   * `visibleWhen` 的條件式顯示）：用於巨集/公式運算的中繼值欄位，
   * 資料仍可透過 `@name` 被公式與巨集讀寫，只是不出現在畫面上。
   */
  hidden?: boolean;
  /** 擲骰設定 */
  roll?: RollConfig;
  /** 範本作者可指派的受限 CSS class */
  customClass?: TemplateCustomClassName;
}

/** 文字欄位 */
export interface TextField extends FieldBase {
  type: "text";
  /** 佔位符 */
  placeholder?: string;
  /** 最大長度 */
  maxLength?: number;
  /** 多行文字 */
  multiline?: boolean;
  /** 多行時的行數 */
  rows?: number;
  /** 輸入框樣式 */
  variant?: "underline" | "plain";
  /** 自動完成建議列表（渲染為 HTML datalist） */
  suggestions?: string[];
  /** Hover 時顯示的行動按鈕 */
  action?: LegacyFieldAction;
}

import type { FieldActionConfig } from "./action-schema";

/**
 * 舊版欄位行動（使用 handler 字串）
 * @deprecated 請改用 FieldActionConfig（宣告式行動）
 */
export interface LegacyFieldAction {
  /** 處理器名稱 */
  handler: string;
  /** 圖示名稱 */
  icon?: string;
  /** 提示文字 */
  tooltip?: string;
  /** 可見條件 */
  visibleWhen?: string;
}

/** 數值欄位行動按鈕（支援舊版 handler 或新版宣告式行動） */
export type FieldAction = LegacyFieldAction | (FieldActionConfig & {
  /** 圖示名稱 */
  icon?: string;
  /** 提示文字 */
  tooltip?: string;
  /** 可見條件 */
  visibleWhen?: string;
});

/** 數值欄位 */
export interface NumberField extends FieldBase {
  type: "number";
  /** 最小值 */
  min?: number | string;
  /** 最大值 */
  max?: number | string;
  /** 步進 */
  step?: number;
  /** 顯示格式 */
  format?: "integer" | "decimal" | "percentage";
  /** 當值為 null 時顯示的佔位符 */
  nullPlaceholder?: string;
  /** Hover 時顯示的行動按鈕 */
  action?: FieldAction;
  /** 輸入框樣式 */
  displayVariant?: "underline" | "box" | "minimal" | "plain";
}

/** 資源的上限／起始值來源：固定數字，或另一個衍生值欄位的結果 */
export type ResourceValueSource = number | { from: string };

/** `resource` 列印時的刻度設定 */
export interface ResourceTrackConfig {
  /** 刻度數；預設取上限 */
  boxes?: number;
  /** 圈出目前值（預設 true） */
  circleCurrent?: boolean;
}

/** `resource` 列印時的外觀設定 */
export interface ResourcePrintConfig {
  /** `ticks`：0–N 刻度；`boxes`：目前／上限／起始三個寫字格 */
  variant?: "ticks" | "boxes";
}

/**
 * 通用資源欄位（HP、MP、SAN、幸運、命運點等）：目前值＋選填的上限與起始值。
 *
 * 目前值存在 `current` 路徑（預設 `<id>.current`），所以沿用既有角色資料。
 * 上限與起始值是固定數字或衍生值；沒有上限時只顯示目前值。
 * 「上限變動時目前值跟著走」由 `follow` 宣告，規則見 lib/sheets/follow-resource.ts。
 * 顯示變體由 `FieldReference.display` 指定：`stepper`（預設）或 `meter`。
 */
export interface ResourceField extends FieldBase {
  type: "resource";
  /** 目前值的資料路徑，預設 `<id>.current` */
  current?: string;
  /** 上限 */
  max?: ResourceValueSource;
  /** 起始值（新角色的目前值；未設定時取上限） */
  start?: ResourceValueSource;
  /** 目前值跟隨哪個值：目前值停在該值上、沒有人另外設定時，該值一變目前值就跟著改 */
  follow?: "max" | "start";
  /** 步進，預設 1 */
  step?: number;
  /** 列印刻度 */
  track?: ResourceTrackConfig;
  /** 列印外觀 */
  print?: ResourcePrintConfig;
}

/** `conditions` 的一個狀況項目 */
export interface ConditionItem {
  /** 勾選狀態的資料鍵：勾選寫入 `data[id]`（布林） */
  id: string;
  label: string;
  description?: string;
  /**
   * 建議勾選的條件：回傳布林的 Excel-like 公式。成立且尚未勾選時，
   * 項目旁出現虛線提示；永遠不會自動勾選。發布時編成隱藏的 derived 公式，
   * 目標為 `<fieldId>__<itemId>__suggest`。
   */
  suggest?: string;
}

/**
 * 狀況欄位（受傷、昏迷、恐慌等）：一排可勾選的項目，勾選寫入 `data[item.id]`。
 * 項目可帶 `suggest` 公式，由發布流程編成內部 derived 公式。
 */
export interface ConditionsField extends FieldBase {
  type: "conditions";
  items: ConditionItem[];
  /** 以 CSS Grid 排成幾欄，未設定時為單欄 */
  columns?: number;
}

/** `stat-list` 可顯示的數值欄（依這個順序排列） */
export type StatListColumn = "improve" | "base" | "value" | "half" | "fifth";

/** `stat-list` 的篩選 chip：常用（已釘選）、可成長（已勾成長）、全部 */
export type StatListFilter = "pinned" | "improvable" | "all";

/** `stat-list` 列印時的版面 */
export interface StatListPrintConfig {
  /** 列印的流排欄數，預設 4 */
  flow?: { columns: number };
  /** 列印的欄位；預設 `["improve", "name", "base", "value", "half", "fifth"]` */
  columns?: ("name" | StatListColumn)[];
  /** 每欄底部留幾列空白列，預設 0 */
  blankRowsPerColumn?: number;
}

/**
 * 可擲清單的「檢視」：分組、搜尋、篩選、欄位、流排。
 *
 * 它不擁有資料。`source` 指向另一個列表欄位（`coc-skill-list`、
 * `fate-skill-pyramid`、`list`），列由該型別的 row selector 提供，
 * 見 components/renderer/row-selectors.ts。
 * 「常用」釘選寫入 `ui.pinned.<本欄位 id>`（字串陣列）。
 * 擲骰一律走欄位的擲骰路徑（`rowRoll`），所以擲骰對象與「下一擲」照常生效。
 */
export interface StatListField extends FieldBase {
  type: "stat-list";
  /** 來源列表欄位的 id */
  source: string;
  /** 顯示的數值欄，預設 `["improve", "base", "value", "half", "fifth"]` */
  columns?: StatListColumn[];
  /** 分組依據；省略時沿用來源提供的分組，`none` 不分組 */
  groupBy?: "category" | "none";
  /** 篩選 chip；省略時 `["pinned", "improvable", "all"]`，只有一個時不顯示 chip */
  filters?: StatListFilter[];
  /** 流排欄數（CSS column-count），預設單欄 */
  flow?: Responsive<{ columns: number }>;
  /** `rows`（預設）：清單列；`tiles`：每列一塊磚（例如閃避） */
  display?: "rows" | "tiles";
  /** 只顯示這些列（列 id） */
  include?: string[];
  /**
   * 每列的擲骰。字串或 RollConfig 的 expression 可使用 `@row.value`、
   * `@row.base`、`@row.half`、`@row.fifth`、`@row.level`，擲骰前換成數字。
   * 省略時用來源型別的預設（`coc-skill-list` 是 `{{#coc[@row.value]}}`）。
   */
  rowRoll?: RollConfig | string;
  /** 顯示搜尋列，預設 true（tiles 不顯示） */
  searchable?: boolean;
  /** 列印版面 */
  print?: StatListPrintConfig;
}

/** 計算欄位（唯讀，由公式計算） */
export interface ComputedField extends FieldBase {
  type: "computed";
  /** 計算公式 */
  formula: string;
  /** 顯示格式 */
  format?: "integer" | "decimal" | "percentage" | "text";
}

/** 選擇欄位 */
export interface SelectField extends FieldBase {
  type: "select";
  /** 選項來源 */
  options: SelectOption[] | string;
  /** 是否允許多選 */
  multiple?: boolean;
  /** 是否允許自訂 */
  allowCustom?: boolean;
  /** 選項模組引用 */
  optionModule?: string;
  /** Handler to call when value changes */
  onChange?: string;
}

/** 通用布林切換欄位；可在角色層級與 List Row Template 重用。 */
export interface ToggleField extends FieldBase {
  type: "toggle";
  icon?: string;
  onLabel?: string;
  offLabel?: string;
}

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  /** 選擇此選項時套用的資料 */
  applyData?: Record<string, unknown>;
}

/** CoC 追蹤資源欄位（HP, SAN, MP 等） */
export interface CocTrackedResourceField extends FieldBase {
  type: "coc-tracked-resource";
  /** 當前值欄位 */
  currentValue: string;
  /** 最大值（數值或公式） */
  maxValue: number | string;
  /** 起始值（數值或公式） */
  startValue?: number | string;
  /**
   * 目前值跟隨哪個值（衍生的 `<id>_max` 或 `<id>_start`）：目前值停在該值上、沒有人另外設定時，
   * 該值一變目前值就跟著改；玩家設過別的值就不動。規則同 `ResourceField.follow`。
   */
  follow?: "max" | "start";
  /** 顯示追蹤格子 */
  showTrackBoxes?: boolean;
  /** 追蹤格子數量（預設等於 maxValue） */
  trackBoxCount?: number | string;
  /** 追蹤格子方向 */
  trackDirection?: "row" | "column";
  /** 追蹤格子大小 */
  trackBoxSize?: "xs" | "sm" | "md" | "lg";
  /** 相關狀態標記 */
  statusMarkers?: StatusMarkerConfig[];
}

/**
 * 狀態標記設定。
 *
 * 標記狀態存在角色資料的頂層，鍵為 marker 的 id
 * （見 coc-tracked-resource-field.tsx 的 useStatusMarkers）。
 */
export interface StatusMarkerConfig {
  /** 標記 ID */
  id: string;
  /** 標記標籤 */
  label: string;
  /** 自動觸發條件（公式） */
  trigger?: string;
}

/** 屬性欄位（含半值、五分之一值） */
export interface AttributeField extends FieldBase {
  type: "attribute";
  /** 是否顯示半值 */
  showHalf?: boolean;
  /** 是否顯示五分之一值 */
  showFifth?: boolean;
  /** 半值公式（預設 floor(value/2)） */
  halfFormula?: string;
  /** 五分之一值公式（預設 floor(value/5)） */
  fifthFormula?: string;
  /** 最小值 */
  min?: number;
  /** 最大值 */
  max?: number;
  /** 值變更時觸發的 handler */
  onChange?: string;
}

/** CoC 技能欄位 */
export interface CocSkillField extends FieldBase {
  type: "coc-skill";
  /** 基礎值（數值或公式） */
  baseValue: number | string;
  /** 是否顯示基礎值 */
  showBase?: boolean;
  /** 是否顯示半值 */
  showHalf?: boolean;
  /** 是否顯示五分之一值 */
  showFifth?: boolean;
  /** 是否顯示成長標記 */
  showImproved?: boolean;
  /** 技能分類 */
  category?: string;
  /** 是否為專門技能（需要指定子項目） */
  isSpecialization?: boolean;
  /** 專門技能選項模組 */
  specializationModule?: string;
}

/** 技能分類定義 */
export interface SkillCategoryDef {
  /** 分類 ID */
  id: string;
  /** 分類標籤 */
  label: string;
}

/** CoC 技能列表欄位（動態，可新增/刪除） */
export interface CocSkillListField extends FieldBase {
  type: "coc-skill-list";
  /**
   * 預設技能列表（技能 ID 陣列）
   * 格式：
   * - "charm" - 一般技能
   * - "fighting:brawl" - 特定專門技能
   * - "fighting[1]" - 空白專門技能欄位
   */
  defaultSkills?: string[];
  /** 技能分類定義 */
  categories?: SkillCategoryDef[];
  /** 新增技能時的預設基礎值 */
  defaultBaseValue?: number;
  /** 是否顯示基礎值 */
  showBase?: boolean;
  /** 是否顯示半值 */
  showHalf?: boolean;
  /** 是否顯示五分之一值 */
  showFifth?: boolean;
  /** 是否顯示成長標記 */
  showImproved?: boolean;
  /** 是否允許新增技能 */
  allowAdd?: boolean;
  /** 是否允許刪除技能 */
  allowRemove?: boolean;
  /** 最大技能數量 */
  maxItems?: number;
  /** 列表佈局設定 */
  listLayout?: {
    maxRows?: number;
    flow?: "row" | "column";
  };
}

/** 技能項目 */
export interface SkillItem {
  /** 技能 ID */
  id: string;
  /** 技能名稱 */
  name: string;
  /** 基礎值 */
  baseValue: number;
  /** 技能分類 */
  category?: string;
  /** 是否為專門技能 */
  isSpecialization?: boolean;
  /** 專門技能名稱佔位符 */
  specializationPlaceholder?: string;
  /** 是否允許成長標記（預設 true） */
  canImprove?: boolean;
}

// ============================================================================
// 技能主檔系統（Era-based skill filtering）
// ============================================================================

/** 技能時代可用性 */
export type SkillAvailability = "default" | "special" | "pulp" | "unavailable";

/** 技能時代設定 */
export interface SkillEraConfig {
  /** 基礎值（數值或公式如 "DEX"） */
  baseValue: number | string;
  /** 此時代的可用性 */
  availability: SkillAvailability;
  /**
   * 此時代把整個專門技能群組當成單一技能（例如喵蘇魯的「科學」）：
   * 預設列只放父技能本身一列，不建立空白專門技能欄位。
   */
  bundled?: boolean;
}

/** 完整技能定義（從 skills-master.json） */
export interface MasterSkillDef {
  /** 技能 ID */
  id: string;
  /** 技能分類 */
  category: string;
  /** 是否為專門技能 */
  isSpecialization?: boolean;
  /** 已退役：不進預設列與挑選器，既有角色資料仍可顯示 */
  retired?: boolean;
  /** 父技能 ID（專門技能用） */
  parentSkill?: string;
  /** 所屬專門技能群組 */
  specializationGroup?: string;
  /** 是否允許成長標記（預設 true） */
  canImprove?: boolean;
  /** 是否為 Pulp 專屬技能（啟用 Pulp 技能選項時才會出現） */
  isPulpOnly?: boolean;
  /** Pulp 技能的基礎值 */
  pulpBaseValue?: number;
  /** 是否為幻夢境專屬技能（啟用幻夢境規則時才會出現） */
  isDreamlandsOnly?: boolean;
  /** 各時代的設定 */
  eras: Record<string, SkillEraConfig>;
}

/** 專門技能選項 */
export interface SpecializationOption {
  /** 選項 ID */
  id: string;
  /** 基礎值 */
  baseValue: number;
  /** 依時代覆寫基礎值（未列出的時代用 baseValue） */
  eraBaseValues?: Record<string, number>;
  /** 已退役：挑選器不顯示 */
  retired?: boolean;
}

/** 專門技能群組定義 */
export interface SpecializationGroup {
  /** 群組 ID */
  id: string;
  /** 分類 */
  category: string;
  /** 已退役：整個群組不在挑選器顯示 */
  retired?: boolean;
  /** 可選選項 */
  options: SpecializationOption[];
}

/** 技能主檔資料結構 */
export interface SkillsMaster {
  /** Schema 版本 */
  $schema: "skald/skills-master/v1";
  /** 資料版本 */
  version: string;
  /** 支援的時代列表 */
  eras: string[];
  /** 所有技能定義 */
  skills: MasterSkillDef[];
  /** 專門技能群組 */
  specializations: SpecializationGroup[];
}

/** 技能項目資料（角色卡用） */
export interface SkillItemData {
  /** 技能 ID */
  id: string;
  /** 技能名稱（顯示用） */
  name: string;
  /** 基礎值（數字或公式字串如 "{{@pow /floor 5}}"） */
  baseValue: number | string;
  /** 當前值（含點數分配），undefined 表示未分配，顯示時用 baseValue */
  value?: number;
  /** 技能分類 */
  category?: string;
  /** 是否為專門技能 */
  isSpecialization?: boolean;
  /** 專門技能名稱（使用者填入） */
  specializationName?: string;
  /** 是否已成長 */
  improved?: boolean;
  /** 是否允許成長 */
  canImprove?: boolean;
  /** 因時代不相容而隱藏（點數不計入已用額度） */
  hiddenByEra?: boolean;
  /** 點數來源（職業/興趣） */
  pointSource?: "occupation" | "interest" | "bonus";
  /** 是否為幻夢境專屬技能（停用幻夢境時會隱藏） */
  isDreamlandsOnly?: boolean;
  /** 是否為用戶新增的技能（非預設技能，可刪除） */
  isUserAdded?: boolean;
}

/** CoC 武器列表欄位 */
export interface CocWeaponListField extends FieldBase {
  type: "coc-weapon-list";
  /** 最大武器數量 */
  maxItems?: number;
  /** 武器資料來源路徑 */
  weaponDataSource?: string;
}

/** 武器項目 */
export interface WeaponItem {
  /** 武器 ID */
  id: string;
  /** 武器名稱 */
  name: string;
  /** 使用技能 */
  skill: string;
  /** 技能值（覆寫） */
  skillValue?: number;
  /** 傷害 */
  damage: string;
  /** 射程 */
  range: string;
  /** 攻擊次數 */
  attacks: string;
  /** 彈藥 */
  ammo: string;
  /** 故障值 */
  malfunction?: string;
}

/** 圖片欄位 */
export interface ImageField extends FieldBase {
  type: "image";
  /** 圖片比例 */
  aspectRatio?: string;
  /** 佔位符文字 */
  placeholder?: string;
  /** 是否允許上傳 */
  allowUpload?: boolean;
  /** 是否允許 URL */
  allowUrl?: boolean;
}

/** 分隔線 */
export interface DividerField extends FieldBase {
  type: "divider";
  /** 分隔線樣式 */
  style?: "solid" | "dashed" | "dotted" | "decorative";
  /** 粗細 */
  thickness?: "thin" | "medium" | "thick";
}

/** 標題欄位 */
export interface HeadingField extends FieldBase {
  type: "heading";
  /** 標題層級 */
  level: 1 | 2 | 3 | 4 | 5 | 6;
  /** 標題文字 */
  text: string;
  /** 樣式 */
  variant?: "default" | "decorated" | "underlined" | "inline" | "body";
}

/** 背景故事列表欄位 */
export interface BackstoryListField extends FieldBase {
  type: "backstory-list";
  /** 最大項目數量 */
  maxItems?: number;
}

/** CoC 同伴調查員欄位 */
export interface CocFellowInvestigatorsField extends FieldBase {
  type: "coc-fellow-investigators";
  /** 最大人數 */
  maxItems?: number;
}

/** CoC 資產列表欄位 */
export interface CocAssetsListField extends FieldBase {
  type: "coc-assets-list";
  /** 最大項目數量 */
  maxItems?: number;
}

/** CoC 資產資訊欄位（信用評級計算結果） */
export interface CocAssetsInfoField extends FieldBase {
  type: "coc-assets-info";
  /** 消費水平標籤 */
  spendingLabel?: string;
  /** 現金標籤 */
  cashLabel?: string;
  /** 資產標籤 */
  assetsLabel?: string;
  /** 無公式時的佔位符 */
  noFormulaPlaceholder?: string;
}

/** CoC 護甲欄位 */
export interface CocArmorField extends FieldBase {
  type: "coc-armor";
}

/** CoC 異才顯示欄位（顯示已選擇的異才列表） */
export interface CocTalentDisplayField extends FieldBase {
  type: "coc-talent-display";
  /** 顯示格式：簡單或詳細 */
  displayFormat?: "simple" | "detailed";
  /** 最大顯示數量 */
  maxItems?: number;
}

// ============================================================================
// PbtA 欄位類型
// ============================================================================

/** Balance Track principle definition */
export interface BalanceTrackPrinciple {
  id: string;
  label: string;
  description?: string;
}

/** Balance Track Field - PbtA balance between two principles */
export interface BalanceTrackField extends FieldBase {
  type: "balance-track";
  /** Left principle (negative direction) */
  principle1: BalanceTrackPrinciple;
  /** Right principle (positive direction) */
  principle2: BalanceTrackPrinciple;
  /** Minimum position on track (default: -4) */
  minPosition?: number;
  /** Maximum position on track (default: +4) */
  maxPosition?: number;
  /** Show center marker */
  showCenter?: boolean;
  /** Data path for balance position */
  positionPath?: string;
  /** Data path for center position */
  centerPath?: string;
}

/** Checklist item definition */
export interface ChecklistItem {
  id: string;
  label: string;
  description?: string;
}

/** Checklist item state */
export type ChecklistItemState =
  | "unchecked"
  | "checked"
  | "completed"
  | "crossed";

/** Checklist Field - list of items that can be checked/unchecked */
export interface ChecklistField extends FieldBase {
  type: "checklist";
  /** Available items */
  items: ChecklistItem[];
  /** Maximum items that can be checked (optional) */
  maxChecked?: number;
  /** Available states (default: ["unchecked", "checked"]) */
  states?: ChecklistItemState[];
  /** Allow cycling through multiple states on click */
  cycleStates?: boolean;
  /** Layout direction */
  direction?: "vertical" | "horizontal";
  /** 以 CSS Grid 排成幾欄，未設定時為單欄 */
  columns?: number;
  /** 是否允許就地編輯項目標籤 */
  editableLabels?: boolean;
  /** 自訂標籤的儲存路徑（預設 `${field.id}Labels`） */
  labelPath?: string;
}

/** Multi-Select option */
export interface MultiSelectOption {
  id: string;
  label: string;
  description?: string;
}

/** Multi-Select Field - select multiple options from a list */
export interface MultiSelectField extends FieldBase {
  type: "multi-select";
  /** Available options */
  options: MultiSelectOption[];
  /** Minimum number of selections required */
  minSelected?: number;
  /** Maximum number of selections allowed */
  maxSelected?: number;
  /** Display style for options */
  displayStyle?: "list" | "chips" | "grid";
}

/** Character Reference Field - reference to another character */
export interface CharacterReferenceField extends FieldBase {
  type: "character-reference";
  /** Type of character that can be selected */
  characterType?: "pc" | "npc" | "both";
  /** Allow multiple selections */
  allowMultiple?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /**
   * `table`: pick the readable characters of the table the sheet belongs to (ADR 0014).
   * Requires `allowMultiple`; the value is `TableCharacterReference[]`. Without a host
   * that supplies `TABLE_CHARACTERS_OPTION_SOURCE`, the field falls back to typed names.
   */
  scope?: "table";
}

/** One entry of a `character-reference` field with `scope: "table"`: a soft reference, no foreign key. */
export interface TableCharacterReference {
  /** The entry's own id (list items are reconciled by id) */
  id: string;
  /** The table's character; empty for a name typed where no table was available */
  characterId: string;
  /** The character's name when it was added, shown when the character is gone */
  name: string;
}

/** How a referenced character stands at the table, as the host reports it. */
export type TableCharacterStatus = "playing" | "notPlaying" | "archived";

export interface TableCharacterOption {
  characterId: string;
  name: string;
  status: TableCharacterStatus;
}

/** What a host passes under `TABLE_CHARACTERS_OPTION_SOURCE` in the renderer's option sources. */
export type TableCharacterSource = {
  /** The table's characters the viewer may reference: shared with the whole table, archived included */
  characters: readonly TableCharacterOption[];
  /** Opens a character's sheet; absent where the host cannot */
  openCharacter?: (characterId: string) => void;
};

export const TABLE_CHARACTERS_OPTION_SOURCE = "tableCharacters";

/** Move definition for PbtA games */
export interface MoveDefinition {
  id: string;
  name: string | { en: string; "zh-TW": string };
  description: string | { en: string; "zh-TW": string };
  type?: "basic" | "playbook" | "special";
  /** Optional group ID for grouping moves in selection UI (e.g. "classic", "alternate") */
  group?: string;
  stat?: string;
  onHit?: string | { en: string; "zh-TW": string };
  onMiss?: string | { en: string; "zh-TW": string };
  on7to9?: string | { en: string; "zh-TW": string };
}

/** Moves List Field - display and track character moves */
export interface MovesListField extends FieldBase {
  type: "moves-list";
  /** Source of moves data: "playbook" (from playbook selection) or "custom" */
  moveSource?: "playbook" | "custom" | "basic" | "balance" | "other-playbooks";
  /** Custom moves if moveSource is "custom" */
  moves?: MoveDefinition[];
  /** Display style */
  displayStyle?: "cards" | "list" | "compact";
  /** Allow tracking which moves have been used this session */
  trackUsage?: boolean;
  /** Group moves by type */
  groupByType?: boolean;
  /** Allow selecting which moves the character has */
  selectable?: boolean;
  /** Min number of moves that must be selected */
  minSelected?: number;
  /** Max number of moves that can be selected */
  maxSelected?: number;
  /** Path to store selected move IDs (defaults to field.id + "Selected") */
  selectedPath?: string;
  /** 選取介面：就地勾選或開對話框 */
  selectionUi?: "inline" | "dialog";
}

/** Growth Question Field - displays playbook-specific growth question */
export interface GrowthQuestionField extends FieldBase {
  type: "growth-question";
  /** Path to the source field that determines which playbook is selected */
  sourceField?: string;
  /** i18n key pattern for the question (e.g. "playbook.{value}.growthQuestion") */
  i18nKeyPattern?: string;
  /** Fallback text when no playbook selected */
  fallbackKey?: string;
}

/** Dynamic Text Field - displays text that changes based on another field's value, with optional usage tracking */
export interface DynamicTextField extends FieldBase {
  type: "dynamic-text";
  /** Path to the source field that determines the text content */
  sourceField?: string;
  /** i18n key pattern (e.g. "playbook.{value}.balanceMoment") */
  i18nKeyPattern?: string;
  /** Fallback key when source field has no value */
  fallbackKey?: string;
  /** Display style */
  displayStyle?: "default" | "quote" | "muted";
  /** Growth advance ID that unlocks this field (e.g., "unlockMoment") */
  unlockedByAdvance?: string;
  /** Path to store usage count */
  usagePath?: string;
}

/** Growth advance option definition */
export interface GrowthAdvanceOption {
  id: string;
  label: string;
  description?: string;
  maxCount?: number;
}

/** Growth Advances Field - tracks taken growth advances */
export interface GrowthAdvancesField extends FieldBase {
  type: "growth-advances";
  /** Available advance options */
  options?: GrowthAdvanceOption[];
  /** Path to store taken advances (defaults to "growth.advances") */
  advancesPath?: string;
}

/** Combat Reference Field - displays combat stances and techniques */
export interface CombatReferenceField extends FieldBase {
  type: "combat-reference";
  /** Display style */
  displayStyle?: "compact" | "full";
}

/** Status Effects Reference Field - displays status effects reference */
export interface StatusEffectsReferenceField extends FieldBase {
  type: "status-effects-reference";
  /** Show only positive/negative or both */
  showType?: "positive" | "negative" | "both";
}

/** Checkbox Track Field - displays a row of checkable boxes */
export interface CheckboxTrackField extends FieldBase {
  type: "checkbox-track";
  /** Number of boxes to display */
  boxes: number;
  /** Path to store the checked count (defaults to field.id) */
  valuePath?: string;
}

/** Conditions Reference Field - displays conditions with tooltips for penalty and clear method */
export interface ConditionsReferenceField extends FieldBase {
  type: "conditions-reference";
}

/** Moves Reference Field - displays PbtA basic moves reference sheet */
export interface MovesReferenceField extends FieldBase {
  type: "moves-reference";
  /** Display style */
  displayStyle?: "compact" | "full";
}

// ============================================================================
// Avatar Legends 招式系統
// ============================================================================

/** 招式熟練等級 */
export type TechniqueMasteryLevel = "learned" | "practiced" | "mastered";

/** 已學招式資料 */
export interface LearnedTechnique {
  /** 招式 ID */
  techniqueId: string;
  /** 熟練等級 */
  masteryLevel: TechniqueMasteryLevel;
  /** 精通條件（熟練等級時由老師設定） */
  masteryCondition?: string;
}

/** 招式訓練類型 */
export type TechniqueTraining =
  | "universal"
  | "group"
  | "waterbending"
  | "earthbending"
  | "firebending"
  | "airbending"
  | "weapons"
  | "technology";

/** 招式姿態類型 */
export type TechniqueApproach =
  | "advance-attack"
  | "defend-maneuver"
  | "evade-observe";

/** 招式追蹤資源設定 */
export interface TechniqueTracking {
  /** 追蹤的資源類型（如 "gears"） */
  resource: string;
  /** 動作類型（generate = 產生資源, spend = 消耗資源） */
  action: "generate" | "spend";
  /** 數量（數字或 "variable" 表示可變） */
  amount: number | "variable";
}

/** 招式定義（從 techniques-master.json） */
export interface TechniqueDefinition {
  /** 招式 ID */
  id: string;
  /** 訓練類型 */
  training: TechniqueTraining;
  /** 姿態類型 */
  approach: TechniqueApproach;
  /** 消耗（如 "1-fatigue"） */
  cost?: string;
  /** 是否為稀有招式 */
  rare?: boolean;
  /** 追蹤資源設定 */
  tracking?: TechniqueTracking;
}

/** 招式主檔資料結構 */
export interface TechniquesMaster {
  /** Schema 版本 */
  $schema: "skald/techniques-master/v1";
  /** 資料版本 */
  version: string;
  /** 所有招式定義 */
  techniques: TechniqueDefinition[];
}

/** Techniques List Field - display and manage learned techniques */
export interface TechniquesListField extends FieldBase {
  type: "techniques-list";
  /** 是否依訓練類型篩選 */
  filterByTraining?: boolean;
  /** 訓練類型來源欄位 */
  trainingSourceField?: string;
  /** 是否包含通用招式 */
  includeUniversal?: boolean;
  /** 是否包含群體招式 */
  includeGroup?: boolean;
  /** 顯示樣式 */
  displayStyle?: "cards" | "list";
}

// ============================================================================
// Fate 系統欄位類型
// ============================================================================

/** Fate 技能金字塔層級設定 */
export interface FateSkillPyramidLevel {
  /** 技能等級 (+4, +3, etc.) */
  level: number;
  /** 此等級的技能數量 */
  count: number;
}

/** Fate 預設技能定義 */
export interface FateDefaultSkill {
  /** 技能 ID */
  id: string;
  /** 技能名稱（可本地化） */
  name: string;
}

/** Fate 連動技能設定 */
export interface FateLinkedSkill {
  /** 技能 ID */
  skillId: string;
  /** 連動說明（顯示在 tooltip） */
  linkedTo: string;
}

/** Fate 技能金字塔欄位 */
export interface FateSkillPyramidField extends FieldBase {
  type: "fate-skill-pyramid";
  /** 預設技能列表 */
  defaultSkills?: FateDefaultSkill[];
  /** 金字塔結構設定 */
  pyramidConfig?: {
    levels: FateSkillPyramidLevel[];
  };
  /** 連動技能設定（這些技能不能被刪除，會顯示連動提示） */
  linkedSkills?: FateLinkedSkill[];
  /** 允許自訂技能名稱 */
  allowCustomSkills?: boolean;
  /** 最小等級（預設 -4） */
  minLevel?: number;
  /** 最大等級（預設 +8） */
  maxLevel?: number;
  /** 技能名稱的 i18n 前綴 */
  skillI18nPrefix?: string;
  /** Ladder 名稱的 i18n 前綴 */
  ladderI18nPrefix?: string;
}

/** Fate 技能金字塔資料項目 */
export interface FateSkillPyramidSkill {
  /** 技能唯一識別 */
  id: string;
  /** 技能名稱（可自訂） */
  name: string;
  /** 技能等級 */
  level: number;
  /** 是否為自訂名稱 */
  isCustomName?: boolean;
}

/** Fate 絕技類型 */
export type FateStuntType = "bonus" | "rule-change" | "custom";

/** Fate 絕技資料 */
export interface FateStunt {
  /** 絕技唯一識別 */
  id: string;
  /** 絕技類型 */
  type: FateStuntType;
  /** 獎勵型/規則變更型：因為我[特質] */
  quality?: string;
  /** 獎勵型：使用[技能] */
  skill?: string;
  /** 獎勵型：進行[動作] */
  action?: string;
  /** 獎勵型：在[情況]下 */
  circumstance?: string;
  /** 規則變更型：我可以[能力] */
  feat?: string;
  /** 規則變更型：但只限[限制] */
  limitation?: string;
  /** 自訂：完整文字 */
  customText?: string;
}

/** Fate 絕技列表欄位 */
export interface FateStuntListField extends FieldBase {
  type: "fate-stunt-list";
  /** 最大絕技數量 */
  maxStunts?: number;
  /** 關聯的 Refresh 欄位 ID（自動扣除） */
  refreshField?: string;
  /** 免費絕技數量（預設 3） */
  freeStunts?: number;
  /** 可選動作列表 */
  actions?: string[];
  /** 技能金字塔欄位 ID（用於技能下拉選單） */
  skillPyramidField?: string;
}

/** Fate 壓力格門檻設定 */
export interface FateStressThreshold {
  /** 技能等級門檻 */
  skillLevel: number;
  /** 總格數 */
  totalBoxes: number;
}

/** Fate 壓力格欄位 */
export interface FateStressTrackField extends FieldBase {
  type: "fate-stress-track";
  /** 技能金字塔欄位 ID */
  skillPyramidField: string;
  /** 關聯技能 ID（physique 或 will） */
  linkedSkillId: string;
  /** 基礎格數（預設 3） */
  baseBoxes?: number;
  /** 額外格數門檻 */
  bonusThresholds?: FateStressThreshold[];
}

/** Fate 形象項目 */
export interface FateAspect {
  id: string;
  label: string;
  value: string;
}

/** Fate 形象列表欄位 */
export interface FateAspectListField extends FieldBase {
  type: "fate-aspect-list";
  /** 預設形象項目 */
  defaultAspects?: Array<{ id: string; label: string }>;
  /** 允許新增自訂形象 */
  allowAdd?: boolean;
  /** 允許刪除形象 */
  allowRemove?: boolean;
  /** 允許修改標籤 */
  allowEditLabel?: boolean;
}

/** Fate 重振欄位 - 自動計算 */
export interface FateRefreshField extends FieldBase {
  type: "fate-refresh";
  /** 基礎重振值（預設 3） */
  baseRefresh?: number;
  /** 免費絕技數量（預設 3） */
  freeStunts?: number;
  /** 絕技欄位 ID（用於計算扣除） */
  stuntsField?: string;
}

/** Fate 重置按鈕欄位 */
export interface FateResetButtonField extends FieldBase {
  type: "fate-reset-button";
}

/**
 * 巨集觸發按鈕欄位 — 獨立、作者可自由擺放的按鈕，點擊即觸發巨集。
 *
 * 不重用 `FieldBase.roll`：`field-renderer.tsx` 對任何 `roll` 為真值的欄位
 * 一律包一層 `RollableField`（hover 顯示的浮動骰子圖示），這是裝飾既有內容
 * 用的 UX，套在「整個欄位本身就是按鈕」上會產生錯誤的視覺效果。改用專屬的
 * `macro` 屬性，繞開該自動包裝邏輯。
 */
export interface MacroTriggerButtonField extends FieldBase {
  type: "macro-trigger-button";
  /** 觸發的巨集（或一般擲骰表達式），與 FieldBase.roll 同型別，但不共用該屬性 */
  macro: RollConfig;
  /** 圖示名稱，見 components/renderer/primitives/field-icon.tsx 的白名單 */
  icon?: string;
  /** 提示文字 */
  tooltip?: string;
  /**
   * 讀取目標 select 欄位目前解析出的選項「數量」，點擊時以
   * `argOverrides[argParam]` 傳入巨集呼叫 —— 巨集本身仍只收到數字，
   * 不會拿到選項陣列或標籤（D3）。
   */
  optionSource?: {
    /** 目標 select 欄位 id */
    fieldId: string;
    /** 巨集參數名稱 */
    argParam: string;
  };
}

// ============================================================================
// UI 語意欄位類型
//
// 以呈現形態命名（而非遊戲系統命名），供多系統共用。
// 舊有的系統語意型別於 schema 載入層透過 normalizeSchema() 轉換至此。
// ============================================================================

/**
 * List Row Template 可使用的共用葉節點欄位。
 *
 * List 與純資料 object 都不是列內可渲染葉節點；
 * Page／Section 屬於 Template 結構，原本就不在 Field union 內。
 */
export type ListRowField = Exclude<
  Field,
  ListField | ObjectField
>;

/** List 每一列共用的欄位順序與版面。 */
export interface ListRowTemplate {
  /** 列內欄位依陣列順序渲染。 */
  children: ListRowField[];
  /** Web、mobile 與列印共用的列版面設定。 */
  layout: Layout;
}

/** Character 中一筆具穩定識別碼的 List Entry。 */
export interface ListEntry extends Record<string, unknown> {
  id: string;
}

/**
 * 可重複的 List 容器。
 *
 * 列內欄位沿用一般 Field 契約；公式與 renderer 不另建 columns 詞彙。
 */
export interface ListField extends FieldBase {
  type: "list";
  rowTemplate: ListRowTemplate;
  maxItems?: number;
  allowAdd?: boolean;
  allowRemove?: boolean;
  idPrefix?: string;
  emptyMessage?: string;
}

/** 可切換參考項目的儲存形態 */
export type ToggleableReferenceStorage = "array" | "map";

/** 可切換參考欄位（項目取自系統資料，啟用狀態寫入角色資料） */
export interface ToggleableReferenceField extends FieldBase {
  type: "toggleable-reference";
  /**
   * 系統資料來源路徑。
   * 各系統的資料層級不一致，故此處須為完整路徑，不可假設共同前綴。
   */
  source: string;
  /**
   * 來源資料的形狀。
   * flat：來源為項目陣列；grouped：來源為「分組鍵對項目陣列」的物件。
   * 預設 flat。
   */
  sourceShape?: "flat" | "grouped";
  /** 啟用狀態的儲存路徑 */
  valuePath: string;
  /** 啟用狀態的儲存形態（預設 map） */
  storage?: ToggleableReferenceStorage;
  /** 依分組鍵篩選項目（sourceShape 為 grouped 時適用），未設定時顯示全部 */
  filter?: string;
  /**
   * 顯示樣式。
   * compact：僅勾選清單；full：勾選清單旁常駐顯示 detailPath 的內容。
   */
  displayStyle?: "compact" | "full";
  /** 項目名稱的屬性名（預設 name） */
  labelPath?: string;
  /** Tooltip 內容的屬性名，未設定則不顯示 tooltip */
  tooltipPath?: string;
  /** Tooltip 內容前的固定標籤（i18n key） */
  tooltipPrefix?: string;
  /** 常駐說明的屬性名（displayStyle 為 full 時使用） */
  detailPath?: string;
  /** 分組鍵對應的標題（i18n key），sourceShape 為 grouped 時使用 */
  groupLabels?: Record<string, string>;
}

/**
 * 純資料欄位：只存放狀態供 handler 讀寫，不進入 template，也不註冊 renderer。
 *
 * 例如 coc7e 的 ageAdjustment 承載年齡調整彈窗的中間狀態。
 * 「不渲染」的機制是不被 template.json 的 field-ref 引用，而非任何旗標。
 */
export interface ObjectField extends FieldBase {
  type: "object";
}

/** 所有欄位類型 */
export type Field =
  | TextField
  | NumberField
  | ComputedField
  | SelectField
  | ToggleField
  | CocTrackedResourceField
  | ResourceField
  | ConditionsField
  | StatListField
  | AttributeField
  | CocSkillField
  | CocSkillListField
  | CocWeaponListField
  | ImageField
  | DividerField
  | HeadingField
  | BackstoryListField
  | CocFellowInvestigatorsField
  | CocAssetsListField
  | CocAssetsInfoField
  | CocArmorField
  | CocTalentDisplayField
  | BalanceTrackField
  | ChecklistField
  | MultiSelectField
  | CharacterReferenceField
  | MovesListField
  | GrowthQuestionField
  | DynamicTextField
  | GrowthAdvancesField
  | CombatReferenceField
  | StatusEffectsReferenceField
  | CheckboxTrackField
  | ConditionsReferenceField
  | MovesReferenceField
  | TechniquesListField
  | FateSkillPyramidField
  | FateStuntListField
  | FateStressTrackField
  | FateAspectListField
  | FateRefreshField
  | FateResetButtonField
  | MacroTriggerButtonField
  | ListField
  | ToggleableReferenceField
  | ObjectField;

/**
 * 欄位型別名稱的唯一真相。
 *
 * 為什麼是執行期陣列而非型別：TypeScript union 無法反推出執行期值，
 * 而消費端裡有兩個需要執行期列舉——data/schemas/schema.schema.json 的 enum
 * 與守門測試。真相因此落在陣列上，Field union 反過來對它取型別。
 *
 * 順序鏡射上方的 Field union，兩份清單可並排對照。
 *
 * 新增型別要碰五處，漏掉任何一處都會由 typecheck 或
 * apps/web/tests/unit/systems/field-type-vocabulary.test.ts 擋下來：
 * 1. 這裡：`MyField extends FieldBase`、加入 `Field` union 與本陣列（順序鏡射 union）。
 * 2. apps/web/data/schemas/schema.schema.json：field `type` enum（投稿驗證與手寫補全）。
 * 3. apps/web/modules/character/ui/renderer/renderers/<分類>/：模組頂層
 *    `registerFieldRenderer(...)`，並由該分類的 index.ts 匯入；通用 renderer 的副作用
 *    要與 Character 套件 `sideEffects` 及架構 pin 一起更新，系統專屬 renderer 改在外掛的
 *    plugin.render.ui.ts 明列。
 * 4. apps/web/messages/{en,zh-TW}.json：`templateEditor.fieldTypes` 標籤。
 * 5. apps/web/modules/templates/ui/editor/schema-editor/：`FieldTypePicker` 的
 *    `FIELD_CATEGORIES` 條目，與 `SchemaEditorPanel` 的 `createDefaultField` case（必填屬性給預設值）。
 * 只存狀態、不被 template 引用的純資料型別登記在 `DATA_ONLY_FIELD_TYPES`，跳過第 3、5 步。
 */
export const FIELD_TYPES = [
  "text",
  "number",
  "computed",
  "select",
  "toggle",
  "coc-tracked-resource",
  "resource",
  "conditions",
  "stat-list",
  "attribute",
  "coc-skill",
  "coc-skill-list",
  "coc-weapon-list",
  "image",
  "divider",
  "heading",
  "backstory-list",
  "coc-fellow-investigators",
  "coc-assets-list",
  "coc-assets-info",
  "coc-armor",
  "coc-talent-display",
  "balance-track",
  "checklist",
  "multi-select",
  "character-reference",
  "moves-list",
  "growth-question",
  "dynamic-text",
  "growth-advances",
  "combat-reference",
  "status-effects-reference",
  "checkbox-track",
  "conditions-reference",
  "moves-reference",
  "techniques-list",
  "fate-skill-pyramid",
  "fate-stunt-list",
  "fate-stress-track",
  "fate-aspect-list",
  "fate-refresh",
  "fate-reset-button",
  "macro-trigger-button",
  "list",
  "toggleable-reference",
  "object",
] as const;

/** 合法的欄位型別名稱 */
export type FieldTypeName = (typeof FIELD_TYPES)[number];

/**
 * 純資料型別：只存放狀態供 handler 讀寫，不被 template 引用，故不註冊 renderer。
 *
 * 這份清單在此之前只以區域常數的形式存在於一個測試檔裡——型別系統不知道
 * 有這回事，schema 作者也看不到。
 */
export const DATA_ONLY_FIELD_TYPES = [
  "object",
] as const satisfies readonly FieldTypeName[];

// ---------------------------------------------------------------------------
// FIELD_TYPES 與 Field union 的等值斷言
//
// 兩個方向必須各自獨立：只斷言 union ⊆ 清單，會漏掉「清單多了一個沒人實作的
// 名字」——而那正是 template.ts 的 FieldType 爛掉的方式（78 個名字，60 個沒有
// 實作）。方向寫在別名名稱上，壞掉時錯誤訊息直接指出是哪一邊。
// ---------------------------------------------------------------------------

type AssertTrue<T extends true> = T;
type IsNever<T> = [T] extends [never] ? true : false;

/** Field union 的每個成員都列在 FIELD_TYPES 裡 */
export type EveryFieldTypeIsListed = AssertTrue<
  IsNever<Exclude<Field["type"], FieldTypeName>>
>;

/** FIELD_TYPES 的每個名稱都有對應的 Field union 成員 */
export type EveryListedTypeHasAField = AssertTrue<
  IsNever<Exclude<FieldTypeName, Field["type"]>>
>;

// ============================================================================
// 區塊與模板
// ============================================================================

/** 標題自訂樣式 */
export interface TitleStyle {
  size?: "xs" | "sm" | "base" | "lg" | "xl" | "2xl" | "3xl";
  align?: "left" | "center" | "right";
  weight?: "normal" | "medium" | "semibold" | "bold";
}

/** 區塊定義（用於分組欄位） */
export interface Section {
  /** 區塊 ID */
  id: string;
  /** 區塊類型 */
  type: "section";
  /** 區塊標題 */
  title?: string;
  /** 標題樣式變體 */
  titleVariant?: "default" | "decorated" | "underlined" | "hidden" | "small";
  /** 標題自訂樣式（覆蓋 titleVariant） */
  titleStyle?: TitleStyle;
  /** 區塊佈局 */
  layout: Layout;
  /** Alternative layout for web/mobile view */
  mobileLayout?: Layout;
  /** 子元素（欄位或巢狀區塊） */
  children: (Field | Section | FieldReference)[];
  /** 區塊自身的佈局屬性 */
  sectionLayout?: Partial<LayoutBase>;
  /** Grid 位置 */
  gridPosition?: GridPosition;
  /** 條件顯示 */
  visibleWhen?: string;
  /** 邊框樣式 */
  border?: "none" | "solid" | "dashed";
  /** 背景 */
  background?: "none" | "light" | "dark";
  /** 範本作者可指派的受限 CSS class */
  customClass?: TemplateCustomClassName;
  /**
   * 僅 `views.web` 使用。`tabs`：子 section 變成分頁，各自的 title 當分頁名。
   * 省略等同 `stack`。
   */
  display?: Responsive<"stack" | "tabs">;
  /** 僅 `views.web` 使用：捲動時黏附在容器上緣 */
  sticky?: Responsive<boolean | StickyConfig>;
  /** 僅 `views.web` 使用：依容器斷點覆寫 layout */
  at?: LayoutOverrides;
  /** 僅 `views.web` 使用：只在這些模式顯示；省略＝兩種模式都顯示 */
  modes?: SheetMode[];
  /**
   * 僅 `views.web` 使用：依容器斷點決定是否顯示，預設 true。
   * `layout` 是 base，`at.*` 覆寫版面，`visible` 則逐斷點解析
   * （例：戰鬥區在 md/lg 顯示於黏附欄、base 以分頁呈現）。
   */
  visible?: Responsive<boolean>;
  /** 僅 `views.web` 使用：宿主注入內容的保留位置；宿主沒有提供內容時不渲染 */
  slot?: SectionSlot;
}

/** 欄位引用（引用已定義的欄位） */
/**
 * 擲骰設定簡寫：
 * - `true` 或 `"self"`: 自動生成 `coc7:1d100<={{@fieldId}}`，target 為 session
 * - RollConfig: 完整設定
 */
export type RollConfigShorthand = true | "self" | RollConfig;

export interface FieldReference {
  type: "field-ref";
  /** 引用的欄位 ID */
  fieldId: string;
  /**
   * Semantic 12-column placement used by renderer for print and web layout.
   * In web mode, renderer may still adjust behavior for mobile readability.
   */
  printGrid?: {
    /** Column span in a 12-column row */
    span: number;
    /** Optional explicit start column (1-12) */
    start?: number;
  };
  /** 覆寫佈局 */
  layout?: Partial<LayoutBase>;
  /** 覆寫 Grid 位置 */
  gridPosition?: GridPosition;
  /** 覆寫標籤 */
  label?: string;
  /** 條件顯示 - 支援 {{path.to.value}} 語法 */
  visibleWhen?: string;
  /** 擲骰設定（支援 true 簡寫自動生成） */
  roll?: RollConfigShorthand;
  /** 覆寫此欄位位置的受限 CSS class */
  customClass?: TemplateCustomClassName;
  /**
   * 僅 `views.web` 使用：欄位的顯示變體，值由各欄位型別的 renderer 解讀
   * （例：attribute → "tile"、coc-weapon-list → "cards"）。
   */
  display?: Responsive<string>;
  /** 僅 `views.web` 使用：只在這些模式顯示；省略＝兩種模式都顯示 */
  modes?: SheetMode[];
  /**
   * 僅 `views.web` 使用：依容器斷點決定是否顯示，預設 true。
   * `layout` 是 base，`at.*` 覆寫版面，`visible` 則逐斷點解析
   * （例：戰鬥區在 md/lg 顯示於黏附欄、base 以分頁呈現）。
   */
  visible?: Responsive<boolean>;
  /** 僅 `views.web` 使用：依容器斷點覆寫版面屬性 */
  at?: FieldLayoutOverrides;
}

/** 頁面定義 */
export interface Page {
  /** 頁面 ID */
  id: string;
  /** 頁面標題 */
  title?: string;
  /** 頁面佈局 */
  layout: Layout;
  /** 頁面內容 */
  children: (Section | Field | FieldReference)[];
  /** 頁面尺寸 */
  size?: "A4" | "letter" | "custom";
  /** 自訂尺寸 */
  customSize?: { width: string; height: string };
  /** 頁面方向 */
  orientation?: "portrait" | "landscape";
  /** 頁面邊距 */
  margin?: Spacing;
  /** 範本作者可指派的受限 CSS class */
  customClass?: TemplateCustomClassName;
}

/** 網頁版面的身分列；三個欄位皆為 schema 欄位 ID，由宿主讀取。 */
export interface WebViewHeader {
  /** 標題欄位 ID（例：角色名稱） */
  title: string;
  /** 副標題欄位 ID（依序顯示） */
  subtitle?: string[];
  /** 肖像欄位 ID */
  portrait?: string;
}

/**
 * 照 `pages` 渲染的範本（沒有 `views.web`）的身分列。欄位都是 schema 欄位 ID；
 * 省略 `title` 時標題沿用名稱欄位（頂層 name 或舊資料的 character.name），
 * 所以只加肖像不會改到既有標題。有 `views.web.header` 時以它為準。
 */
export interface TemplateHeader {
  title?: string;
  subtitle?: string[];
  portrait?: string;
}

/** 網頁（螢幕）版面樹；列印永遠使用 `Template.pages`。 */
export interface WebView {
  id: string;
  header?: WebViewHeader;
  layout: Layout;
  /** 依容器斷點覆寫根 layout */
  at?: LayoutOverrides;
  children: (Section | Field | FieldReference)[];
}

/** 範本樣式變數只允許 Skald 保留前綴。 */
export type TemplateStyleVariableName = `--skald-${string}`;

/** 範本自訂 class 只允許作者前綴，不接受系統或第三方 class。 */
export type TemplateCustomClassName = `skald-user-${string}`;

export type TemplateStyleVariables = Partial<
  Record<TemplateStyleVariableName, string>
>;

/** Template Version 保存的 Scoped CSS 原始碼。 */
export interface ScopedTemplateCssSource {
  variables?: TemplateStyleVariables;
  css?: string;
}

/** 發布驗證後保存於 Template Version 的隔離 CSS 輸出。 */
export interface CompiledTemplateCssArtifact {
  compilerVersion: string;
  rootAttribute: string;
  variables: TemplateStyleVariables;
  css: string;
}

// ============================================================================
// Schema 定義
// ============================================================================

/** 完整 Schema 定義 */
export interface Schema {
  /** Schema 版本標識 */
  $schema: "skald/schema/v1";
  /** Schema ID */
  id: string;
  /** Schema 名稱 */
  name: string;
  /** 版本 */
  version: string;
  /** 描述 */
  description?: string;
  /** 作者 */
  author?: string;
  /** 遊戲系統 */
  system?: string;
  /** 年代/設定 */
  era?: string;
  /** 語言 */
  language?: string;
  /** 標籤 */
  tags?: string[];

  /** 欄位定義（可被多個區塊引用） */
  fields: Record<string, Field>;

  /** 選項模組引用 */
  optionModules?: {
    id: string;
    source: string;
    version?: string;
  }[];

  /** 計算欄位（衍生數值） */
  computed?: Record<
    string,
    {
      formula: string;
      description?: string;
    }
  >;

  /** 驗證規則 */
  validations?: {
    id: string;
    rule: string;
    message: string;
    severity: "error" | "warning" | "info";
  }[];

  /** 編輯器設定（Toolbar / Panel） */
  editorConfig?: EditorConfig;
}

/** 模板定義（視覺呈現） */
export interface Template {
  /** 模板版本標識 */
  $schema: "skald/template/v1";
  /** 模板 ID */
  id: string;
  /** 模板名稱 */
  name: string;
  /** 版本 */
  version: string;
  /** 對應的 Schema ID */
  schemaId: string;
  /** Schema 版本 */
  schemaVersion: string;
  /** 描述 */
  description?: string;
  /** 作者 */
  author?: string;
  /** 預覽圖 */
  thumbnail?: string;

  /** 具前綴與版本隔離契約的新版樣式來源。 */
  scopedStyles?: ScopedTemplateCssSource;

  /** 頁面定義；有 `views` 後只代表 A4／列印版面 */
  pages: Page[];

  /** 外框身分列（肖像、標題、副標題），給沒有 `views.web` 的範本用 */
  header?: TemplateHeader;

  /**
   * 其他呈現方式的版面樹。沒有 `views.web` 時，網頁照舊渲染 `pages`。
   */
  views?: {
    web?: WebView;
  };

  /** 列印設定 */
  printSettings?: {
    /** 頁面大小 */
    pageSize: "A4" | "letter" | "custom";
    /** 方向 */
    orientation: "portrait" | "landscape";
    /** 邊距 */
    margins: {
      top: string;
      right: string;
      bottom: string;
      left: string;
    };
    /** 是否顯示背景 */
    printBackground?: boolean;
  };
}

// ============================================================================
// 編輯器設定（Toolbar / Panel）
// ============================================================================

/** 編輯器設定 */
export interface EditorConfig {
  /** 工具列設定 */
  toolbar?: ToolbarConfig;
  /** 設定面板 */
  settingsPanel?: SettingsPanelConfig;
}

/** 工具列設定 */
export interface ToolbarConfig {
  /** 工具列項目 */
  items: ToolbarItem[];
}

/** 工具列項目類型 */
export type ToolbarItem =
  | ToolbarButton
  | ToolbarSelect
  | ToolbarDisplay
  | ToolbarSeparator;

/** 工具列按鈕 */
export interface ToolbarButton {
  type: "button";
  id: string;
  label: string;
  /** 按鈕啟用時顯示的標籤（用於 toggleEdit） */
  labelActive?: string;
  icon?: string;
  action: "openPanel" | "custom" | "toggleEdit";
  panelId?: string;
  handler?: string;
  badge?: {
    formula?: string;
    variant?: "default" | "secondary" | "destructive";
  };
  activeWhen?: string;
}

/** 工具列下拉選單 */
export interface ToolbarSelect {
  type: "select";
  id: string;
  label: string;
  options: SelectOption[] | { source: string };
  bindTo?: string;
  onChange?: string;
}

/** 工具列顯示項目 */
export interface ToolbarDisplay {
  type: "display";
  id: string;
  template: string;
  formula?: Record<string, string>;
  variant?: "badge" | "text";
  visibleWhen?: string;
}

/** 工具列分隔線 */
export interface ToolbarSeparator {
  type: "separator";
}

/** 設定面板設定 */
export interface SettingsPanelConfig {
  /** 面板標題 */
  title: string;
  /** 預設寬度 */
  width?: string;
  /** 預設是否展開 */
  defaultOpen?: boolean;
  /** 區塊列表 */
  sections: PanelSection[];
}

/** 面板區塊 */
export interface PanelSection {
  id: string;
  title: string;
  icon?: string;
  defaultOpen?: boolean;
  items: PanelItem[];
}

/** 面板項目類型 */
export type PanelItem =
  | PanelSelect
  | PanelText
  | PanelCheckbox
  | PanelButton
  | PanelDisplay
  | PanelGroup;

/** 面板下拉選單 */
export interface PanelSelect {
  type: "select";
  id: string;
  label: string;
  description?: string;
  options: SelectOption[] | { source: string };
  bindTo?: string;
  onChange?: string;
  dependsOn?: string;
  /** 條件顯示（公式或路徑） */
  visibleWhen?: string;
}

/** 面板文字輸入 */
export interface PanelText {
  type: "text";
  id: string;
  label: string;
  description?: string;
  placeholder?: string;
  bindTo: string;
  onChange?: string;
  /** 條件顯示（公式或路徑） */
  visibleWhen?: string;
}

/** 面板勾選框 */
export interface PanelCheckbox {
  type: "checkbox";
  id: string;
  label: string;
  description?: string;
  bindTo: string;
  /** 值變更時觸發的 handler */
  onChange?: string;
  /** 條件顯示（公式或路徑） */
  visibleWhen?: string;
}

/** 面板按鈕 */
export interface PanelButton {
  type: "button";
  id: string;
  label: string;
  icon?: string;
  handler: string;
  variant?: "default" | "outline" | "destructive";
  /** 條件顯示（公式或路徑） */
  visibleWhen?: string;
}

/** 面板顯示項目 */
export interface PanelDisplay {
  type: "display";
  id: string;
  template: string;
  formula?: Record<string, string>;
  /** 條件顯示（公式或路徑） */
  visibleWhen?: string;
}

/** 面板群組（條件顯示） */
export interface PanelGroup {
  type: "group";
  id: string;
  visibleWhen?: string;
  items: PanelItem[];
}

// ============================================================================
// 欄位群組（可重用的欄位組合）
// ============================================================================

/** 欄位群組定義 */
export interface FieldGroup {
  $schema: "skald/field-group/v1";
  id: string;
  name: string;
  version: string;
  description?: string;

  /** 群組參數（可在使用時傳入） */
  params?: {
    name: string;
    type: "string" | "number" | "boolean";
    default?: unknown;
    description?: string;
  }[];

  /** 欄位定義 */
  fields: Field[];

  /** 預設佈局 */
  layout?: Layout;
}
