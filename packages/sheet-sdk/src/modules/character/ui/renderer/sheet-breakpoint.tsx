// modules/character/ui/renderer/sheet-breakpoint.tsx
//
// `views.web` 的容器斷點。看的是角色卡根節點自己的寬度，不是視窗寬度：
// 角色卡在遊戲桌裡只佔視窗約 70%，用 media query 會在 1440 的視窗下
// 給一個放不下的桌機版面。
"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type RefObject,
} from "react";
import type {
  Breakpoint,
  Layout,
  LayoutBase,
  LayoutOverrides,
  FieldLayoutOverrides,
  Responsive,
} from "@skald/types/schema";

/** base < 720px ≤ md < 1200px ≤ lg */
export const BREAKPOINT_MD_PX = 720;
export const BREAKPOINT_LG_PX = 1200;

/** 由小到大；往上覆寫時依這個順序疊加 */
const BREAKPOINT_ORDER: readonly Breakpoint[] = ["base", "md", "lg"];

export function breakpointForWidth(width: number): Breakpoint {
  if (width >= BREAKPOINT_LG_PX) return "lg";
  if (width >= BREAKPOINT_MD_PX) return "md";
  return "base";
}

/**
 * 物件形式的響應式值一定有 `base`（契約要求）。`StickyConfig` 這類
 * 本身也是物件的值沒有 `base`，所以用這個鍵區分，不會誤判。
 */
export function isResponsiveObject<T>(
  value: Responsive<T>,
): value is { base: T; md?: T; lg?: T } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "base" in value
  );
}

/**
 * 依斷點取值。物件形式缺少的斷點沿用較小斷點的值（行動優先、往上覆寫）；
 * 非物件的值所有斷點相同。
 */
export function resolveResponsive<T>(
  value: Responsive<T> | undefined,
  breakpoint: Breakpoint,
): T | undefined {
  if (value === undefined) return undefined;
  if (!isResponsiveObject(value)) return value;

  let resolved = value.base;
  const reached = BREAKPOINT_ORDER.indexOf(breakpoint);
  for (const bp of BREAKPOINT_ORDER.slice(1, reached + 1)) {
    const candidate = value[bp as "md" | "lg"];
    if (candidate !== undefined) resolved = candidate;
  }
  return resolved;
}

/** `visible` 預設為 true：省略時所有斷點都顯示 */
export function resolveVisible(
  visible: Responsive<boolean> | undefined,
  breakpoint: Breakpoint,
): boolean {
  return resolveResponsive(visible, breakpoint) ?? true;
}

/** 把 `at.md`／`at.lg` 依序疊在 base 上；沒有覆寫時回傳原物件。 */
function applyOverrides<T extends object>(
  base: T,
  at: { md?: Partial<T>; lg?: Partial<T> } | undefined,
  breakpoint: Breakpoint,
): T {
  if (!at || breakpoint === "base") return base;
  let resolved = base;
  if (at.md) resolved = { ...resolved, ...at.md };
  if (breakpoint === "lg" && at.lg) resolved = { ...resolved, ...at.lg };
  return resolved;
}

/** `layout` 是 base；`at.md`、`at.lg` 往上覆寫。 */
export function resolveLayout(
  layout: Layout,
  at: LayoutOverrides | undefined,
  breakpoint: Breakpoint,
): Layout {
  return applyOverrides<Layout>(
    layout,
    at as { md?: Partial<Layout>; lg?: Partial<Layout> } | undefined,
    breakpoint,
  );
}

/** 欄位引用的 `layout` 是 base；`at.md`、`at.lg` 往上覆寫。 */
export function resolveFieldLayout(
  layout: Partial<LayoutBase> | undefined,
  at: FieldLayoutOverrides | undefined,
  breakpoint: Breakpoint,
): Partial<LayoutBase> | undefined {
  if (!at || breakpoint === "base") return layout;
  return applyOverrides<Partial<LayoutBase>>(layout ?? {}, at, breakpoint);
}

/**
 * 量 ref 元素的內容寬度並換算成斷點；量到第一個正寬度之前回傳 null，
 * 呼叫端據此不渲染內容，避免「先手機版再跳桌機版」。
 *
 * 寬度為 0（元素尚未排版或被 display:none）不算量到。
 */
export function useContainerBreakpoint(
  ref: RefObject<HTMLElement | null>,
): Breakpoint | null {
  const [breakpoint, setBreakpoint] = useState<Breakpoint | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const apply = (width: number) => {
      if (!(width > 0)) return;
      const next = breakpointForWidth(width);
      setBreakpoint((previous) => (previous === next ? previous : next));
    };

    apply(element.getBoundingClientRect().width);

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) apply(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return breakpoint;
}

const SheetBreakpointContext = createContext<Breakpoint | null>(null);

export const SheetBreakpointProvider = SheetBreakpointContext.Provider;

/**
 * 目前角色卡容器的斷點；不在 `views.web` 之下（舊版面）時為 null。
 * 舊路徑的元件靠這個 null 保持原本的行為。
 */
export function useSheetBreakpoint(): Breakpoint | null {
  return useContext(SheetBreakpointContext);
}
