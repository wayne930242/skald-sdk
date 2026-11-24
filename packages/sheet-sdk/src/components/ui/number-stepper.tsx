"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Minus, Plus } from "lucide-react";

import { cn } from "@skald/sheet-sdk/lib/utils";

/**
 * Press-and-hold timing. A hold waits HOLD_DELAY_MS, so a tap is never read as a hold, then
 * repeats one step every 80 ms (12.5 a second: each value is still readable). After 1.4 s held
 * it moves in fives every 150 ms (about 33 a second), after 2.9 s in tens. Accelerated steps
 * land on multiples of their size, so the numbers that fly past are round. On a 0–99 skill:
 * +14 in the first 1.4 s, about +60 by 3 s; the person lets go near the target and taps the rest.
 */
export const HOLD_DELAY_MS = 400;
const HOLD_STAGES = [
  { from: 0, size: 1, interval: 80 },
  { from: 1400, size: 5, interval: 150 },
  { from: 2900, size: 10, interval: 150 },
] as const;

function holdStage(heldMs: number) {
  let stage: (typeof HOLD_STAGES)[number] = HOLD_STAGES[0];
  for (const candidate of HOLD_STAGES) if (heldMs >= candidate.from) stage = candidate;
  return stage;
}

const numberStepperVariants = cva("inline-flex shrink-0 items-center", {
  variants: {
    size: {
      /** Touch size: every control is 44px. */
      default: "gap-1.5",
      sm: "gap-1",
    },
  },
  defaultVariants: { size: "default" },
});

const stepButtonVariants = cva(
  // touch-manipulation: a pan that starts on the button still scrolls (the browser cancels the
  // pointer), and there is no double-tap zoom. No selection or iOS callout on a long press.
  "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-btn border bg-card text-foreground transition-[color,background-color,box-shadow] outline-none select-none touch-manipulation [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] hover:bg-muted active:bg-muted focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4",
  {
    variants: {
      size: {
        default: "size-11",
        sm: "size-9",
      },
    },
    defaultVariants: { size: "default" },
  },
);

const stepInputVariants = cva(
  "rounded-md border border-input bg-transparent px-1 text-center text-base tabular-nums shadow-xs transition-[color,box-shadow] outline-none dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 md:text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
  {
    variants: {
      size: {
        // Three digits at 16px with room to spare.
        default: "h-11 w-16",
        sm: "h-9 w-14",
      },
    },
    defaultVariants: { size: "default" },
  },
);

type Direction = 1 | -1;

type NumberStepperProps = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "onChange" | "min" | "max" | "size" | "step"
> &
  VariantProps<typeof numberStepperVariants> & {
    value: number;
    onValueChange: (value: number) => void;
    /** − stops at min; a value already below it can still go up. */
    min?: number;
    /** + stops at max; a value already above it can still go down. */
    max?: number;
    /**
     * Where one step from `value` lands (default ±1). A hold or a PageUp takes several of
     * these steps; typing a number is never adjusted.
     */
    stepTo?: (value: number, direction: Direction) => number;
    decrementLabel: string;
    incrementLabel: string;
    invalid?: boolean;
    /** Classes for the wrapper; `className` styles the input. */
    rootClassName?: string;
  };

const plainStep = (value: number, direction: Direction) => value + direction;

type Limits = { min?: number; max?: number; stepTo: (value: number, direction: Direction) => number };

/** Whether one step from `from` stays within the limit it moves toward. */
function canStepFrom({ min, max, stepTo }: Limits, from: number, direction: Direction): boolean {
  const next = stepTo(from, direction);
  if (next === from) return false;
  if (direction > 0) return max === undefined || next <= max;
  return min === undefined || next >= min;
}

type RepeaterProps = Limits & { value: number; onValueChange: (value: number) => void };

/**
 * Steps a value for one stepper: single steps, and the press-and-hold repeat. It reads the
 * stepper's latest props on every step, since a hold outlives the render it started in; its
 * `value` moves ahead of the props while a hold steps faster than the parent renders.
 */
class HoldRepeater {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private direction: Direction = 1;
  private heldMs = 0;
  private active = false;
  /** A finger: the tap's step is taken on release, unless the hold already stepped. */
  private stepOnRelease = false;

  /** The parent's value at the last update: only a change of it resets the stepped value. */
  private parentValue: number;

  constructor(private props: RepeaterProps) {
    this.parentValue = props.value;
  }

  update(props: RepeaterProps) {
    const value = props.value === this.parentValue ? this.props.value : props.value;
    this.parentValue = props.value;
    this.props = { ...props, value };
  }

  /** Takes up to `units` steps; with `snap`, as many as reach the next multiple of `units`. Returns whether another step fits. */
  step(direction: Direction, units: number, snap = false): boolean {
    const props = this.props;
    const start = props.value;
    let count = units;
    if (snap && units > 1) {
      const offset = ((start % units) + units) % units;
      count = direction > 0 ? units - offset : offset || units;
    }
    let next = start;
    for (let index = 0; index < count && canStepFrom(props, next, direction); index += 1) {
      next = props.stepTo(next, direction);
    }
    if (next === start) return false;
    props.value = next;
    props.onValueChange(next);
    return canStepFrom(props, next, direction);
  }

  /** A press: a mouse steps now, a finger on release; either repeats after HOLD_DELAY_MS. */
  start(direction: Direction, touch: boolean) {
    this.stop();
    if (!touch && !this.step(direction, 1)) return;
    this.active = true;
    this.direction = direction;
    this.heldMs = HOLD_DELAY_MS;
    this.stepOnRelease = touch;
    this.timer = setTimeout(this.tick, HOLD_DELAY_MS);
  }

  release() {
    const tap = this.active && this.stepOnRelease;
    this.stop();
    if (tap) this.step(this.direction, 1);
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.active = false;
  }

  private tick = () => {
    if (!this.active) return;
    this.stepOnRelease = false;
    const stage = holdStage(this.heldMs);
    if (!this.step(this.direction, stage.size, true)) {
      this.stop();
      return;
    }
    this.heldMs += stage.interval;
    this.timer = setTimeout(this.tick, stage.interval);
  };
}

/**
 * A number between a − and a + button. A tap moves one step; holding a button repeats and
 * speeds up (see HOLD_STAGES) until it is let go, the pointer leaves or is cancelled, the
 * button loses focus, or the next step would pass `min`/`max`, which also disables the button.
 * A mouse steps on press, a finger on release, so a swipe that starts on a button scrolls
 * the page without changing anything. On the input, ↑/↓ move one step and PageUp/PageDown
 * ten; Enter or Space on a button steps once per key press and per key repeat.
 */
function NumberStepper({
  value,
  onValueChange,
  min,
  max,
  stepTo = plainStep,
  decrementLabel,
  incrementLabel,
  invalid,
  disabled,
  size,
  className,
  rootClassName,
  onFocus,
  onKeyDown,
  ...inputProps
}: NumberStepperProps) {
  const [repeater] = React.useState(
    () => new HoldRepeater({ value, min, max, stepTo, onValueChange }),
  );
  React.useLayoutEffect(() => {
    repeater.update({ value, min, max, stepTo, onValueChange });
  });
  const keyPress = React.useRef(false);
  const keyPressTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // A release or cancel away from the button (or on one a hold just disabled) still ends it.
  React.useEffect(() => {
    const onWindowEnd = () => repeater.stop();
    window.addEventListener("pointerup", onWindowEnd);
    window.addEventListener("pointercancel", onWindowEnd);
    window.addEventListener("blur", onWindowEnd);
    return () => {
      window.removeEventListener("pointerup", onWindowEnd);
      window.removeEventListener("pointercancel", onWindowEnd);
      window.removeEventListener("blur", onWindowEnd);
      repeater.stop();
      clearTimeout(keyPressTimer.current);
    };
  }, [repeater]);

  const buttonProps = (direction: Direction, label: string) => ({
    type: "button" as const,
    "data-slot": "number-stepper-button",
    "data-direction": direction > 0 ? "increase" : "decrease",
    "aria-label": label,
    disabled: disabled || !canStepFrom({ min, max, stepTo }, value, direction),
    className: stepButtonVariants({ size }),
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      repeater.start(direction, event.pointerType !== "mouse");
    },
    onPointerUp: () => repeater.release(),
    onPointerLeave: () => repeater.stop(),
    onPointerCancel: () => repeater.stop(),
    onBlur: () => repeater.stop(),
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      // The key steps itself, also on auto-repeat; the click it would cause must not step again.
      event.preventDefault();
      keyPress.current = true;
      clearTimeout(keyPressTimer.current);
      repeater.step(direction, 1);
    },
    onKeyUp: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      // Space clicks on key up, after this handler: forget the key press only once that passed.
      keyPressTimer.current = setTimeout(() => {
        keyPress.current = false;
      }, 0);
    },
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      // A pointer click (detail ≥ 1) stepped on press or release; a key press stepped on key down.
      // A click with neither comes from assistive technology.
      if (event.detail !== 0 || keyPress.current) return;
      repeater.step(direction, 1);
    },
  });

  return (
    <div
      data-slot="number-stepper"
      className={cn(numberStepperVariants({ size }), rootClassName)}
    >
      <button {...buttonProps(-1, decrementLabel)}>
        <Minus aria-hidden />
      </button>
      <input
        type="number"
        inputMode="numeric"
        data-slot="number-stepper-input"
        className={cn(stepInputVariants({ size }), className)}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        // No native min/max: a typed number past a limit is the caller's to report, and
        // min/max would block a surrounding form's submit.
        value={Number.isFinite(value) ? value : ""}
        {...inputProps}
        onFocus={(event) => {
          event.currentTarget.select();
          onFocus?.(event);
        }}
        onChange={(event) => {
          const next = event.target.valueAsNumber;
          if (Number.isFinite(next)) onValueChange(next);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          const keys: Record<string, [Direction, number]> = {
            ArrowUp: [1, 1],
            ArrowDown: [-1, 1],
            PageUp: [1, 10],
            PageDown: [-1, 10],
          };
          const move = keys[event.key];
          if (!move) return;
          event.preventDefault();
          repeater.step(move[0], move[1]);
        }}
      />
      <button {...buttonProps(1, incrementLabel)}>
        <Plus aria-hidden />
      </button>
    </div>
  );
}

export { NumberStepper, numberStepperVariants, stepButtonVariants };
