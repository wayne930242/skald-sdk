"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Page, Field, FieldReference } from "@skald/types/schema";
import { LayoutRenderer } from "./layout-renderer";
import { SectionRenderer } from "./section-renderer";
import { FieldRenderer } from "./field-renderer";
import { useSchemaData, useSchemaStatic } from "./schema-context";
import { usesGameIcons as schemaUsesGameIcons } from "@skald/sheet-sdk/lib/game-icons/usage";
import { evaluateCondition } from "@skald/sheet-sdk/lib/condition-utils";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { ViewMode } from "./schema-context";
import { FormInteractionModeProvider } from "@skald/sheet-sdk/modules/rolls/ui/context/interaction-mode";

interface PageRendererProps {
  page: Page;
  pageIndex: number;
  totalPages: number;
  viewMode?: ViewMode;
}

/**
 * print 模式在螢幕上的固定頁寬（px），與下方 sizeStyles 的 print 值對應。
 * 216mm × 96dpi ÷ 25.4、8.74in × 96dpi。custom 沒有固定寬度，不需縮放。
 */
const PRINT_PAGE_WIDTH_PX: Record<string, number> = {
  A4: (216 * 96) / 25.4,
  letter: 8.74 * 96,
};

export function PageRenderer({
  page,
  pageIndex,
  viewMode = "print",
}: PageRendererProps) {
  const data = useSchemaData();
  const { schema, wrapCanvasElement, renderCanvasDropZone, setupMode, printMode } = useSchemaStatic();
  const isCanvasMode = Boolean(wrapCanvasElement);
  // 同 section-renderer.tsx：grid 版面裡插拖放區節點會多佔格子，把欄數擠亂。
  const dropZonesEnabled = Boolean(renderCanvasDropZone) && page.layout.type !== "grid";

  // schema 不會在渲染間變動，走訪一次即可
  const usesGameIcons = useMemo(() => schemaUsesGameIcons(schema), [schema]);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  // 量外層可用寬度以決定 print 預覽的縮放比。
  // 觀察的是 w-full 的外層而非頁面本身：頁面是 block、寬度取自 containing block，
  // 內容溢出不會把外層撐大，所以這個數字不會被自己的縮放影響，不會來回震盪。
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      setAvailableWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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

  // 頁面尺寸樣式
  // print 模式：螢幕上固定寬高預覽，實際列印時 auto
  // web 模式：響應式，最大寬度限制
  const sizeStyles: Record<string, Record<ViewMode, string>> = {
    A4: {
      print:
        "w-[216mm] min-w-[216mm] print:h-auto print:min-h-0",
      web: "w-full max-w-[80rem]",
    },
    letter: {
      print:
        "w-[8.74in] min-w-[8.74in] h-[11.24in] min-h-[11.24in] print:h-auto print:min-h-0",
      web: "w-full max-w-[82rem]",
    },
    custom: {
      print: "",
      web: "w-full max-w-[88rem]",
    },
  };

  const marginStyles: Record<string, string> = {
    none: "p-0",
    xs: "p-1",
    sm: "p-2",
    md: "p-4",
    lg: "p-6",
    xl: "p-8",
  };

  const pageSize = page.size || "A4";
  const effectivePageMargin =
    viewMode === "web" && isMobileViewport ? "sm" : page.margin;

  // print 是 A4 預覽，版面本身不該隨視窗改變——改成響應式就不叫預覽了。
  // 螢幕比頁面窄時等比縮小整頁，而不是留給使用者橫向捲動。
  // 用 zoom 而非 transform: scale()：zoom 會一併縮小 layout box，
  // 外層不會殘留一塊空白，父層量到的寬度也才是縮放後的實際寬度。
  // 真正列印時由 styles/sheet-sdk.css 的 @media print 還原成 1。
  const printPageWidth =
    viewMode === "print" ? PRINT_PAGE_WIDTH_PX[pageSize] : undefined;
  const printZoom =
    printPageWidth && availableWidth > 0
      ? Math.min(1, availableWidth / printPageWidth)
      : 1;

  return (
    // B-023: the form's edit mode (setup mode) reaches its rollables; its fields keep the sheet mode
    <FormInteractionModeProvider mode={setupMode && !printMode ? "edit" : "play"}>
    <div
      ref={wrapperRef}
      className="skald-page-frame w-full"
      data-print-size={printPageWidth ? pageSize : undefined}
    >
    <div
      className={cn(
        "skald-page bg-background border border-border print:bg-white print:border-0 mx-auto relative",
        sizeStyles[pageSize]?.[viewMode] || sizeStyles[pageSize]?.print,
        marginStyles[effectivePageMargin as string] || "p-4",
        pageIndex > 0 && "print:break-before-page mt-6 print:mt-0",
        viewMode === "web" &&
          "rounded-lg shadow-sm ring-1 ring-border/60 print:rounded-none print:shadow-none print:ring-0",
        page.customClass,
      )}
      // 有固定頁寬的 print 版面，列印時以預覽寬度等比縮到紙面（見 styles/sheet-sdk.css）。
      data-print-size={printPageWidth ? pageSize : undefined}
      style={printZoom < 1 ? { zoom: printZoom } : undefined}
    >
      <LayoutRenderer layout={page.layout}>
        {page.children.flatMap((child, index) => {
          const dropZone =
            dropZonesEnabled && renderCanvasDropZone
              ? renderCanvasDropZone(page.id, index, page.children.length === 0)
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
              rendered = <FieldRenderer key={child.fieldId} fieldRef={child} />;
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
                <Fragment key={`dropzone-${page.id}-${index}`}>
                  {dropZone}
                </Fragment>,
                rendered,
              ]
            : [rendered];
        })}
        {dropZonesEnabled && renderCanvasDropZone && (
          <Fragment key={`dropzone-${page.id}-${page.children.length}`}>
            {renderCanvasDropZone(page.id, page.children.length, page.children.length === 0)}
          </Fragment>
        )}
      </LayoutRenderer>

      {/* 列印浮水印 */}
      {/* the print preview's kit footer (skald.tw) replaces it there: print-kit.css hides it inside the kit */}
      <div data-print-watermark="" className="hidden print:block fixed bottom-1 right-3 text-3xs text-muted-foreground pointer-events-none">
        created by Skald (https://www.skald.tw)
        {/*
          CC BY 3.0 要求使用 game-icons 時標示來源，但沒用到就不必——
          印在每張角色卡上只是噪音。因此依這份 schema 是否真的引用而定。
        */}
        {usesGameIcons && " · game icons by game-icons.net (CC BY 3.0)"}
      </div>
    </div>
    </div>
    </FormInteractionModeProvider>
  );
}
