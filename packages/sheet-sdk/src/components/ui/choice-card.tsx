import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Check } from "lucide-react";

import { cn } from "@skald/sheet-sdk/lib/utils";

/**
 * A selectable tile: the card a person taps to pick an option (a wizard era,
 * a preset, a character). Hover, focus and selected states match `Button`'s
 * outline variant so every choice in the app answers the pointer the same way.
 *
 * Tiles that wrap a Radix control (a `RadioGroupItem` or `Checkbox` inside a
 * `<label>`) cannot be a `<button>` themselves; they use `choiceCardVariants`
 * on the wrapper instead.
 */
const choiceCardVariants = cva(
  "flex min-h-11 w-full items-start gap-3 rounded-md border bg-card px-3 py-2.5 text-left transition-[color,background-color,border-color,box-shadow] outline-none hover:border-primary/50 hover:bg-muted focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      selected: {
        true: "border-primary bg-primary/5 ring-1 ring-primary hover:border-primary hover:bg-primary/10",
        false: "",
      },
      dashed: {
        true: "border-dashed",
        false: "",
      },
    },
    defaultVariants: {
      selected: false,
      dashed: false,
    },
  },
);

type ChoiceCardProps = Omit<React.ComponentProps<"button">, "type"> &
  Omit<VariantProps<typeof choiceCardVariants>, "selected"> & {
    /** Selected look; defaults to `aria-checked` so radio and checkbox tiles need not repeat it. */
    selected?: boolean;
    /** Draw a leading radio (round) or checkbox (square) marker that follows the role. */
    indicator?: boolean;
  };

function ChoiceCard({
  className,
  selected,
  dashed,
  indicator = false,
  children,
  ...props
}: ChoiceCardProps) {
  const checked = props["aria-checked"];
  const isSelected = selected ?? (checked === true || checked === "true");
  return (
    <button
      type="button"
      data-slot="choice-card"
      data-selected={isSelected}
      className={cn(choiceCardVariants({ selected: isSelected, dashed }), className)}
      {...props}
    >
      {indicator && (
        <span
          data-slot="choice-card-indicator"
          aria-hidden
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center border",
            props.role === "checkbox" ? "rounded-sm" : "rounded-full",
            isSelected && "border-primary bg-primary text-primary-foreground",
          )}
        >
          {isSelected && <Check className="size-3.5" />}
        </span>
      )}
      {children}
    </button>
  );
}

export { ChoiceCard, choiceCardVariants };
