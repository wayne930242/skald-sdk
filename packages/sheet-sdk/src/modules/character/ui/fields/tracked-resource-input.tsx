"use client";

import * as React from "react";
import { cn } from "@skald/sheet-sdk/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@skald/sheet-sdk/components/ui/popover";

// ============================================================================
// Types
// ============================================================================

export interface StatusMarker {
  id: string;
  label: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

export interface TrackedResourceInputProps {
  /** 資源標籤 (如 HP, SAN, MP) */
  label: string;
  /** 當前值 */
  current: number;
  /** 最大值 */
  max: number;
  /** 當前值變更回調 */
  onCurrentChange?: (value: number) => void;
  /** 最大值變更回調 */
  onMaxChange?: (value: number) => void;
  /** 是否顯示追蹤格子 */
  showTrackBoxes?: boolean;
  /** 追蹤格子尺寸 */
  trackBoxSize?: "xs" | "sm" | "md";
  /** 狀態標記 (如 Major Wound, Unconscious) */
  statusMarkers?: StatusMarker[];
  /** 是否可編輯 */
  editable?: boolean;
  /** 自訂 className */
  className?: string;
  /** 變體 */
  variant?: "vertical" | "horizontal" | "compact";
  /** 是否可編輯最大值 */
  maxEditable?: boolean;
  /**
   * 顯示模式。web 模式的狀態標記放大成可點擊的尺寸（觸控裝置 44px）；
   * print（預設）維持列印版面的緊湊尺寸，不受觸控放大影響。
   */
  viewMode?: "print" | "web";
}

// ============================================================================
// TrackedResourceInput Component
// ============================================================================

export function TrackedResourceInput({
  label,
  current,
  max,
  onCurrentChange,
  onMaxChange,
  showTrackBoxes = false,
  trackBoxSize: _trackBoxSize = "sm",
  statusMarkers,
  editable = true,
  className,
  variant = "vertical",
  maxEditable = false,
  viewMode = "print",
}: TrackedResourceInputProps) {
  const isWebView = viewMode === "web";
  // Hooks 必須在任何條件判斷之前呼叫
  const [showPopup, setShowPopup] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleCurrentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && onCurrentChange) {
      onCurrentChange(Math.min(Math.max(0, value), max));
    }
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && onMaxChange) {
      onMaxChange(Math.max(1, value));
    }
  };

  const _handleBoxClick = (index: number) => {
    if (!editable || !onCurrentChange) return;
    // 點擊格子切換狀態
    if (index < current) {
      onCurrentChange(index);
    } else {
      onCurrentChange(index + 1);
    }
  };

  // Compact variant (只顯示數值)
  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <input
          type="number"
          autoComplete="off"
          value={current}
          onChange={handleCurrentChange}
          readOnly={!editable}
          className={cn(
            "w-8 text-center text-sm font-bold border-b border-foreground print:border-black bg-transparent outline-none print:text-transparent",
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
            !editable && "pointer-events-none",
          )}
        />
        <span className="text-muted-foreground">/</span>
        <span className="text-sm text-muted-foreground">{max}</span>
      </div>
    );
  }

  // Horizontal variant
  if (variant === "horizontal") {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <span className="text-sm font-bold text-foreground min-w-[3rem]">
          {label}
        </span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            autoComplete="off"
            value={current}
            onChange={handleCurrentChange}
            readOnly={!editable}
            className={cn(
              "w-12 text-center text-xl font-bold border-b-2 border-foreground print:border-black bg-transparent outline-none print:text-transparent",
              "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
              !editable && "pointer-events-none",
            )}
          />
          <span className="text-muted-foreground text-lg">/</span>
          {maxEditable ? (
            <input
              type="number"
              autoComplete="off"
              value={max}
              onChange={handleMaxChange}
              readOnly={!editable}
              className={cn(
                "w-10 text-center text-base text-muted-foreground border-b border-border bg-transparent outline-none",
                "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                !editable && "pointer-events-none",
              )}
            />
          ) : (
            <span className="text-base text-muted-foreground">{max}</span>
          )}
        </div>
        {statusMarkers && statusMarkers.length > 0 && (
          <div className="flex gap-2">
            {statusMarkers.map((marker) => (
              <label
                key={marker.id}
                className="flex items-center gap-1 text-2xs cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={marker.checked || false}
                  onChange={(e) => marker.onChange?.(e.target.checked)}
                  disabled={!editable}
                  className="w-3 h-3"
                />
                {marker.label}
              </label>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Vertical variant (default) - 使用 Popover
  return (
    <div className={cn("border border-foreground print:border-black relative", className)}>
      {/* 標籤 */}
      <div className="text-3xs border-b border-foreground print:border-black px-1 py-0.5 font-bold bg-muted text-center tracking-wider">
        {label}
      </div>

      {/* 數值區域 - 包裝在 Popover 中 */}
      <Popover open={showTrackBoxes && showPopup} onOpenChange={setShowPopup}>
        <PopoverTrigger asChild>
          <div
            className="flex items-center justify-center py-0.5 gap-0.5 cursor-pointer"
            onClick={() => showTrackBoxes && setShowPopup(true)}
          >
            <input
              ref={inputRef}
              type="number"
              autoComplete="off"
              value={current}
              onChange={handleCurrentChange}
              readOnly={!editable}
              onClick={(e) => e.stopPropagation()}
              onFocus={() => showTrackBoxes && setShowPopup(true)}
              className={cn(
                "w-8 text-center text-base font-bold bg-transparent outline-none print:text-transparent",
                "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                !editable && "pointer-events-none",
              )}
            />
            <span className="text-muted-foreground text-xs">/</span>
            {maxEditable ? (
              <input
                type="number"
                autoComplete="off"
                value={max}
                onChange={handleMaxChange}
                readOnly={!editable}
                onClick={(e) => e.stopPropagation()}
                onFocus={() => showTrackBoxes && setShowPopup(true)}
                className={cn(
                  "w-6 text-center text-xs text-muted-foreground border-b border-muted bg-transparent outline-none",
                  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                  !editable && "pointer-events-none",
                )}
              />
            ) : (
              <span
                className="text-xs text-muted-foreground cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.focus();
                }}
              >
                {max}
              </span>
            )}
          </div>
        </PopoverTrigger>

        <PopoverContent
          side="bottom"
          align="center"
          sideOffset={4}
          className="w-auto p-3 print:hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* 格子 (0 到 max) */}
          <div
            className="grid gap-[1px] bg-muted"
            style={{
              gridTemplateColumns: `repeat(10, 24px)`,
            }}
          >
            {[...Array(max + 1)].map((_, i) => {
              const isZero = i === 0;
              const isHighlighted = i > 0 && i <= current;
              return (
                <div
                  key={i}
                  onClick={() => {
                    if (editable && onCurrentChange) {
                      onCurrentChange(i);
                    }
                  }}
                  className={cn(
                    "w-6 h-6 flex items-center justify-center text-xs font-medium transition-colors",
                    isZero
                      ? "bg-red-500 text-white hover:bg-red-400"
                      : isHighlighted
                        ? "bg-muted-foreground text-background hover:bg-muted-foreground/80"
                        : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                    editable && "cursor-pointer",
                  )}
                >
                  {i}
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* 狀態標記 */}
      {statusMarkers && statusMarkers.length > 0 && (
        <div
          className={cn(
            "flex flex-wrap px-1 py-1 border-t border-foreground print:border-black",
            isWebView ? "gap-x-2 gap-y-0.5 text-2xs" : "gap-1.5 text-3xs",
          )}
        >
          {statusMarkers.map((marker) => (
            <label
              key={marker.id}
              className={cn(
                "flex items-center cursor-pointer",
                isWebView
                  ? "gap-1 min-h-6 touch:min-h-11"
                  : "gap-0.5",
              )}
            >
              <input
                type="checkbox"
                checked={marker.checked || false}
                onChange={(e) => marker.onChange?.(e.target.checked)}
                disabled={!editable}
                className={
                  isWebView
                    ? "w-4 h-4 touch:w-5 touch:h-5"
                    : "w-2.5 h-2.5"
                }
              />
              <span className="text-muted-foreground">{marker.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
