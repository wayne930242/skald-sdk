"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import type { Section, Field, FieldReference } from "@skald/types/schema";
import { DEFAULT_SECTION_LAYOUT } from "@skald/sheet-sdk/modules/sheet-schema";
import { LayoutRenderer } from "./layout-renderer";
import { FieldRenderer } from "./field-renderer";
import { useSchemaData, useSchemaStatic, useViewMode } from "./schema-context";
import { evaluateCondition } from "@skald/sheet-sdk/lib/condition-utils";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { usePrintHygiene } from "./print-hygiene";
import { useSystemOptional } from "@skald/sheet-sdk/components/providers/system-provider";
import { useSystemPluginUi } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import { fieldRendererKey } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";

interface SectionRendererProps {
  section: Omit<Section, "layout"> & { layout?: Section["layout"] };
}

export function SectionRenderer({ section }: SectionRendererProps) {
  const data = useSchemaData();
  const viewMode = useViewMode();
  const { wrapCanvasElement, renderCanvasDropZone, schema, formulaRuntime } = useSchemaStatic();
  const { resolveI18n } = useSchemaI18n();
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const printHygiene = usePrintHygiene();
  const { fieldRenderers } = useSystemPluginUi();
  const systemId = useSystemOptional()?.systemId;

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(max-width: 767px)");

    const updateViewport = (event?: MediaQueryListEvent) => {
      setIsMobileViewport(event ? event.matches : query.matches);
    };

    updateViewport();
    query.addEventListener("change", updateViewport);
    return () => query.removeEventListener("change", updateViewport);
  }, []);

  // 評估 section 層級的 visibleWhen 條件
  if (section.visibleWhen) {
    const isVisible = evaluateCondition(section.visibleWhen, data);
    if (!isVisible) return null;
  }

  // 列印文件（通用列印）：欄位全被省略的區塊連標題一起省略
  if (printHygiene && !wrapCanvasElement && printHygiene.omitsSection(section, {
    schema, data, formulaRuntime,
    systemDraws: (type, fieldId) => !!systemId && fieldRenderers.has(fieldRendererKey(type, { systemId, fieldId })),
  })) {
    return null;
  }

  // Published page sections can omit layout; leave the stored template untouched.
  const effectiveLayout =
    (viewMode === "web" && isMobileViewport ? section.mobileLayout : undefined)
    ?? section.layout
    ?? DEFAULT_SECTION_LAYOUT;

  // 邊框樣式 - 使用主題色，列印時強制黑色
  const borderStyles: Record<string, string> = {
    none: "",
    solid: "border border-foreground print:border-black",
    dashed: "border border-dashed border-foreground print:border-black",
  };

  // 背景樣式
  const bgStyles: Record<string, string> = {
    none: "",
    light: "bg-muted/30",
    dark: "bg-muted",
  };

  // 處理 sectionLayout 的樣式
  // 在 web mode 時，避免套用固定寬度，因為響應式佈局會改變 flex 方向
  // 例如：父層從 flex-row 變成 flex-col 時，子層的固定寬度會造成問題
  const sectionStyle: React.CSSProperties = {};
  if (section.sectionLayout) {
    if (section.sectionLayout.width === "fill") {
      sectionStyle.flex = 1;
      sectionStyle.minWidth = 0; // 允許 flex 子元素收縮
    } else if (
      typeof section.sectionLayout.width === "string" &&
      section.sectionLayout.width.endsWith("fr")
    ) {
      if (viewMode === "web" && isMobileViewport) {
        sectionStyle.width = "100%";
        sectionStyle.maxWidth = "100%";
        sectionStyle.flexShrink = 1;
      } else {
        const fr = Number.parseFloat(section.sectionLayout.width.slice(0, -2));
        if (Number.isFinite(fr) && fr > 0) {
          sectionStyle.flex = `${fr} ${fr} 0%`;
          sectionStyle.minWidth = 0;
        }
      }
    } else if (section.sectionLayout.width) {
      // Desktop web + print 保留固定寬度；mobile web 強制滿寬，避免欄位過窄。
      if (viewMode === "web" && isMobileViewport) {
        sectionStyle.width = "100%";
        sectionStyle.maxWidth = "100%";
        sectionStyle.flexShrink = 1;
      } else {
        sectionStyle.width = section.sectionLayout.width;
        sectionStyle.maxWidth = "100%";
        sectionStyle.flexShrink = 0; // 固定寬度不收縮
      }
    }
    if (section.sectionLayout.height && viewMode === "print") {
      // 只在 print mode 套用固定高度
      sectionStyle.height = section.sectionLayout.height;
    }
    if (
      section.sectionLayout.marginTop &&
      !(viewMode === "web" && isMobileViewport)
    ) {
      // mobile web 移除固定 marginTop，避免分欄堆疊後上下間距失衡
      sectionStyle.marginTop = section.sectionLayout.marginTop;
    }
  }

  // 處理 gridPosition
  if (section.gridPosition) {
    if (section.gridPosition.column) {
      sectionStyle.gridColumn = section.gridPosition.column;
    }
    if (section.gridPosition.columnSpan) {
      sectionStyle.gridColumn = `span ${section.gridPosition.columnSpan}`;
    }
    if (section.gridPosition.row) {
      sectionStyle.gridRow = section.gridPosition.row;
    }
    if (section.gridPosition.rowSpan) {
      sectionStyle.gridRow = `span ${section.gridPosition.rowSpan}`;
    }
  }

  // 有邊框時加入 padding
  const hasBorder = section.border && section.border !== "none";

  // 編輯畫布需要看到並選取所有欄位，即使它依 visibleWhen 在目前測試資料下不可見——
  // 否則作者永遠碰不到那個欄位。live sheet／Preview 沒有 wrapCanvasElement，行為不變。
  const isCanvasMode = Boolean(wrapCanvasElement);
  // 拖放區是額外插入的 DOM 節點；stack 版面下只是多幾個扁平的兄弟節點沒差，
  // 但 grid 版面裡每個節點都會佔一個格子——插進去會把原本的欄數擠亂
  // （4 欄的 grid 因為多了拖放區節點，實際只剩一半的格子放得下真正的欄位）。
  // grid 版面就不插拖放區，靠拖到欄位本身（sortable 的 rect 碰撞判定）來重新排序。
  const dropZonesEnabled = Boolean(renderCanvasDropZone) && effectiveLayout.type !== "grid";

  const content = (
    <div
      className={cn(
        "skald-section",
        borderStyles[section.border || "none"],
        bgStyles[section.background || "none"],
        hasBorder && "p-2",
        section.customClass,
      )}
      data-section-id={section.id}
      style={sectionStyle}
    >
      {/* 標題 */}
      {section.title && section.titleVariant !== "hidden" && (
        <SectionTitle
          title={resolveI18n(section.title)}
          variant={section.titleVariant || "default"}
          titleStyle={section.titleStyle}
        />
      )}

      {/* 內容 */}
      <LayoutRenderer layout={effectiveLayout}>
        {section.children
          .filter((child) => {
            if (isCanvasMode) return true;
            // 預先過濾掉 visibleWhen 為 false 的 section
            if (child.type === "section" && child.visibleWhen) {
              return evaluateCondition(child.visibleWhen, data);
            }
            return true;
          })
          .flatMap((child, index) => {
            const dropZone =
              dropZonesEnabled && renderCanvasDropZone
                ? renderCanvasDropZone(section.id, index, section.children.length === 0)
                : null;

            let rendered: ReactNode = null;
            if (child.type === "section") {
              rendered = <SectionRenderer key={child.id} section={child} />;
            } else if (child.type === "field-ref") {
              // 評估 visibleWhen 條件
              const fieldRef = child as FieldReference;
              const isHidden =
                !isCanvasMode &&
                fieldRef.visibleWhen &&
                !evaluateCondition(fieldRef.visibleWhen, data);
              if (!isHidden) {
                rendered = (
                  <FieldRenderer
                    key={`${child.fieldId}-${index}`}
                    fieldRef={child}
                  />
                );
              }
            } else if (
              // Handle inline field types (heading, divider) that may lack an id
              (child.type === "heading" || child.type === "divider") &&
              !("id" in child && child.id)
            ) {
              const syntheticId = `${child.type}-${index}`;
              rendered = (
                <FieldRenderer
                  key={syntheticId}
                  field={{ ...child, id: syntheticId } as Field}
                />
              );
            } else if ("id" in child && child.id) {
              // 直接是 Field
              rendered = <FieldRenderer key={child.id} field={child} />;
            }

            return dropZone
              ? [
                  <Fragment key={`dropzone-${section.id}-${index}`}>
                    {dropZone}
                  </Fragment>,
                  rendered,
                ]
              : [rendered];
          })}
        {dropZonesEnabled && renderCanvasDropZone && (
          <Fragment key={`dropzone-${section.id}-${section.children.length}`}>
            {renderCanvasDropZone(section.id, section.children.length, section.children.length === 0)}
          </Fragment>
        )}
      </LayoutRenderer>
    </div>
  );

  return wrapCanvasElement
    ? wrapCanvasElement(section.id, "section", content)
    : content;
}

interface TitleStyle {
  size?: "xs" | "sm" | "base" | "lg" | "xl" | "2xl" | "3xl";
  align?: "left" | "center" | "right";
  weight?: "normal" | "medium" | "semibold" | "bold";
}

/**
 * 標題階層：每一級都必須同時交代螢幕與紙本尺寸。
 *
 * 收斂前這三組數值散在各 variant 的 return 裡各寫一次，列印尺寸還混用了
 * 8/10/11px 與 xs/sm，改一級要翻遍整個檔案才知道有沒有踩到別級。
 */
const TITLE_SCALE = {
  section: "text-base md:text-lg print:text-sm",
  box: "text-sm md:text-base print:text-xs",
  sub: "text-xs md:text-sm print:text-2xs",
} as const;

/** 所有標題共用的字體語彙。uppercase 不在其中：decorated 是裝飾性標題，刻意保留原始大小寫 */
const TITLE_BASE = "tracking-wider font-serif";

function SectionTitle({
  title,
  variant,
  titleStyle,
}: {
  title: string;
  variant: "default" | "decorated" | "underlined" | "hidden" | "small";
  titleStyle?: TitleStyle;
}) {
  // 如果有自訂 titleStyle，使用自訂樣式
  if (titleStyle) {
    const sizeClasses: Record<string, string> = {
      xs: "text-xs",
      sm: "text-sm",
      base: "text-base",
      lg: "text-lg",
      xl: "text-xl",
      "2xl": "text-2xl",
      "3xl": "text-3xl",
    };
    const alignClasses: Record<string, string> = {
      left: "text-left",
      center: "text-center",
      right: "text-right",
    };
    const weightClasses: Record<string, string> = {
      normal: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
    };

    return (
      <div
        className={cn(
          "mb-3 tracking-wider font-serif",
          sizeClasses[titleStyle.size || "base"],
          alignClasses[titleStyle.align || "left"],
          weightClasses[titleStyle.weight || "bold"],
        )}
      >
        {title}
      </div>
    );
  }

  if (variant === "decorated") {
    const flourish = (
      <div className="flex items-center justify-center gap-3">
        <div className="w-16 h-px bg-foreground print:bg-black" />
        <div className="w-1.5 h-1.5 rounded-full bg-foreground print:bg-black" />
        <div className="w-16 h-px bg-foreground print:bg-black" />
      </div>
    );

    return (
      <div className="text-center mb-3 space-y-1">
        {flourish}
        {/* 裝飾性標題本來就用比其他標題更寬的字距 */}
        <h2
          className={cn(
            TITLE_SCALE.section,
            TITLE_BASE,
            "tracking-display font-bold",
          )}
        >
          {title}
        </h2>
        {flourish}
      </div>
    );
  }

  if (variant === "underlined") {
    return (
      <div className="mb-2">
        <div className={cn(TITLE_SCALE.box, TITLE_BASE, "uppercase font-bold")}>
          {title}
        </div>
        <div className="h-0.5 bg-foreground print:bg-black mt-0.5" />
      </div>
    );
  }

  // small - for subsection titles
  if (variant === "small") {
    return (
      <div
        className={cn(
          TITLE_SCALE.sub,
          TITLE_BASE,
          "uppercase font-semibold mb-1 text-muted-foreground",
        )}
      >
        {title}
      </div>
    );
  }

  // default
  return (
    <div className={cn(TITLE_SCALE.section, TITLE_BASE, "uppercase font-bold mb-2")}>
      {title}
    </div>
  );
}
