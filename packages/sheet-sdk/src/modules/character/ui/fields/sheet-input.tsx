"use client";

import * as React from "react";
import { cn } from "@skald/sheet-sdk/lib/utils";

// ============================================================================
// Types
// ============================================================================

export type InputVariant = "underline" | "box" | "minimal" | "plain";
export type LabelPosition = "left" | "top" | "inline" | "hidden";
export type InputSize = "xs" | "sm" | "md" | "lg";
export type TextAlign = "left" | "center" | "right";

export interface SheetInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size"
> {
  /** 標籤文字 */
  label?: string;
  /** 輸入框樣式變體 */
  variant?: InputVariant;
  /** 標籤位置 */
  labelPosition?: LabelPosition;
  /** 輸入框尺寸 */
  inputSize?: InputSize;
  /** 文字對齊 */
  textAlign?: TextAlign;
  /** 是否唯讀（顯示用） */
  displayOnly?: boolean;
  /** 後綴文字（如單位） */
  suffix?: string;
  /** 前綴文字 */
  prefix?: string;
}

export interface SheetTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** 標籤文字 */
  label?: string;
  /** 輸入框樣式變體 */
  variant?: InputVariant;
  /** 標籤位置 */
  labelPosition?: LabelPosition;
  /**
   * 隨內容長高：`rows` 當最小行數，換行與自動折行都會撐高文字框，不出現內捲軸。
   */
  autoGrow?: boolean;
}

// ============================================================================
// Style Maps
// ============================================================================

const sizeStyles: Record<InputSize, string> = {
  xs: "text-xs h-6 min-w-[2.25rem] print:text-2xs print:h-5 print:min-w-[2rem]",
  sm: "text-sm h-7 min-w-[2.75rem] print:text-xs print:h-6 print:min-w-[2.5rem]",
  md: "text-base h-9 min-w-[4.5rem] print:text-sm print:h-8 print:min-w-[4rem]",
  lg: "text-lg h-11 min-w-[6.5rem] print:text-base print:h-10 print:min-w-[6rem]",
};

const labelSizeStyles: Record<InputSize, string> = {
  xs: "text-xs print:text-3xs",
  sm: "text-xs print:text-2xs",
  md: "text-sm print:text-xs",
  lg: "text-base print:text-sm",
};

const variantStyles: Record<InputVariant, string> = {
  underline:
    "border border-muted-foreground/65 bg-muted/35 rounded-md px-2 hover:border-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 print:rounded-none print:border-0 print:border-b print:border-current print:bg-transparent print:px-1 print:ring-0",
  box: "border border-current bg-transparent rounded-sm",
  minimal: "border-none bg-transparent",
  plain: "border-none bg-transparent",
};

const alignStyles: Record<TextAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

// ============================================================================
// SheetInput Component
// ============================================================================

export const SheetInput = React.forwardRef<HTMLInputElement, SheetInputProps>(
  (
    {
      className,
      label,
      variant = "underline",
      labelPosition = "left",
      inputSize = "md",
      textAlign = "left",
      displayOnly = false,
      suffix,
      prefix,
      type = "text",
      ...props
    },
    ref,
  ) => {
    const {
      id: idProp,
      value,
      onChange,
      onBlur,
      onCompositionStart,
      onCompositionEnd,
      ...restProps
    } = props;
    // The visible label names the input: without this link assistive tech reads an
    // unnamed textbox.
    const generatedId = React.useId();
    const inputId = idProp ?? generatedId;
    const isTextLikeInput =
      type === "text" ||
      type === "search" ||
      type === "email" ||
      type === "url" ||
      type === "tel" ||
      type === "password";
    const [isComposing, setIsComposing] = React.useState(false);
    const [draftValue, setDraftValue] = React.useState(() =>
      value === undefined || value === null ? "" : String(value),
    );

    React.useEffect(() => {
      if (!isTextLikeInput || isComposing) return;
      setDraftValue(value === undefined || value === null ? "" : String(value));
    }, [value, isTextLikeInput, isComposing]);

    const commitBufferedInput = React.useCallback(
      (nextValue: string, element: HTMLInputElement) => {
        if (!onChange) return;
        const syntheticEvent = {
          target: element,
          currentTarget: element,
        } as React.ChangeEvent<HTMLInputElement>;
        // Ensure parent can read latest value from event target.
        element.value = nextValue;
        onChange(syntheticEvent);
      },
      [onChange],
    );

    const inputElement = (
      <div className="relative flex items-center">
        {prefix && (
          <span
            className={cn(
              "text-muted-foreground mr-1",
              labelSizeStyles[inputSize],
            )}
          >
            {prefix}
          </span>
        )}
        <input
          id={inputId}
          aria-label={labelPosition === "hidden" ? label : undefined}
          type={type}
          ref={ref}
          autoComplete="off"
          readOnly={displayOnly}
          value={isTextLikeInput ? draftValue : value}
          onChange={(e) => {
            if (!isTextLikeInput) {
              onChange?.(e);
              return;
            }

            const nextValue = e.target.value;
            setDraftValue(nextValue);
            if (!isComposing) {
              onChange?.(e);
            }
          }}
          onCompositionStart={(e) => {
            if (isTextLikeInput) setIsComposing(true);
            onCompositionStart?.(e);
          }}
          onCompositionEnd={(e) => {
            if (isTextLikeInput) {
              setIsComposing(false);
              const nextValue = e.currentTarget.value;
              setDraftValue(nextValue);
              commitBufferedInput(nextValue, e.currentTarget);
            }
            onCompositionEnd?.(e);
          }}
          onBlur={(e) => {
            if (isTextLikeInput) {
              const nextValue = e.currentTarget.value;
              setDraftValue(nextValue);
              if (nextValue !== (value === undefined || value === null ? "" : String(value))) {
                commitBufferedInput(nextValue, e.currentTarget);
              }
            }
            onBlur?.(e);
          }}
          className={cn(
            "w-full px-1 py-0.5 outline-none transition-colors",
            "focus:border-primary",
            "placeholder:text-muted-foreground/60",
            // 移除 number input 的 spinner
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
            sizeStyles[inputSize],
            variantStyles[variant],
            alignStyles[textAlign],
            displayOnly && "pointer-events-none bg-muted/50",
            className,
          )}
          {...restProps}
        />
        {suffix && (
          <span
            className={cn(
              "text-muted-foreground ml-1",
              labelSizeStyles[inputSize],
            )}
          >
            {suffix}
          </span>
        )}
      </div>
    );

    // Hidden label
    if (labelPosition === "hidden" || !label) {
      return inputElement;
    }

    // Top label
    if (labelPosition === "top") {
      return (
        <div className="flex flex-col gap-0.5">
          <label
            htmlFor={inputId}
            className={cn(
              "font-medium text-muted-foreground whitespace-nowrap",
              labelSizeStyles[inputSize],
            )}
          >
            {label}
          </label>
          {inputElement}
        </div>
      );
    }

    // Inline label (label 和 input 在同一行，label 不縮小)
    if (labelPosition === "inline") {
      return (
        <div className="flex items-center gap-1">
          <label
            htmlFor={inputId}
            className={cn(
              "font-medium text-muted-foreground whitespace-nowrap",
              labelSizeStyles[inputSize],
            )}
          >
            {label}
          </label>
          {inputElement}
        </div>
      );
    }

    // Left label (預設，label 固定寬度)
    return (
      <div className="flex items-baseline gap-2">
        <label
          htmlFor={inputId}
          className={cn(
            "font-medium text-muted-foreground whitespace-nowrap shrink-0",
            labelSizeStyles[inputSize],
          )}
        >
          {label}
        </label>
        <div className="flex-1">{inputElement}</div>
      </div>
    );
  },
);

SheetInput.displayName = "SheetInput";

// ============================================================================
// SheetTextarea Component
// ============================================================================

export const SheetTextarea = React.forwardRef<
  HTMLTextAreaElement,
  SheetTextareaProps
>(
  (
    {
      className,
      label,
      variant = "underline",
      labelPosition = "top",
      autoGrow = false,
      ...props
    },
    ref,
  ) => {
    const {
      id: idProp,
      value,
      onChange,
      onBlur,
      onCompositionStart,
      onCompositionEnd,
      rows: rowsProp,
      ...restProps
    } = props;
    const generatedId = React.useId();
    const textareaId = idProp ?? generatedId;
    const [isComposing, setIsComposing] = React.useState(false);
    const [draftValue, setDraftValue] = React.useState(() =>
      value === undefined || value === null ? "" : String(value),
    );

    React.useEffect(() => {
      if (isComposing) return;
      setDraftValue(value === undefined || value === null ? "" : String(value));
    }, [value, isComposing]);

    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);
    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );
    // Hard line breaks set the row count (also before layout, e.g. on the server);
    // the measured height then covers lines that wrap.
    const rows = autoGrow
      ? Math.max(rowsProp ?? 1, draftValue.split("\n").length)
      : rowsProp;

    React.useLayoutEffect(() => {
      const element = innerRef.current;
      if (!autoGrow || !element) return;
      const resize = () => {
        element.style.height = "auto";
        const style = window.getComputedStyle(element);
        const borders =
          (Number.parseFloat(style.borderTopWidth) || 0) +
          (Number.parseFloat(style.borderBottomWidth) || 0);
        if (element.scrollHeight > 0) {
          element.style.height = `${element.scrollHeight + borders}px`;
        }
      };
      resize();
      if (typeof ResizeObserver === "undefined") return;
      // The width changes when the section or window resizes, and so does wrapping.
      let lastWidth = element.clientWidth;
      const observer = new ResizeObserver(() => {
        if (element.clientWidth === lastWidth) return;
        lastWidth = element.clientWidth;
        resize();
      });
      observer.observe(element);
      return () => observer.disconnect();
    }, [autoGrow, draftValue]);

    const commitBufferedTextarea = React.useCallback(
      (nextValue: string, element: HTMLTextAreaElement) => {
        if (!onChange) return;
        const syntheticEvent = {
          target: element,
          currentTarget: element,
        } as React.ChangeEvent<HTMLTextAreaElement>;
        element.value = nextValue;
        onChange(syntheticEvent);
      },
      [onChange],
    );

    const textareaElement = (
      <textarea
        id={textareaId}
        aria-label={labelPosition === "hidden" ? label : undefined}
        ref={setRefs}
        rows={rows}
        value={draftValue}
        onChange={(e) => {
          const nextValue = e.target.value;
          setDraftValue(nextValue);
          if (!isComposing) {
            onChange?.(e);
          }
        }}
        onCompositionStart={(e) => {
          setIsComposing(true);
          onCompositionStart?.(e);
        }}
        onCompositionEnd={(e) => {
          setIsComposing(false);
          const nextValue = e.currentTarget.value;
          setDraftValue(nextValue);
          commitBufferedTextarea(nextValue, e.currentTarget);
          onCompositionEnd?.(e);
        }}
        onBlur={(e) => {
          const nextValue = e.currentTarget.value;
          setDraftValue(nextValue);
          if (nextValue !== (value === undefined || value === null ? "" : String(value))) {
            commitBufferedTextarea(nextValue, e.currentTarget);
          }
          onBlur?.(e);
        }}
        className={cn(
          "w-full px-2 py-1 text-sm outline-none transition-colors resize-none",
          autoGrow && "overflow-hidden",
          "focus:border-primary",
          "placeholder:text-muted-foreground/60",
          variantStyles[variant],
          className,
        )}
        {...restProps}
      />
    );

    if (labelPosition === "hidden" || !label) {
      return textareaElement;
    }

    return (
      <div className="flex flex-col gap-1">
        <label
          htmlFor={textareaId}
          className="text-xs font-medium text-muted-foreground"
        >
          {label}
        </label>
        {textareaElement}
      </div>
    );
  },
);

SheetTextarea.displayName = "SheetTextarea";

// ============================================================================
// SheetCheckbox Component (用於技能成長標記等)
// ============================================================================

export interface SheetCheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  checkboxSize?: InputSize;
}

export const SheetCheckbox = React.forwardRef<
  HTMLInputElement,
  SheetCheckboxProps
>(({ className, label, checkboxSize = "sm", ...props }, ref) => {
  const sizeMap: Record<InputSize, string> = {
    xs: "w-2.5 h-2.5",
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  return (
    <label className="flex items-center gap-1 cursor-pointer">
      <input
        type="checkbox"
        ref={ref}
        className={cn(
          "rounded-sm border-muted-foreground cursor-pointer",
          sizeMap[checkboxSize],
          className,
        )}
        {...props}
      />
      {label && (
        <span className={cn("text-foreground", labelSizeStyles[checkboxSize])}>
          {label}
        </span>
      )}
    </label>
  );
});

SheetCheckbox.displayName = "SheetCheckbox";
