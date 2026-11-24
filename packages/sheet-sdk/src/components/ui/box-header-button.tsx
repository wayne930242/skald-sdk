"use client";

import { cn } from "@skald/sheet-sdk/lib/utils";

interface BoxHeaderButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * 浮動於 box 右上角的按鈕
 * hover 時顯示，用於觸發動作（如計算、挑選等）
 *
 * 使用方式：
 * 外層容器需要加上 `relative group` class：
 * `<div className="relative group">`
 */
export function BoxHeaderButton({
  onClick,
  children,
  className,
}: BoxHeaderButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "absolute -top-8 right-0",
        "text-3xs px-1.5 py-0.5",
        "bg-muted/80 border border-border rounded",
        "opacity-0 group-hover:opacity-100",
        "hover:bg-muted transition-opacity",
        "print:hidden z-10",
        className,
      )}
    >
      {children}
    </button>
  );
}
