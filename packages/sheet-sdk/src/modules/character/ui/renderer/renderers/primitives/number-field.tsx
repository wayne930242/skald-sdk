// modules/character/ui/renderer/renderers/primitives/number-field.tsx
"use client";

import { useState, useCallback, useEffect } from "react";
import { Calculator } from "lucide-react";
import type { NumberField } from "@skald/types/schema";
import { isLegacyFieldAction } from "@skald/types/action-schema";
import {
  useSchema,
  useFieldValue,
  useFieldSetter,
  useFieldBlur,
  useRunFieldHandler,
} from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import {
  SheetInput,
  type LabelPosition as SheetLabelPosition,
} from "@skald/sheet-sdk/modules/character/ui/fields";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@skald/sheet-sdk/components/ui/tooltip";
import { FieldIcon } from "../../primitives/field-icon";
import { useFieldDisplay } from "../../field-display";
import { useSheetMode } from "../../sheet-mode";
import { StatTile, TileNumberInput } from "../../stat-tile";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";

import { useSystemOptional } from "@skald/sheet-sdk/components/providers";
import { useTemplateEditorSystemSlug } from "@skald/sheet-sdk/components/providers/template-editor-system-context";
import { useSystemPluginUi } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";

function getValueByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateCondition(
  condition: string | undefined,
  data: Record<string, unknown>,
): boolean {
  if (!condition) return true;

  let expr = condition.trim();
  if (expr.startsWith("{{")) expr = expr.slice(2);
  if (expr.endsWith("}}")) expr = expr.slice(0, -2);
  expr = expr.trim();

  if (!expr) return true;

  // Handle AND
  if (expr.includes("&&")) {
    const parts = expr.split("&&");
    return parts.every((part) => evaluateSingle(part.trim(), data));
  }

  // Handle OR
  if (expr.includes("||")) {
    const parts = expr.split("||");
    return parts.some((part) => evaluateSingle(part.trim(), data));
  }

  return evaluateSingle(expr, data);
}

function evaluateSingle(expr: string, data: Record<string, unknown>): boolean {
  // Handle >=
  const gteMatch = expr.match(/^([\w.]+)\s*>=\s*(\d+)$/);
  if (gteMatch) {
    const path = gteMatch[1];
    const threshold = parseInt(gteMatch[2], 10);
    const actual = getValueByPath(data, path);
    return typeof actual === "number" && actual >= threshold;
  }

  // Handle <=
  const lteMatch = expr.match(/^([\w.]+)\s*<=\s*(\d+)$/);
  if (lteMatch) {
    const path = lteMatch[1];
    const threshold = parseInt(lteMatch[2], 10);
    const actual = getValueByPath(data, path);
    return typeof actual === "number" && actual <= threshold;
  }

  // Default: check truthy
  const value = getValueByPath(data, expr);
  return Boolean(value);
}

export function NumberFieldRenderer({
  field,
}: FieldRendererProps<NumberField>) {
  const value = useFieldValue<number>(field.id);
  const setValue = useFieldSetter();
  const onBlur = useFieldBlur();
  const { editable, setupMode, data, setData, handlers } = useSchema();
  const runHandler = useRunFieldHandler();
  const display = useFieldDisplay();
  const mode = useSheetMode();
  const editorSystemSlug = useTemplateEditorSystemSlug();
  const systemId = useSystemOptional()?.systemId ?? editorSystemSlug;
  const [isHovered, setIsHovered] = useState(false);
  const [alwaysShowAction, setAlwaysShowAction] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(hover: none), (pointer: coarse)");
    const update = () => setAlwaysShowAction(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const labelPosition = (field.labelPosition || "left") as SheetLabelPosition;
  const displayVariant = field.displayVariant || "underline";

  // Show placeholder text when value is null and nullPlaceholder is set
  const showPlaceholder = value === null && !!field.nullPlaceholder;

  // Check if action should be visible (actions are setup-specific)
  const actionVisible =
    field.action &&
    setupMode &&
    evaluateCondition(field.action.visibleWhen, data);

  const handleActionClick = useCallback(() => {
    if (!field.action || !handlers || !setData) return;
    // Only legacy field actions have a handler property
    if (isLegacyFieldAction(field.action)) {
      const handler = handlers[field.action.handler];
      if (handler) {
        runHandler(handler, data, setData);
      }
    }
    // TODO: Handle declarative field actions in Task 2

    // Trigger save after action completes
    onBlur?.();
  }, [field.action, handlers, data, setData, onBlur, runHandler]);

  const { legacySheet } = useSystemPluginUi();
  const tooltip = field.action?.tooltip
    ? legacySheet?.resolveActionTooltip(field.action.tooltip ?? "", systemId) ?? field.action.tooltip ?? ""
    : "";

  // Check if field has an action defined (regardless of visibility)
  const hasAction = !!field.action;

  // views.web 的 display: "tile"：點一下擲骰，編輯模式才出現輸入框。
  // 磚面沒有欄位動作（hover 的設定鈕）的位置，需要動作的欄位不要用 tile。
  if (display === "tile") {
    const label = field.label || "";
    return (
      <StatTile
        fieldId={field.id}
        label={label}
        valueText={showPlaceholder ? (field.nullPlaceholder ?? "") : String(value ?? "")}
        input={
          editable && mode === "edit" && !showPlaceholder ? (
            <TileNumberInput
              label={label}
              value={value}
              min={typeof field.min === "number" ? field.min : undefined}
              max={typeof field.max === "number" ? field.max : undefined}
              onChange={(num) => setValue(field.id, num)}
              onBlur={onBlur}
            />
          ) : undefined
        }
      />
    );
  }

  // Without action definition, render simple input
  if (!hasAction) {
    return (
      <SheetInput
        type={showPlaceholder ? "text" : "number"}
        label={field.label}
        labelPosition={labelPosition}
        variant={displayVariant}
        inputSize="md"
        textAlign={field.textAlign ?? "center"}
        value={showPlaceholder ? field.nullPlaceholder : (value ?? "")}
        onChange={(e) => {
          const num = parseInt(e.target.value, 10);
          setValue(field.id, isNaN(num) ? 0 : num);
        }}
        onBlur={onBlur}
        readOnly={!editable || showPlaceholder}
        min={field.min}
        max={field.max}
      />
    );
  }

  // With action definition, always wrap in hover container (button visibility controlled separately)
  return (
    <div
      className="relative w-full group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <SheetInput
        type={showPlaceholder ? "text" : "number"}
        label={field.label}
        labelPosition={labelPosition}
        variant={displayVariant}
        inputSize="md"
        textAlign={field.textAlign ?? "center"}
        value={showPlaceholder ? field.nullPlaceholder : (value ?? "")}
        onChange={(e) => {
          const num = parseInt(e.target.value, 10);
          setValue(field.id, isNaN(num) ? 0 : num);
        }}
        onBlur={onBlur}
        readOnly={!editable || showPlaceholder}
        min={field.min}
        max={field.max}
      />
      {actionVisible && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`absolute right-0 top-1/2 -translate-y-1/2 h-6 w-6 print:hidden transition-opacity ${
                  alwaysShowAction || isHovered
                    ? "opacity-70 hover:opacity-100"
                    : "opacity-0 pointer-events-none"
                }`}
                onClick={handleActionClick}
              >
                {/* schema 的 action.icon 原本沒有任何消費端，一律畫 Calculator */}
                <FieldIcon
                  name={field.action?.icon}
                  fallback={Calculator}
                  className="h-4 w-4"
                />
              </Button>
            </TooltipTrigger>
            {tooltip && <TooltipContent>{tooltip}</TooltipContent>}
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

// Self-register
registerFieldRenderer("number", NumberFieldRenderer);
