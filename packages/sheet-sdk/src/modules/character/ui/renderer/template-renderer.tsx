"use client";

import { useMemo } from "react";
import type { Template, Schema, SheetMode } from "@skald/types/schema";
import { PageRenderer } from "./page-renderer";
import { SheetModeProvider, useSheetMode } from "./sheet-mode";
import { WebViewRenderer } from "./web-view-renderer";
import {
  SchemaStaticContext,
  SchemaDataContext,
  type SchemaStaticContextValue,
  type FieldHandlers,
  type ViewMode,
  type OptionSources,
} from "./schema-context";
import {
  RollProvider,
  useRollOptional,
  type DiceRollerCallback,
} from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import { SchemaI18nBoundary } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import type { FormulaValue } from "@skald/formula";
import {
  evaluateCharacterFormulaRuntime,
  inputDefaultsOf,
  withInputDefaults,
  withSchemaInputDefaults,
  type CharacterFormulaRuntime,
} from "@skald/sheet-sdk/modules/sheet-schema";
import { RollDataProvider } from "./roll-data-context";
import type { PlayViewModes } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";
import { SheetViewerContext, type SheetViewer } from "./viewer-context";

export type { ViewMode, OptionSources };

/**
 * 擲骰 context 由宿主提供（角色卡頁的 CharacterSheetRuntime）；宿主沒有提供時
 * （遊戲桌、浮動卡、範本編輯器預覽等直接使用 TemplateRenderer 的地方）
 * 才在這裡補一個，行為與以前相同。
 */
function RollScope({
  characterId,
  characterName,
  onDiceRoll,
  children,
}: {
  characterId?: string;
  characterName?: string;
  onDiceRoll?: DiceRollerCallback;
  children: React.ReactNode;
}) {
  const inherited = useRollOptional();
  if (inherited) return <>{children}</>;
  return (
    <RollProvider
      characterId={characterId}
      characterName={characterName}
      onDiceRoll={onDiceRoll}
    >
      {children}
    </RollProvider>
  );
}

export interface TemplateRendererProps {
  /** 模板定義 */
  template: Template;
  /** Schema 定義 */
  schema: Schema;
  /** 角色資料 */
  data: Record<string, unknown>;
  /** 資料變更回調 */
  onChange?: (path: string, value: unknown) => void;
  /** 資料整體更新回調（用於 handler） */
  setData?: (
    updater:
      | Record<string, unknown>
      | ((prev: Record<string, unknown>) => Record<string, unknown>),
  ) => void;
  /** 欄位 handlers */
  handlers?: FieldHandlers;
  /** 動態選項來源（用於 select 欄位的 optionModule） */
  optionSources?: OptionSources;
  /** 是否為編輯模式（數值可編輯） */
  editable?: boolean;
  /** 設定模式：是否顯示進階設定按鈕（資產計算、年齡調整等） */
  setupMode?: boolean;
  /** 是否為列印模式 */
  printMode?: boolean;
  /** 顯示模式：print（固定尺寸）或 web（響應式） */
  viewMode?: ViewMode;
  /**
   * 操作模式（僅 views.web 使用）：play 或 edit。
   * 省略時沿用宿主以 SheetModeProvider 提供的值，再沒有就是 play。
   */
  mode?: SheetMode;
  /** 角色 ID（用於擲骰） */
  characterId?: string;
  /** 角色名稱（用於擲骰） */
  characterName?: string;
  /** 3D 擲骰器回呼（由 table page 提供） */
  onDiceRoll?: DiceRollerCallback;
  /** 欄位失焦回調（用於觸發 Yjs 儲存） */
  onBlur?: () => void;
  /** 開啟右側設定面板 */
  onOpenPanel?: (panelId: string) => void;
  /** 目前不可變 Template Version 的公式與角色覆寫 */
  formulaRuntime?: CharacterFormulaRuntime;
  /** 儲存一個角色擁有的衍生值覆寫 */
  onSetDerivedOverride?: (
    fieldId: string,
    value: FormulaValue,
  ) => void | Promise<void>;
  /** 清除一個覆寫並恢復 Template Version 自動計算 */
  onRefreshDerivedOverride?: (fieldId: string) => void | Promise<void>;
  /**
   * 系統的遊玩版面（sheet adapter 的 `playView`）：網頁、遊玩模式時取代範本的網頁版面，
   * 在這裡的 schema／資料／擲骰 context 裡渲染。編輯模式與列印照舊渲染範本。
   */
  playView?: React.ReactNode;
  /** `playView` 用在哪些模式；"both" 時編輯模式也是遊玩版面（預設 "play"） */
  playViewModes?: PlayViewModes;
  /** 只有 Template Editor 的編輯畫布會傳入；見 schema-context.tsx 的說明 */
  wrapCanvasElement?: SchemaStaticContextValue["wrapCanvasElement"];
  /** 只有編輯畫布會傳入；見 schema-context.tsx 的說明 */
  renderCanvasDropZone?: SchemaStaticContextValue["renderCanvasDropZone"];
  /**
   * 宿主已確認的觀看者身分（卡主、桌的 GM），只供顯示用，不是權限：被藏起的內容仍在
   * 角色資料裡送到瀏覽器。省略＝不知道，不提供 SheetViewerContext（樹與以前相同）。
   */
  viewer?: SheetViewer;
}

export function TemplateRenderer({
  template,
  schema,
  data,
  onChange,
  setData,
  handlers,
  optionSources,
  editable = false,
  setupMode = false,
  printMode = false,
  viewMode = "print",
  mode,
  characterId,
  characterName,
  onDiceRoll,
  onBlur,
  onOpenPanel,
  onSetDerivedOverride,
  onRefreshDerivedOverride,
  playView,
  playViewModes = "play",
  wrapCanvasElement,
  renderCanvasDropZone,
  formulaRuntime: hostFormulaRuntime,
  viewer,
}: TemplateRendererProps) {
  // 以角色值記憶，宿主每次 render 傳新物件也不會讓讀者重新渲染
  const hasViewer = viewer !== undefined;
  const viewerIsOwner = viewer?.isOwner;
  const viewerIsGM = viewer?.isGM;
  const viewerHostShowsPortrait = viewer?.hostShowsPortrait;
  const viewerValue = useMemo<SheetViewer | undefined>(() => {
    if (!hasViewer) return undefined;
    const value: SheetViewer = {};
    if (viewerIsOwner !== undefined) value.isOwner = viewerIsOwner;
    if (viewerIsGM !== undefined) value.isGM = viewerIsGM;
    if (viewerHostShowsPortrait !== undefined) value.hostShowsPortrait = viewerHostShowsPortrait;
    return value;
  }, [hasViewer, viewerIsOwner, viewerIsGM, viewerHostShowsPortrait]);
  // Formulas and rolls read an input absent from the data as its schema default, so a character
  // saved before the field existed computes and rolls as a new one (read only, never written).
  const formulaRuntime = useMemo(
    () => (hostFormulaRuntime ? withSchemaInputDefaults(hostFormulaRuntime, schema) : undefined),
    [hostFormulaRuntime, schema],
  );
  const inputDefaults = useMemo(
    () => formulaRuntime?.inputDefaults ?? inputDefaultsOf(Object.values(schema.fields)),
    [formulaRuntime, schema],
  );
  const inheritedMode = useSheetMode();
  const effectiveMode = mode ?? inheritedMode;
  // 系統的遊玩版面只在網頁出現：預設只在遊玩模式，"both" 時編輯模式也是；列印永遠是範本
  const showPlayView =
    playView !== undefined && playView !== null && viewMode === "web" && !printMode &&
    (effectiveMode === "play" || playViewModes === "both");
  // 範本有 views.web 才走新路徑；列印永遠渲染 pages，沒有 views.web 的範本不受影響
  const webView =
    viewMode === "web" && !printMode ? template.views?.web : undefined;
  // 根 class 決定 styles/sheet-sdk.css 的哪組規則生效：web view 用容器斷點自己排版，
  // 不能吃到舊路徑那些依 viewport 與固定 section／欄位 id 重排的規則
  const rootViewClass = showPlayView
    ? "view-mode-play-view"
    : webView
    ? "view-mode-web-view"
    : viewMode === "web"
      ? "view-mode-web"
      : "view-mode-print";
  const compiledStyle = formulaRuntime?.styleArtifact;
  const rootAttributeValue = compiledStyle?.rootAttribute.startsWith(
    "data-skald-template-version=",
  )
    ? compiledStyle.rootAttribute.slice("data-skald-template-version=".length)
    : undefined;

  // CSS 變數樣式
  const cssVarsStyle = useMemo(() => {
    const vars: Record<string, string> = {};
    for (const [key, value] of Object.entries(compiledStyle?.variables ?? {})) {
      if (key.startsWith("--skald-") && typeof value === "string") {
        vars[key] = value;
      }
    }
    return vars as React.CSSProperties;
  }, [compiledStyle?.variables]);

  const staticContextValue = useMemo<SchemaStaticContextValue>(
    () => ({
      schema,
      onChange,
      setData,
      handlers,
      optionSources,
      editable,
      setupMode,
      printMode,
      viewMode,
      onBlur,
      onOpenPanel,
      formulaRuntime,
      onSetDerivedOverride,
      onRefreshDerivedOverride,
      wrapCanvasElement,
      renderCanvasDropZone,
    }),
    [
      schema,
      onChange,
      setData,
      handlers,
      optionSources,
      editable,
      setupMode,
      printMode,
      viewMode,
      onBlur,
      onOpenPanel,
      formulaRuntime,
      onSetDerivedOverride,
      onRefreshDerivedOverride,
      wrapCanvasElement,
      renderCanvasDropZone,
    ]
  );

  const dataContextValue = useMemo(
    () => ({
      data,
    }),
    [data]
  );

  // 擲骰讀 `@` 參照時要看得到公式算出的值（含覆寫），例如 `{{#d20[@strMod]}}`
  const rollData = useMemo(
    () =>
      formulaRuntime
        ? { ...withInputDefaults(data, inputDefaults), ...evaluateCharacterFormulaRuntime(formulaRuntime, data).derivedValues }
        : withInputDefaults(data, inputDefaults),
    [data, formulaRuntime, inputDefaults]
  );

  const content = (
    <RollScope
      characterId={characterId}
      characterName={characterName}
      onDiceRoll={onDiceRoll}
    >
      <SchemaStaticContext.Provider value={staticContextValue}>
        <SchemaDataContext.Provider value={dataContextValue}>
          <RollDataProvider source={data} value={rollData}>
          <SchemaI18nBoundary>
            <>
              {compiledStyle && <style>{compiledStyle.css}</style>}
              <div
                className={`skald-template ${printMode ? "print-mode" : ""} ${rootViewClass}`}
                data-skald-template-version={rootAttributeValue}
                style={cssVarsStyle}
              >
                {showPlayView ? (
                  <SheetModeProvider mode={effectiveMode}>{playView}</SheetModeProvider>
                ) : webView ? (
                  <SheetModeProvider mode={effectiveMode}>
                    <WebViewRenderer view={webView} />
                  </SheetModeProvider>
                ) : (
                  template.pages.map((page, index) => (
                    <PageRenderer
                      key={page.id}
                      page={page}
                      pageIndex={index}
                      totalPages={template.pages.length}
                      viewMode={viewMode}
                    />
                  ))
                )}
              </div>
            </>
          </SchemaI18nBoundary>
          </RollDataProvider>
        </SchemaDataContext.Provider>
      </SchemaStaticContext.Provider>
    </RollScope>
  );
  // 宿主沒給 viewer 時不包 provider，CoC／D&D 等既有的渲染樹完全不變
  return viewerValue ? (
    <SheetViewerContext.Provider value={viewerValue}>{content}</SheetViewerContext.Provider>
  ) : (
    content
  );
}
