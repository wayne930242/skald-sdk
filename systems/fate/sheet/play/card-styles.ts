/**
 * Shared frames of the B view (direction 「梯度與代幣」), kept in one place so the slots of other
 * tasks match the shell without importing its components. Touch targets are 44 px on a phone and
 * may shrink to 32 px once the view is wide (`@3xl`, desktop).
 */
export const CARD = "min-w-0 rounded-xl border border-border bg-card p-3 @3xl:p-4";
export const CARD_TITLE = "font-display text-lg leading-tight @3xl:text-xl";
export const CARD_HEAD = "mb-2 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1";
export const MUTED = "text-sm text-muted-foreground";
/** A small control: pencil, rules link, remove. */
export const ICON_BUTTON =
  "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @3xl:min-h-8 @3xl:min-w-8";
/** A labelled secondary button. */
export const TEXT_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 @3xl:min-h-9";
/** An action under an aspect card (援引, 接受強迫): compact, 44 px tall on a phone. */
export const ASPECT_ACTION =
  "inline-flex min-h-11 min-w-0 items-center justify-center rounded-md border border-border bg-background/60 px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 @3xl:min-h-8 @3xl:px-2 @3xl:text-xs";
/** A skill on the ladder: the same frame whether or not a roll trigger wraps it. */
export const SKILL_CHIP =
  "inline-flex min-h-11 max-w-full items-center rounded-lg border border-border bg-muted/40 px-3 text-sm [overflow-wrap:anywhere] @3xl:min-h-8";
/** The tarot-like aspect card: a double frame with a warm wash. */
export const ASPECT_CARD =
  "relative flex min-w-0 flex-col rounded-xl border border-accent/40 bg-gradient-to-b from-accent/10 via-card to-card p-1.5 shadow-sm";
export const ASPECT_CARD_INNER = "flex min-h-full flex-1 flex-col gap-2 rounded-lg border border-accent/25 px-3 pb-2 pt-2.5";
