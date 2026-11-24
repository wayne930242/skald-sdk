// modules/character/ui/renderer/primitives/track-cell.tsx
//
// 軌道格：角色卡上所有「可點擊的方格」共用的外觀。
//
// 收斂前，checkbox-track、fate-stress-track、balance-track 各自寫死一套尺寸、
// 圓角、選中色與 hover 行為（16/24/32px、rounded-sm/直角/rounded、
// bg-foreground/bg-primary），彼此毫無關聯。尺寸差異有理由——格子裡放不放字、
// 放幾個字——其餘差異沒有，全部統一在這裡。
"use client";

import * as React from "react";
import { cn } from "@skald/sheet-sdk/lib/utils";

/** 尺寸由格內容決定：空格、單字元、雙字元（如 +4） */
export type TrackCellSize = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<TrackCellSize, string> = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

interface TrackCellProps {
  size: TrackCellSize;
  /** 已填滿／已選中 */
  active?: boolean;
  /** 虛線外框：標示參考點或尚未解鎖的格子，與 active 無關 */
  dashed?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}

export function TrackCell({
  size,
  active = false,
  dashed = false,
  disabled = false,
  onClick,
  children,
  className,
  "aria-label": ariaLabel,
}: TrackCellProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={cn(
        "flex items-center justify-center rounded-sm border text-xs font-medium transition-colors print:border-black",
        SIZE_CLASSES[size],
        active
          ? "bg-foreground text-background border-foreground print:bg-black"
          : "bg-background border-muted-foreground/50",
        dashed && "border-dashed",
        disabled ? "cursor-default" : "cursor-pointer hover:border-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
