// modules/character/ui/renderer/web-section-renderer.tsx
//
// `views.web` 的區塊與版面渲染。與舊的 SectionRenderer／LayoutRenderer 分開：
// 舊路徑用視窗 media query 與 mobileLayout，這裡一律依容器斷點解析顯式的
// 版面值，所以舊範本完全不經過這個檔案。
"use client";

import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import type {
  Breakpoint,
  CampaignRules,
  Field,
  FieldReference,
  GridLayout,
  Layout,
  Section,
  SheetMode,
  SizeUnit,
  Spacing,
  StackLayout,
  StickyConfig,
} from "@skald/types/schema";
import { FieldRenderer } from "./field-renderer";
import { useSchemaData, useSchemaStatic } from "./schema-context";
import {
  resolveLayout,
  resolveResponsive,
  resolveVisible,
  useSheetBreakpoint,
} from "./sheet-breakpoint";
import { isVisibleInMode, useCampaignRules, useSheetMode } from "./sheet-mode";
import { sizeToCSS } from "./utils/layout-utils";
import { evaluateCondition } from "@skald/sheet-sdk/lib/condition-utils";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { cn } from "@skald/sheet-sdk/lib/utils";

type WebNode = Section | Field | FieldReference;

// ============================================================================
// 版面
// ============================================================================

const SPACING_REM: Record<string, string> = {
  none: "0",
  xs: "0.25rem",
  sm: "0.5rem",
  md: "1rem",
  lg: "1.5rem",
  xl: "2rem",
};

function spacingToCss(spacing: Spacing | undefined): string | undefined {
  if (!spacing) return undefined;
  return SPACING_REM[spacing] ?? spacing;
}

/** `Nfr` 加 `minmax(0, …)`：fr 軌道的最小值預設是內容寬度，會把格子撐破容器。 */
function trackToCss(track: SizeUnit | string): string {
  const css = sizeToCSS(track as SizeUnit) ?? "1fr";
  return css.endsWith("fr") ? `minmax(0, ${css})` : css;
}

function gridTemplate(columns: GridLayout["columns"]): string {
  if (typeof columns === "number") {
    return `repeat(${columns}, minmax(0, 1fr))`;
  }
  if (typeof columns === "string") return columns;
  return columns.map(trackToCss).join(" ");
}

const JUSTIFY: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
  evenly: "space-evenly",
};

const ALIGN: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  baseline: "baseline",
};

// gap 只用 columnGap／rowGap，不用 gap 簡寫：stack 與 grid 在同一個節點上互換
// （`at` 或容器寬度跨斷點）時，React 對「簡寫換成長寫」會警告 Removing gap
function stackStyle(layout: StackLayout): CSSProperties {
  const gap = spacingToCss(layout.gap);
  return {
    display: "flex",
    flexDirection: layout.direction === "row" ? "row" : "column",
    flexWrap: layout.wrap ? "wrap" : undefined,
    columnGap: gap,
    rowGap: gap,
    justifyContent: layout.justify ? JUSTIFY[layout.justify] : undefined,
    alignItems: layout.align ? ALIGN[layout.align] : undefined,
  };
}

function gridStyle(layout: GridLayout): CSSProperties {
  const gap = spacingToCss(layout.gap);
  return {
    display: "grid",
    gridTemplateColumns: gridTemplate(layout.columns),
    gridTemplateRows: layout.rows ? gridTemplate(layout.rows) : undefined,
    gridAutoFlow: layout.flow,
    columnGap: spacingToCss(layout.columnGap) ?? gap,
    rowGap: spacingToCss(layout.rowGap) ?? gap,
    alignItems: layout.align ? ALIGN[layout.align] : undefined,
    justifyItems:
      layout.justifyItems && layout.justifyItems !== "baseline"
        ? layout.justifyItems
        : undefined,
  };
}

/**
 * 顯式版面：stack 的方向、grid 的欄數都照解析後的值輸出，不做任何隱含的
 * 響應式翻轉——斷點差異全部由 `at` 表達。
 */
export function WebLayout({
  layout,
  children,
  className,
}: {
  layout: Layout;
  children: ReactNode;
  className?: string;
}) {
  const base: CSSProperties =
    layout.type === "stack"
      ? stackStyle(layout)
      : layout.type === "grid"
        ? gridStyle(layout)
        : {};

  const style: CSSProperties = {
    ...base,
    width: sizeToCSS(layout.width),
    height: sizeToCSS(layout.height),
    minWidth: sizeToCSS(layout.minWidth) ?? 0,
    maxWidth: sizeToCSS(layout.maxWidth),
    padding: spacingToCss(layout.padding),
    margin: spacingToCss(layout.margin),
  };

  return (
    <div className={cn("skald-web-layout", className)} style={style}>
      {children}
    </div>
  );
}

// ============================================================================
// 可見性
// ============================================================================

interface VisibilityContext {
  data: Record<string, unknown>;
  mode: SheetMode;
  breakpoint: Breakpoint;
  /** 範本編輯畫布要看得到所有節點，作者才選得到 */
  showAll: boolean;
}

/** visibleWhen、modes、visible 三個條件都成立才顯示；畫布模式一律顯示。 */
export function isWebNodeVisible(
  node: {
    visibleWhen?: string;
    modes?: readonly SheetMode[];
    visible?: Parameters<typeof resolveVisible>[0];
  },
  { data, mode, breakpoint, showAll }: VisibilityContext,
): boolean {
  if (showAll) return true;
  if (node.visibleWhen && !evaluateCondition(node.visibleWhen, data)) {
    return false;
  }
  if (!isVisibleInMode(node.modes, mode)) return false;
  return resolveVisible(node.visible, breakpoint);
}

/** 區塊是否渲染：一般可見性，加上宿主沒有提供內容的 slot 不渲染 */
function isSectionShown(
  section: Section,
  visibility: VisibilityContext,
  campaignRules: CampaignRules | null,
): boolean {
  if (!isWebNodeVisible(section, visibility)) return false;
  return !(
    section.slot === "campaign-rules" &&
    campaignRules === null &&
    !visibility.showAll
  );
}

function useVisibilityContext(): VisibilityContext {
  const data = useSchemaData();
  const { wrapCanvasElement } = useSchemaStatic();
  const mode = useSheetMode();
  const breakpoint = useSheetBreakpoint() ?? "base";
  return { data, mode, breakpoint, showAll: Boolean(wrapCanvasElement) };
}

// ============================================================================
// 節點清單
// ============================================================================

/** 區塊與欄位引用依可見性過濾後的清單 */
export function WebNodeList({
  nodes,
  parentLayout,
}: {
  nodes: readonly WebNode[];
  parentLayout: Layout;
}) {
  const visibility = useVisibilityContext();
  const campaignRules = useCampaignRules();

  return nodes.map((node, index) => {
    if (node.type === "section") {
      if (!isSectionShown(node, visibility, campaignRules)) return null;
      return (
        <WebSectionRenderer
          key={node.id}
          section={node}
          parentLayout={parentLayout}
        />
      );
    }

    if (node.type === "field-ref") {
      if (!isWebNodeVisible(node, visibility)) return null;
      return <FieldRenderer key={`${node.fieldId}-${index}`} fieldRef={node} />;
    }

    // 沒有 id 的 heading／divider 補一個合成 id，與舊路徑一致
    if (
      (node.type === "heading" || node.type === "divider") &&
      !("id" in node && node.id)
    ) {
      const syntheticId = `${node.type}-${index}`;
      return (
        <FieldRenderer
          key={syntheticId}
          field={{ ...node, id: syntheticId } as Field}
        />
      );
    }

    if ("id" in node && node.id) {
      return <FieldRenderer key={node.id} field={node} />;
    }
    return null;
  });
}

// ============================================================================
// 區塊
// ============================================================================

/**
 * `sticky.top` 是 CSS 長度。沒有單位的 "0"（或 "0.0"）在 `calc(100dvh - 0)` 裡是
 * 無效運算式，整條 maxHeight 會被瀏覽器丟掉，所以補成 "0px"。其他沒有單位的數字
 * 不是合法長度，一樣視為 0px，而不是產出無效的 calc。
 */
export function normalizeStickyTop(top: string | undefined): string {
  const value = top?.trim();
  if (!value) return "0px";
  if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(value)) {
    return Number(value) === 0 ? "0px" : `${value}px`;
  }
  return value;
}

function stickyStyle(
  sticky: boolean | StickyConfig | undefined,
  parentLayout: Layout,
): CSSProperties | undefined {
  if (!sticky) return undefined;
  const config: StickyConfig = sticky === true ? {} : sticky;
  const top = normalizeStickyTop(config.top);

  const style: CSSProperties = { position: "sticky", top, zIndex: 1 };

  // sticky 要在 grid 或橫向 flex 裡生效，元素本身不能被 stretch 成整列高；
  // 直向 flex 的交叉軸是寬度，改成 start 會把它縮窄，所以不動
  const crossAxisIsHeight =
    parentLayout.type === "grid" ||
    (parentLayout.type === "stack" && parentLayout.direction === "row");
  if (crossAxisIsHeight) style.alignSelf = "start";

  if (config.maxHeight === "viewport") {
    style.maxHeight = `calc(100dvh - ${top})`;
    style.overflowY = "auto";
    style.overscrollBehavior = "contain";
  }
  return style;
}

function sectionBoxStyle(section: Section): CSSProperties {
  const style: CSSProperties = {};
  const layout = section.sectionLayout;
  if (layout) {
    const width = layout.width;
    if (width === "fill") {
      style.flex = 1;
      style.minWidth = 0;
    } else if (typeof width === "string" && width.endsWith("fr")) {
      const fr = Number.parseFloat(width.slice(0, -2));
      if (Number.isFinite(fr) && fr > 0) {
        style.flex = `${fr} ${fr} 0%`;
        style.minWidth = 0;
      }
    } else if (width) {
      style.width = width;
      style.maxWidth = "100%";
      style.flexShrink = 0;
    }
    if (layout.marginTop) style.marginTop = layout.marginTop;
  }

  const position = section.gridPosition;
  if (position) {
    if (position.column) style.gridColumn = position.column;
    if (position.columnSpan) style.gridColumn = `span ${position.columnSpan}`;
    if (position.row) style.gridRow = position.row;
    if (position.rowSpan) style.gridRow = `span ${position.rowSpan}`;
  }
  return style;
}

function WebSectionTitle({
  title,
  variant,
  align,
}: {
  title: string;
  variant: NonNullable<Section["titleVariant"]>;
  align?: "left" | "center" | "right";
}) {
  return (
    <div
      className="skald-web-section-title"
      data-variant={variant}
      style={align ? { textAlign: align } : undefined}
    >
      {title}
    </div>
  );
}

export function WebSectionRenderer({
  section,
  parentLayout,
  hideTitle = false,
}: {
  section: Section;
  parentLayout: Layout;
  /** 分頁面板內：標題已經是分頁名稱，不重複 */
  hideTitle?: boolean;
}) {
  const visibility = useVisibilityContext();
  const campaignRules = useCampaignRules();
  const { wrapCanvasElement } = useSchemaStatic();
  const { resolveI18n } = useSchemaI18n();
  const { breakpoint } = visibility;

  if (!isSectionShown(section, visibility, campaignRules)) return null;

  const display = resolveResponsive(section.display, breakpoint) ?? "stack";
  const layout = resolveLayout(section.layout, section.at, breakpoint);
  const sticky = stickyStyle(
    resolveResponsive(section.sticky, breakpoint),
    parentLayout,
  );
  const border = section.border ?? "none";
  const background = section.background ?? "none";
  const showTitle =
    !hideTitle && !!section.title && section.titleVariant !== "hidden";

  const content = (
    <div
      className={cn("skald-section skald-web-section", section.customClass)}
      data-section-id={section.id}
      data-display={display}
      data-sticky={sticky ? "true" : undefined}
      data-border={border === "none" ? undefined : border}
      data-background={background === "none" ? undefined : background}
      style={{ ...sectionBoxStyle(section), ...sticky }}
    >
      {showTitle && (
        <WebSectionTitle
          title={resolveI18n(section.title ?? "")}
          variant={section.titleVariant ?? "default"}
          align={section.titleStyle?.align}
        />
      )}
      {display === "tabs" ? (
        <WebTabs section={section} layout={layout} />
      ) : (
        <WebLayout layout={layout}>
          <WebNodeList nodes={section.children} parentLayout={layout} />
        </WebLayout>
      )}
    </div>
  );

  return wrapCanvasElement
    ? wrapCanvasElement(section.id, "section", content)
    : content;
}

// ============================================================================
// 分頁（WAI-ARIA Tabs pattern）
// ============================================================================

/**
 * 子 section 變成分頁，各自的 title 當分頁名；其餘子節點照常渲染在分頁列上方。
 * 鍵盤：← → 在分頁間移動並啟用（自動啟用），Home／End 跳到頭尾；
 * 只有目前分頁在 tab 順序裡（roving tabindex），面板本身可聚焦。
 */
function WebTabs({ section, layout }: { section: Section; layout: Layout }) {
  const visibility = useVisibilityContext();
  const campaignRules = useCampaignRules();
  const { resolveI18n } = useSchemaI18n();
  const t = useTranslations("renderer");
  const idBase = useId();
  const [activeId, setActiveId] = useState<string | null>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const tabs = section.children.filter(
    (child): child is Section =>
      child.type === "section" &&
      isSectionShown(child, visibility, campaignRules),
  );
  const leading = section.children.filter((child) => child.type !== "section");

  // 目前分頁因為模式或斷點變化而消失時，退回第一個
  const selected = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  const tabId = (id: string) => `${idBase}-tab-${id}`;
  const panelId = (id: string) => `${idBase}-panel-${id}`;

  const activate = (id: string) => {
    setActiveId(id);
    tabRefs.current.get(id)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!selected) return;
    const index = tabs.findIndex((tab) => tab.id === selected.id);
    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight":
        next = (index + 1) % tabs.length;
        break;
      case "ArrowLeft":
        next = (index - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    activate(tabs[next].id);
  };

  return (
    <>
      {leading.length > 0 && (
        <WebLayout layout={layout}>
          <WebNodeList nodes={leading} parentLayout={layout} />
        </WebLayout>
      )}
      {selected && (
        <>
          <div
            role="tablist"
            aria-orientation="horizontal"
            aria-label={
              section.title
                ? resolveI18n(section.title)
                : t("webTabsFallbackName")
            }
            className="skald-web-tablist"
            onKeyDown={onKeyDown}
          >
            {tabs.map((tab) => {
              const isSelected = tab.id === selected.id;
              return (
                <button
                  key={tab.id}
                  ref={(element) => {
                    if (element) tabRefs.current.set(tab.id, element);
                    else tabRefs.current.delete(tab.id);
                  }}
                  type="button"
                  role="tab"
                  id={tabId(tab.id)}
                  className="skald-web-tab"
                  aria-selected={isSelected}
                  aria-controls={panelId(tab.id)}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => setActiveId(tab.id)}
                >
                  {resolveI18n(tab.title ?? tab.id)}
                </button>
              );
            })}
          </div>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              role="tabpanel"
              id={panelId(tab.id)}
              className="skald-web-tabpanel"
              aria-labelledby={tabId(tab.id)}
              tabIndex={0}
              hidden={tab.id !== selected.id}
            >
              <WebSectionRenderer
                section={tab}
                parentLayout={layout}
                hideTitle
              />
            </div>
          ))}
        </>
      )}
    </>
  );
}
