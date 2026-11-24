"use client";

import * as React from "react";
import { cn } from "@skald/sheet-sdk/lib/utils";

// ============================================================================
// Types
// ============================================================================

export interface SimpleStatInputProps {
  /** 標籤 */
  label: string;
  /** 數值 */
  value: number | string;
  /** 數值變更回調 */
  onChange?: (value: number | string) => void;
  /** 失焦回調（用於觸發儲存） */
  onBlur?: () => void;
  /** 是否可編輯 */
  editable?: boolean;
  /** 自訂 className */
  className?: string;
  /** 變體 */
  variant?: "inline" | "stacked" | "boxed";
  /** 尺寸 */
  size?: "sm" | "md" | "lg";
  /** 是否為數值 */
  isNumber?: boolean;
  /** 後綴 (如 "ft", "m") */
  suffix?: string;
}

// ============================================================================
// SimpleStatInput Component
// ============================================================================

export function SimpleStatInput({
  label,
  value,
  onChange,
  onBlur,
  editable = true,
  className,
  variant = "inline",
  size = "md",
  isNumber = true,
  suffix,
}: SimpleStatInputProps) {
  const [isComposing, setIsComposing] = React.useState(false);
  const [draftValue, setDraftValue] = React.useState(String(value ?? ""));

  React.useEffect(() => {
    if (isNumber || isComposing) return;
    setDraftValue(String(value ?? ""));
  }, [value, isNumber, isComposing]);

  const sizeStyles = {
    sm: {
      label: "text-xs print:text-2xs",
      value: "text-base print:text-sm",
      input: "w-11 h-6 print:w-10 print:h-5",
    },
    md: {
      label: "text-sm print:text-xs",
      value: "text-lg print:text-base",
      input: "w-14 h-7 print:w-12 print:h-6",
    },
    lg: {
      label: "text-base print:text-sm",
      value: "text-xl print:text-lg",
      input: "w-16 h-8 print:w-14 print:h-7",
    },
  };

  const styles = sizeStyles[size];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onChange) return;
    if (isNumber) {
      const num = parseInt(e.target.value, 10);
      onChange(isNaN(num) ? 0 : num);
    } else {
      const nextValue = e.target.value;
      setDraftValue(nextValue);
      if (!isComposing) {
        onChange(nextValue);
      }
    }
  };

  // Boxed variant (KPI tile：淡背景 + 淡邊框；列印時退回原本的方框)
  if (variant === "boxed") {
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-1 rounded-md border border-muted-foreground/65 bg-muted/35 px-2 py-1.5 text-center",
          "print:gap-0 print:rounded-none print:border-foreground print:bg-transparent print:px-0 print:py-0",
          className,
        )}
      >
        <div
          className={cn(
            "font-medium text-muted-foreground uppercase tracking-wide",
            "print:w-full print:border-b print:border-foreground print:bg-muted print:px-2 print:py-0.5 print:font-bold print:normal-case print:tracking-wider print:text-foreground",
            styles.label,
          )}
        >
          {label}
        </div>
        <div className="flex items-center justify-center gap-0.5 print:py-1">
          <input
            type={isNumber ? "number" : "text"}
            autoComplete="off"
            value={isNumber ? value : draftValue}
            onChange={handleChange}
            onCompositionStart={() => {
              if (!isNumber) setIsComposing(true);
            }}
            onCompositionEnd={(e) => {
              if (!isNumber) {
                setIsComposing(false);
                const nextValue = e.currentTarget.value;
                setDraftValue(nextValue);
                onChange?.(nextValue);
              }
            }}
            onBlur={(e) => {
              if (!isNumber) onChange?.(e.currentTarget.value);
              onBlur?.();
            }}
            readOnly={!editable}
            className={cn(
              "text-center font-bold bg-transparent outline-none",
              "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
              styles.value,
              styles.input,
              !editable && "pointer-events-none",
            )}
          />
          {suffix && (
            <span className={cn("text-muted-foreground", styles.label)}>{suffix}</span>
          )}
        </div>
      </div>
    );
  }

  // Stacked variant (標籤在上)
  if (variant === "stacked") {
    return (
      <div className={cn("flex flex-col items-center gap-0.5", className)}>
        <span className={cn("font-medium text-muted-foreground", styles.label)}>
          {label}
        </span>
        <div className="flex items-center gap-0.5">
          <input
            type={isNumber ? "number" : "text"}
            autoComplete="off"
            value={isNumber ? value : draftValue}
            onChange={handleChange}
            onCompositionStart={() => {
              if (!isNumber) setIsComposing(true);
            }}
            onCompositionEnd={(e) => {
              if (!isNumber) {
                setIsComposing(false);
                const nextValue = e.currentTarget.value;
                setDraftValue(nextValue);
                onChange?.(nextValue);
              }
            }}
            onBlur={(e) => {
              if (!isNumber) onChange?.(e.currentTarget.value);
              onBlur?.();
            }}
            readOnly={!editable}
            className={cn(
              "text-center font-bold border-b border-foreground print:border-black bg-transparent outline-none",
              "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
              styles.value,
              styles.input,
              !editable && "pointer-events-none",
            )}
          />
          {suffix && (
            <span className={cn("text-muted-foreground", styles.label)}>{suffix}</span>
          )}
        </div>
      </div>
    );
  }

  // Inline variant (default)
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        className={cn(
          "font-medium text-muted-foreground whitespace-nowrap",
          styles.label,
        )}
      >
        {label}
      </span>
      <div className="flex items-center gap-0.5">
        <input
          type={isNumber ? "number" : "text"}
          autoComplete="off"
          value={isNumber ? value : draftValue}
          onChange={handleChange}
          onCompositionStart={() => {
            if (!isNumber) setIsComposing(true);
          }}
          onCompositionEnd={(e) => {
            if (!isNumber) {
              setIsComposing(false);
              const nextValue = e.currentTarget.value;
              setDraftValue(nextValue);
              onChange?.(nextValue);
            }
          }}
          onBlur={(e) => {
            if (!isNumber) onChange?.(e.currentTarget.value);
            onBlur?.();
          }}
          readOnly={!editable}
          className={cn(
            "text-center font-bold border-b border-foreground print:border-black bg-transparent outline-none",
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
            styles.value,
            styles.input,
            !editable && "pointer-events-none",
          )}
        />
        {suffix && (
          <span className={cn("text-muted-foreground", styles.label)}>{suffix}</span>
        )}
      </div>
    </div>
  );
}
