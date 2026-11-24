"use client";

import { useId } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Input } from "@skald/sheet-sdk/components/ui/input";

/** The whole number a modifier box holds; anything else counts as 0. */
export function rollModifierValue(text: string): number {
  return Number.parseInt(text, 10) || 0;
}

/**
 * A roll options dialog's ±N: a number box between −1 and +1 steppers (B-021, B-022). The text is
 * the caller's state, so a box being typed in can be empty or "-" for a moment.
 */
export function RollModifierInput({ label, decreaseLabel, increaseLabel, value, onChange }: {
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const step = (by: number) => onChange(String(rollModifierValue(value) + by));
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" className="size-11 sm:size-9" aria-label={decreaseLabel} onClick={() => step(-1)}>
          <Minus />
        </Button>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          step={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={(event) => event.target.select()}
          className="h-11 w-20 text-center tabular-nums sm:h-9"
        />
        <Button type="button" variant="outline" size="icon" className="size-11 sm:size-9" aria-label={increaseLabel} onClick={() => step(1)}>
          <Plus />
        </Button>
      </div>
    </div>
  );
}
