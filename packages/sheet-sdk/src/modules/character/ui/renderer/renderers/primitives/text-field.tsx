// modules/character/ui/renderer/renderers/primitives/text-field.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TextField } from "@skald/types/schema";
import { isLegacyFieldAction } from "@skald/types/action-schema";
import { Calculator } from "lucide-react";
import {
  useSchema,
  useFieldValue,
  useFieldSetter,
  useFieldBlur,
  useRunFieldHandler,
} from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import {
  SheetInput,
  SheetTextarea,
  type LabelPosition as SheetLabelPosition,
} from "@skald/sheet-sdk/modules/character/ui/fields";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@skald/sheet-sdk/components/ui/tooltip";
import { Command, CommandItem, CommandList } from "@skald/sheet-sdk/components/ui/command";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@skald/sheet-sdk/components/ui/popover";
import { FieldIcon } from "../../primitives/field-icon";
import { registerFieldRenderer, type FieldRendererProps } from "../../registry";
import { cn } from "@skald/sheet-sdk/lib/utils";

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

  if (expr.includes("&&")) {
    return expr.split("&&").every((part) => evaluateCondition(part.trim(), data));
  }
  if (expr.includes("||")) {
    return expr.split("||").some((part) => evaluateCondition(part.trim(), data));
  }

  const gte = expr.match(/^([\w.]+)\s*>=\s*(\d+)$/);
  if (gte) {
    const actual = getValueByPath(data, gte[1]);
    return typeof actual === "number" && actual >= parseInt(gte[2], 10);
  }
  const lte = expr.match(/^([\w.]+)\s*<=\s*(\d+)$/);
  if (lte) {
    const actual = getValueByPath(data, lte[1]);
    return typeof actual === "number" && actual <= parseInt(lte[2], 10);
  }

  return Boolean(getValueByPath(data, expr));
}

export function TextFieldRenderer({ field }: FieldRendererProps<TextField>) {
  const value = useFieldValue<string>(field.id);
  const setValue = useFieldSetter();
  const onBlur = useFieldBlur();
  const { editable, data, onOpenPanel, setupMode, setData, handlers, presentation, growTextareas } =
    useSchema();
  const { resolveI18n } = useSchemaI18n();
  const runHandler = useRunFieldHandler();

  const labelPosition = (field.labelPosition || "left") as SheetLabelPosition;
  // On a form every input shows its box (a "plain" sheet textarea has none), and a
  // long text gets room for a sentence or two.
  const form = presentation === "form";
  const variant = form ? "underline" : field.variant || "underline";
  const rows = form ? Math.max(field.rows || 3, 2) : field.rows || 3;
  const isReadonly = field.readonly || !editable;
  const resolvedLabel = resolveI18n(field.label);
  const resolvedPlaceholder = resolveI18n(field.placeholder);
  const fieldAction = field.action;
  const suggestionAnchorRef = useRef<HTMLDivElement>(null);
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const [suggestionQuery, setSuggestionQuery] = useState("");
  const [suggestionPopoverWidth, setSuggestionPopoverWidth] = useState<number>();

  // Keep era display synced with current era locale, even for old saved data.
  const displayValue =
    field.id === "eraLabel" && typeof data.era === "string"
      ? resolveI18n(`{{i18n:era.${data.era}}}`)
      : value || "";
  const canOpenSettingsFromEra =
    isReadonly && editable && field.id === "eraLabel" && !!onOpenPanel;

  const suggestions = field.suggestions;
  const resolvedSuggestions = suggestions?.map((suggestion) =>
    resolveI18n(suggestion),
  );
  const hasSuggestions = !isReadonly && (resolvedSuggestions?.length ?? 0) > 0;
  const suggestionFilterQuery = isSuggestionOpen ? suggestionQuery : displayValue;

  const filteredSuggestions = useMemo(() => {
    const uniqueSuggestions = Array.from(
      new Set(
        (resolvedSuggestions ?? [])
          .map((suggestion) => suggestion.trim())
          .filter((suggestion) => suggestion.length > 0),
      ),
    );

    if (!hasSuggestions) return [];
    const query = suggestionFilterQuery.trim().toLowerCase();
    if (!query) return uniqueSuggestions;

    const matchedSuggestions = uniqueSuggestions.filter((suggestion) =>
      suggestion.toLowerCase().includes(query),
    );

    // Keep dropdown behavior closer to select/autocomplete:
    // when no match is found, still show all suggestions instead of empty list.
    return matchedSuggestions.length > 0 ? matchedSuggestions : uniqueSuggestions;
  }, [hasSuggestions, resolvedSuggestions, suggestionFilterQuery]);

  useEffect(() => {
    if (!hasSuggestions) return;
    const anchor = suggestionAnchorRef.current;
    if (!anchor) return;

    const updateWidth = () => {
      setSuggestionPopoverWidth(anchor.getBoundingClientRect().width);
    };

    updateWidth();
    if (typeof ResizeObserver === "undefined") return;

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(anchor);
    return () => {
      resizeObserver.disconnect();
    };
  }, [hasSuggestions]);

  if (field.multiline) {
    return (
      <SheetTextarea
        label={resolvedLabel}
        labelPosition={labelPosition}
        variant={variant}
        value={displayValue}
        onChange={(e) => setValue(field.id, e.target.value)}
        onBlur={onBlur}
        placeholder={resolvedPlaceholder}
        readOnly={isReadonly}
        rows={rows}
        autoGrow={growTextareas}
        className={cn(
          field.textAlign === "center" && "text-center",
          field.textAlign === "right" && "text-right",
        )}
      />
    );
  }

  const textInput = (
    <SheetInput
      label={resolvedLabel}
      labelPosition={labelPosition}
      variant={variant}
      inputSize="md"
      textAlign={field.textAlign}
      value={displayValue}
      onChange={(e) => {
        const nextValue = e.target.value;
        setSuggestionQuery(nextValue);
        setValue(field.id, nextValue);
        if (hasSuggestions && !isSuggestionOpen) {
          setIsSuggestionOpen(true);
        }
      }}
      onBlur={onBlur}
      placeholder={resolvedPlaceholder}
      readOnly={isReadonly}
      onFocus={() => {
        if (!hasSuggestions) return;
        setSuggestionQuery("");
        setIsSuggestionOpen(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setIsSuggestionOpen(false);
        }
      }}
    />
  );

  const input = hasSuggestions ? (
    <Popover open={isSuggestionOpen} onOpenChange={setIsSuggestionOpen}>
      <PopoverAnchor asChild>
        <div ref={suggestionAnchorRef}>{textInput}</div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-1"
        style={suggestionPopoverWidth ? { width: suggestionPopoverWidth } : undefined}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Command className="h-auto">
          <CommandList className="max-h-48 overflow-y-auto">
            {filteredSuggestions.slice(0, 12).map((suggestion) => (
              <CommandItem
                key={`${field.id}-suggestion-${suggestion}`}
                value={suggestion}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onSelect={() => {
                  setSuggestionQuery(suggestion);
                  setValue(field.id, suggestion);
                  setIsSuggestionOpen(false);
                  onBlur?.();
                }}
              >
                {suggestion}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  ) : (
    textInput
  );

  const actionVisible =
    !!fieldAction &&
    (setupMode || field.id === "lifeEventTitle") &&
    evaluateCondition(fieldAction.visibleWhen, data);

  const handleActionClick = () => {
    if (!fieldAction || !setData || !handlers) return;
    if (isLegacyFieldAction(fieldAction)) {
      const handler = handlers[fieldAction.handler];
      if (handler) runHandler(handler, data, setData);
    }
    onBlur?.();
  };

  const wrappedInput = actionVisible ? (
    <div className="relative w-full group">
      {input}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-6 print:hidden opacity-70 hover:opacity-100"
              onClick={handleActionClick}
            >
              {/* schema 的 action.icon 原本沒有任何消費端，一律畫 Calculator */}
              <FieldIcon
                name={fieldAction?.icon}
                fallback={Calculator}
                className="h-4 w-4"
              />
            </Button>
          </TooltipTrigger>
          {fieldAction?.tooltip && (
            <TooltipContent>{resolveI18n(fieldAction.tooltip)}</TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </div>
  ) : (
    input
  );

  if (!canOpenSettingsFromEra) {
    return wrappedInput;
  }

  return (
    <div
      className={cn("cursor-pointer")}
      onClick={() => onOpenPanel?.("settings")}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenPanel?.("settings");
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={resolvedLabel}
    >
      {wrappedInput}
    </div>
  );
}

// Self-register
registerFieldRenderer("text", TextFieldRenderer);
