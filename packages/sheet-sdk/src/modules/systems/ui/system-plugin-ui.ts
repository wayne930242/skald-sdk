import type { ComponentType, ReactNode } from "react";
import type { Field } from "@skald/types/schema";
import type { LoadedSystem } from "@skald/types/system";
import type { DeclaredDifficulty, DiceVisibility } from "@skald/dice";
import type { EditorHandlers, OptionSource, RowSelector } from "@skald/sheet-sdk/modules/sheet-schema";

export interface SheetAdapterInput {
  system: LoadedSystem;
  /** 從雲端載入（或呼叫端指定）的初始資料；沒有時用系統預設資料 */
  initialData?: Record<string, unknown> | null;
  /** 看卡的人是卡主本人（只有卡主能結束建立）；宿主沒說時視為是 */
  ownsCharacter?: boolean;
  /**
   * The sheet is a table's copy (server data: `characters.table_id`). Content-pack rows
   * added to it keep ref, name and origin only, no text (D9).
   */
  inTable?: boolean;
}

export interface SheetAdapterOutput {
  handlers: EditorHandlers;
  optionSources?: OptionSource;
  /** 套用系統補齊後的預設資料（也是「重設角色」回到的資料） */
  defaultData: Record<string, unknown>;
  /** 渲染在角色卡旁邊、需要 SystemProvider 的 modal */
  dialogs: ReactNode;
  /**
   * 系統自己的遊玩版面：網頁、遊玩模式時取代範本的網頁版面（編輯模式與列印照舊用範本）。
   * 在 TemplateRenderer 的 schema／資料／擲骰 context 裡渲染，所以能讀寫欄位與擲骰。
   * adapter 只在範本有它需要的欄位時提供；沒有時宿主照舊渲染範本。
   */
  playView?: ReactNode;
  /**
   * 遊玩版面用在哪些模式：預設 "play"（編輯模式照舊是範本表單）；"both" 時編輯模式也渲染
   * 同一個 `playView`（在 `SheetModeProvider mode="edit"` 裡，由它自己解鎖結構欄位）。
   */
  playViewModes?: PlayViewModes;
}

export type PlayViewModes = "play" | "both";

export interface SheetAdapter {
  useAdapter: (input: SheetAdapterInput) => SheetAdapterOutput;
}

export interface FieldRendererProps<T extends Field = Field> {
  field: T;
}

export type FieldRendererComponent<T extends Field = Field> = ComponentType<FieldRendererProps<T>>;

export interface FieldRendererScope {
  readonly systemId: string;
  readonly fieldId: string;
}

export function fieldRendererKey(type: string, scope?: FieldRendererScope): string {
  return scope ? JSON.stringify([scope.systemId, scope.fieldId, type]) : type;
}

export interface FieldRendererRegistration {
  readonly type: Field["type"];
  readonly renderer: FieldRendererComponent;
  readonly scope?: FieldRendererScope;
}

export function defineFieldRenderer<T extends Field>(
  type: T["type"],
  renderer: FieldRendererComponent<T>,
  scope?: FieldRendererScope,
): FieldRendererRegistration {
  // The host picks this component only when its field has this exact type and optional scope.
  return { type, renderer: renderer as FieldRendererComponent, scope };
}

export interface RowSelectorRegistration {
  readonly type: Field["type"];
  readonly selector: RowSelector;
}

export function defineRowSelector<T extends Field>(type: T["type"], selector: RowSelector<T>): RowSelectorRegistration {
  // The lookup uses the source field's exact type, matching defineFieldRenderer.
  return { type, selector: selector as RowSelector };
}

export interface SheetRollControlProps {
  ariaLabel: string;
  onRoll: (
    bonusDice: number,
    difficulty: DeclaredDifficulty,
    transformExpression?: (expression: string) => string,
    /** More macro arguments from the system's own roll options (D&D's extra dice). */
    extraArgs?: Record<string, number>,
    /** Who sees this roll, picked in the system's own roll options (CoC's 送到). */
    visibility?: DiceVisibility,
  ) => void | Promise<void>;
  rollName?: string;
  targetValue?: number;
  showBonusDice?: boolean;
  showDifficulty?: boolean;
  minDice?: number;
  maxDice?: number;
  className?: string;
  buttonClassName?: string;
  /** The roll's expression as the field defines it, so a control offers only options that reach it. */
  expression?: string;
}

export interface FractionalAttributeInputProps {
  label: string;
  value: number;
  onChange?: (value: number) => void;
  onBlur?: () => void;
  showHalf?: boolean;
  showFifth?: boolean;
  editable?: boolean;
  size?: "sm" | "md" | "lg";
}

/** A lazily loaded roll options dialog: a `useRollGesture` custom options module, with a stable identity. */
export type RollOptionsLoader = () => Promise<{
  default: ComponentType<never>;
  loadHint(locale: string): Promise<string>;
}>;

/**
 * A dice rule's own options for one roll (B-022): the dialog a long-press, a right-click or
 * Shift+Enter opens on any roll button of the rule (a field's dice button, a tile, a stat-list
 * row), where a tap rolls at once. A rule with none keeps the shared bonus/penalty dice dialog.
 */
export interface RuleRollOptions {
  /** The options of a roll whose macro takes the rule's bonus dice (D&D: a d20 Test). */
  readonly withBonusDice?: RollOptionsLoader;
  /** The options of the rule's other rolls. */
  readonly otherRolls?: RollOptionsLoader;
  /**
   * The rule's dialog picks who sees the roll (送到) for that one roll. A System whose default rule
   * sets it has no standing audience picker on the roll desk (CoC); a tap goes to the table's audience.
   */
  readonly perRollAudience?: boolean;
}

/** Compatibility for pre-plugin sheet conventions which were not scoped to a System slug. */
interface LegacySheetConventions {
  readonly fractionalAttributeInput: ComponentType<FractionalAttributeInputProps>;
  resolveActionTooltip(text: string, system: string | undefined): string;
  adjustResourceMax(fieldId: string, max: number, data: Record<string, unknown>): number | undefined;
}

/**
 * What rendering a field needs: the template editor and the character wizard read only these,
 * so they stay free of sheet adapters and their dialogs.
 */
export interface SystemPluginRenderUi {
  readonly fieldRenderers?: readonly FieldRendererRegistration[];
  readonly rowSelectors?: readonly RowSelectorRegistration[];
  /** Specialty controls keyed by dice rule (not by System slug). */
  readonly rollControls?: Readonly<Record<string, ComponentType<SheetRollControlProps>>>;
  /** Per-roll options keyed by dice rule, for every roll button of the rule. */
  readonly rollOptions?: Readonly<Record<string, RuleRollOptions>>;
  readonly legacySheet?: LegacySheetConventions;
}

/** What running a character sheet needs on top of rendering its fields. */
export interface SystemPluginRuntimeUi {
  /** Adapters are keyed by SystemConfig.sheetComponent, not by System slug. */
  readonly sheetAdapters?: Readonly<Record<string, SheetAdapter>>;
}

/**
 * A plugin's UI that loads only when something of a System it serves renders, so its code and
 * catalogs stay out of every other System's sheet and session first load. A `SystemPluginGate`
 * loads it for a System that matches any listed slug, sheet component or dice rule.
 */
export interface LazySystemPluginUi<T> {
  readonly systems?: readonly string[];
  readonly sheetComponents?: readonly string[];
  /** Dice rule names: a System's dsl rules and macro system, and the roll systems its fields name. */
  readonly rollRules?: readonly string[];
  load(): Promise<T>;
}

export interface SystemPluginRenderUiCatalog {
  readonly fieldRenderers: ReadonlyMap<string, FieldRendererComponent>;
  readonly rowSelectors: ReadonlyMap<string, RowSelector>;
  readonly rollControls: ReadonlyMap<string, ComponentType<SheetRollControlProps>>;
  readonly rollOptions: ReadonlyMap<string, RuleRollOptions>;
  readonly legacySheet?: LegacySheetConventions;
  readonly lazyRenderUi: readonly LazySystemPluginUi<SystemPluginRenderUi>[];
}

export interface SystemPluginRuntimeUiCatalog {
  readonly sheetAdapters: ReadonlyMap<string, SheetAdapter>;
  readonly lazyRuntimeUi: readonly LazySystemPluginUi<SystemPluginRuntimeUi>[];
}

export type SystemPluginUiCatalog = SystemPluginRenderUiCatalog & SystemPluginRuntimeUiCatalog;

function register<T>(catalog: Map<string, T>, kind: string, entries: Iterable<readonly [string, T]>) {
  for (const [key, value] of entries) {
    if (catalog.has(key)) throw new Error(`Duplicate plugin ${kind}: ${key}`);
    catalog.set(key, value);
  }
}

export function buildSystemPluginRuntimeUiCatalog(
  plugins: readonly SystemPluginRuntimeUi[],
  lazyRuntimeUi: readonly LazySystemPluginUi<SystemPluginRuntimeUi>[] = [],
): SystemPluginRuntimeUiCatalog {
  const sheetAdapters = new Map<string, SheetAdapter>();
  for (const plugin of plugins) register(sheetAdapters, "sheet adapter", Object.entries(plugin.sheetAdapters ?? {}));
  return { sheetAdapters, lazyRuntimeUi };
}

export function buildSystemPluginRenderUiCatalog(
  plugins: readonly SystemPluginRenderUi[],
  lazyRenderUi: readonly LazySystemPluginUi<SystemPluginRenderUi>[] = [],
): SystemPluginRenderUiCatalog {
  const fieldRenderers = new Map<string, FieldRendererComponent>();
  const rowSelectors = new Map<string, RowSelector>();
  const rollControls = new Map<string, ComponentType<SheetRollControlProps>>();
  const rollOptions = new Map<string, RuleRollOptions>();
  let legacySheet: LegacySheetConventions | undefined;
  for (const plugin of plugins) {
    register(fieldRenderers, "field renderer", (plugin.fieldRenderers ?? []).map(
      ({ type, renderer, scope }) => [fieldRendererKey(type, scope), renderer] as const,
    ));
    register(rowSelectors, "row selector", (plugin.rowSelectors ?? []).map(({ type, selector }) => [type, selector] as const));
    register(rollControls, "roll control", Object.entries(plugin.rollControls ?? {}));
    register(rollOptions, "roll options", Object.entries(plugin.rollOptions ?? {}));
    if (plugin.legacySheet) {
      if (legacySheet) throw new Error("Duplicate legacy sheet conventions");
      legacySheet = plugin.legacySheet;
    }
  }
  return { fieldRenderers, rowSelectors, rollControls, rollOptions, legacySheet, lazyRenderUi };
}

/** A loaded catalog's capabilities over the enclosing ones; a key both define must be the same capability. */
export function extendSystemPluginUiCatalog(
  parent: SystemPluginUiCatalog,
  render: SystemPluginRenderUiCatalog | null,
  runtime: SystemPluginRuntimeUiCatalog | null,
): Partial<SystemPluginUiCatalog> {
  const merge = <T>(kind: string, base: ReadonlyMap<string, T>, added: ReadonlyMap<string, T> | undefined) => {
    if (!added || added.size === 0) return base;
    const merged = new Map(base);
    for (const [key, value] of added) {
      if (merged.has(key) && merged.get(key) !== value) throw new Error(`Duplicate plugin ${kind}: ${key}`);
      merged.set(key, value);
    }
    return merged;
  };
  if (render?.legacySheet && parent.legacySheet && render.legacySheet !== parent.legacySheet) {
    throw new Error("Duplicate legacy sheet conventions");
  }
  return {
    fieldRenderers: merge("field renderer", parent.fieldRenderers, render?.fieldRenderers),
    rowSelectors: merge("row selector", parent.rowSelectors, render?.rowSelectors),
    rollControls: merge("roll control", parent.rollControls, render?.rollControls),
    rollOptions: merge("roll options", parent.rollOptions, render?.rollOptions),
    legacySheet: render?.legacySheet ?? parent.legacySheet,
    sheetAdapters: merge("sheet adapter", parent.sheetAdapters, runtime?.sheetAdapters),
  };
}
