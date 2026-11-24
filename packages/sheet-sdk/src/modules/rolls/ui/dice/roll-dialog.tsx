"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@skald/sheet-sdk/components/ui/dialog";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { Label } from "@skald/sheet-sdk/components/ui/label";
import { Checkbox } from "@skald/sheet-sdk/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@skald/sheet-sdk/components/ui/radio-group";
import type { DialogConfig } from "@skald/dice/roll-expression";
import { useTranslations } from "next-intl";

/**
 * What the form gives when it is confirmed as it opens (nothing typed, nothing picked): a tap on a
 * roll with a template-defined form rolls with these (B-022). Unpicked multiple choices sum to 0.
 * A form that needs a value (a number to type, a single choice to pick) cannot roll untouched:
 * `null`, and a tap opens it instead (BUAT-F001).
 */
export function untouchedRollDialogValues(config: DialogConfig): Record<string, number> | null {
  if (config.input || config.options?.multiple === false) return null;
  return config.options ? { [config.options.id]: 0 } : {};
}

interface RollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: DialogConfig;
  onConfirm: (values: Record<string, number | string>) => void;
  title?: string;
}

export function RollDialog({
  open,
  onOpenChange,
  config,
  onConfirm,
  title,
}: RollDialogProps) {
  const t = useTranslations("dice");
  const [inputValue, setInputValue] = React.useState<string>("");
  const [selectedOptions, setSelectedOptions] = React.useState<Set<number>>(
    new Set(),
  );
  const [singleSelect, setSingleSelect] = React.useState<string>("");

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setInputValue("");
      setSelectedOptions(new Set());
      setSingleSelect("");
    }
  }, [open]);

  const handleConfirm = () => {
    const values: Record<string, number | string> = {};

    // Handle input value
    if (config.input) {
      const inputConfig =
        typeof config.input === "boolean" ? { id: "input" } : config.input;
      const numValue = parseFloat(inputValue);
      if (!isNaN(numValue)) {
        values[inputConfig.id ?? "input"] = numValue;
      }
    }

    // Handle options
    if (config.options) {
      const { id, multiple = true, options } = config.options;

      if (multiple) {
        // Multi-select: sum all selected values
        let sum = 0;
        for (const index of selectedOptions) {
          const option = options[index];
          if (typeof option.value === "number") {
            sum += option.value;
          }
        }
        values[id] = sum;
      } else {
        // Single-select: use selected value
        if (singleSelect) {
          const option = options.find((o) => String(o.value) === singleSelect);
          if (option) {
            values[id] = option.value;
          }
        }
      }
    }

    onConfirm(values);
    onOpenChange(false);
  };

  const inputConfig =
    typeof config.input === "boolean" ? { id: "input" } : config.input;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title ?? t("rollDialog.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Reference section */}
          {config.ref && (
            <div className="rounded-md bg-muted p-3 text-sm">
              {/* TODO: Load and render markdown content */}
              <p className="text-muted-foreground">
                {t("rollDialog.reference")}: {config.ref}
              </p>
            </div>
          )}

          {/* Options section */}
          {config.options && (
            <div className="space-y-2">
              <Label>{config.options.label ?? t("rollDialog.options")}</Label>

              {config.options.multiple !== false ? (
                // Multi-select checkbox
                <div className="space-y-2">
                  {config.options.options.map((option, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <Checkbox
                        id={`option-${index}`}
                        checked={selectedOptions.has(index)}
                        onCheckedChange={(checked) => {
                          const newSet = new Set(selectedOptions);
                          if (checked) {
                            newSet.add(index);
                          } else {
                            newSet.delete(index);
                          }
                          setSelectedOptions(newSet);
                        }}
                      />
                      <Label
                        htmlFor={`option-${index}`}
                        className="font-normal"
                      >
                        {option.label}
                        {typeof option.value === "number" && (
                          <span className="ml-1 text-muted-foreground">
                            (
                            {option.value > 0
                              ? `+${option.value}`
                              : option.value}
                            )
                          </span>
                        )}
                      </Label>
                    </div>
                  ))}
                </div>
              ) : (
                // Single-select radio
                <RadioGroup
                  value={singleSelect}
                  onValueChange={setSingleSelect}
                >
                  {config.options.options.map((option, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <RadioGroupItem
                        value={String(option.value)}
                        id={`option-${index}`}
                      />
                      <Label
                        htmlFor={`option-${index}`}
                        className="font-normal"
                      >
                        {option.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
            </div>
          )}

          {/* Input section */}
          {config.input && inputConfig && (
            <div className="space-y-2">
              <Label htmlFor="roll-input">
                {inputConfig.label ?? t("rollDialog.targetValue")}
              </Label>
              <Input
                id="roll-input"
                type="number"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={inputConfig.placeholder}
                min={inputConfig.min}
                max={inputConfig.max}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("rollDialog.cancel")}
          </Button>
          <Button onClick={handleConfirm}>{t("rollDialog.roll")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
