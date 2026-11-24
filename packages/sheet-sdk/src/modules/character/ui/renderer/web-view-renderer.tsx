// modules/character/ui/renderer/web-view-renderer.tsx
//
// `template.views.web` 的根。量自己的容器寬度換算斷點，再把整棵樹交給
// WebSectionRenderer／WebLayout。TemplateRenderer 只在 viewMode="web" 且範本
// 有 views.web 時才走到這裡；其餘一律是舊的 PageRenderer。
"use client";

import { useRef } from "react";
import type { WebView } from "@skald/types/schema";
import {
  SheetBreakpointProvider,
  resolveLayout,
  useContainerBreakpoint,
} from "./sheet-breakpoint";
import { useSheetMode } from "./sheet-mode";
import { WebLayout, WebNodeList } from "./web-section-renderer";
import "./web-view.css";

export function WebViewRenderer({
  view,
  genre,
}: {
  view: WebView;
  /** 類型主題名稱；沒有指定時不輸出 data-genre（中性） */
  genre?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const breakpoint = useContainerBreakpoint(rootRef);
  const mode = useSheetMode();

  // 量到寬度之前不渲染內容：否則會先排手機版面再跳成桌機版面
  const layout = breakpoint
    ? resolveLayout(view.layout, view.at, breakpoint)
    : null;

  return (
    <div
      ref={rootRef}
      className="skald-web-view"
      data-sheet-root=""
      data-sheet-mode={mode}
      data-bp={breakpoint ?? undefined}
      data-bp-pending={breakpoint ? undefined : ""}
      data-genre={genre}
      data-web-view-id={view.id}
    >
      {breakpoint && layout && (
        <SheetBreakpointProvider value={breakpoint}>
          <WebLayout layout={layout}>
            <WebNodeList nodes={view.children} parentLayout={layout} />
          </WebLayout>
        </SheetBreakpointProvider>
      )}
    </div>
  );
}
