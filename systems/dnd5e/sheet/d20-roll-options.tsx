"use client";

import { use, useMemo, useState } from "react";
import { NextIntlClientProvider, useLocale, useMessages, useTranslations } from "next-intl";
import { Dialog } from "@skald/sheet-sdk/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@skald/sheet-sdk/components/ui/toggle-group";
import { useSystemOptional } from "@skald/sheet-sdk/components/providers/system-provider";
import { RollOptionsFrame, SEGMENT_ITEM_CLASS } from "@skald/sheet-sdk/modules/rolls/ui/dice/roll-options-dialog";
import { RollModifierInput, rollModifierValue } from "@skald/sheet-sdk/modules/rolls/ui/dice/roll-modifier-input";
import type { CustomRollOptionsProps } from "@skald/sheet-sdk/modules/rolls/ui/dice/use-roll-gesture";
import { loadD20RollMessages } from "./roll-options-messages";
import { d20ExtraDiceArgs, d20ModifierApplies, d20TakesExtraDice, withD20Modifier } from "./d20-roll-args";

const MODES = [
  [-1, "disadvantage"],
  [0, "normal"],
  [1, "advantage"],
] as const;

/** Bless and Guidance add a d4, Bane takes one away, Bardic Inspiration adds a d6 to a d12. */
const NONE = "none";
const EXTRA_DICE = [NONE, "1d4", "-1d4", "1d6", "1d8", "1d10", "1d12"] as const;

const MINUS = "−";
const extraLabel = (dice: string) => (dice.startsWith("-") ? `${MINUS}${dice.slice(1)}` : `+${dice}`);

/** The one-time hint after the first roll, from the dialog's labels (loading them for the dialog too). */
export function loadHint(locale: string): Promise<string> {
  return loadD20RollMessages(locale).then((labels) => String(labels.hint));
}

/**
 * One roll's options on a d20 Test (B-021), opened by the sheet roll gesture. `data.exhaustionPenalty`
 * is the D20 Test penalty already in the roll; `data.expression`, when given, is the roll's own
 * expression, whose shape decides whether a modifier can join it. The choice reaches the roll as the `adv` override, a
 * modifier joined to the d20 call's first argument, and extra dice as the macro's `xn`/`xd`
 * arguments, offered only when the system's d20 macro takes them (one seeded before B-021 does not).
 */
export default function D20RollOptions({ open, onOpenChange, ...rest }: CustomRollOptionsProps) {
  const locale = useLocale();
  const messages = useMessages();
  const own = use(loadD20RollMessages(locale));
  const merged = useMemo(() => ({ ...messages, d20Roll: own }), [messages, own]);
  return (
    <NextIntlClientProvider locale={locale} messages={merged}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {open && <D20RollOptionsContent {...rest} />}
      </Dialog>
    </NextIntlClientProvider>
  );
}

function D20RollOptionsContent({ name, data, onRoll }: Omit<CustomRollOptionsProps, "open" | "onOpenChange">) {
  const t = useTranslations("d20Roll");
  const extraDice = d20TakesExtraDice(useSystemOptional()?.dsl?.rollMacros);
  const exhaustionPenalty = typeof data?.exhaustionPenalty === "number" ? data.exhaustionPenalty : 0;
  // A roll the modifier cannot reach (another macro's call) offers none, rather than drop it (BUAT-F002).
  const takesModifier = typeof data?.expression !== "string" || d20ModifierApplies(data.expression);
  // Every opening starts from a plain roll: nothing carries over to the next one.
  const [adv, setAdv] = useState(0);
  const [modifierText, setModifierText] = useState("0");
  const [extra, setExtra] = useState<string>(NONE);
  const modifier = rollModifierValue(modifierText);

  const roll = () =>
    onRoll({
      bonusDice: adv,
      transformExpression: takesModifier && modifier ? (expression) => withD20Modifier(expression, modifier) : undefined,
      macroArgs: extra === NONE ? undefined : d20ExtraDiceArgs(extra),
    });

  return (
    <RollOptionsFrame title={name} onRoll={roll}>
      <div className="grid gap-2" data-d20-roll-options>
        <span className="text-xs font-semibold text-muted-foreground">{t("mode")}</span>
        <ToggleGroup
          type="single"
          value={String(adv)}
          onValueChange={(next) => {
            if (next !== "") setAdv(Number(next));
          }}
          aria-label={t("mode")}
          className="w-full gap-0 rounded-full border bg-muted p-1"
        >
          {MODES.map(([value, key]) => (
            <ToggleGroupItem key={key} value={String(value)} aria-label={t(key)} className={SEGMENT_ITEM_CLASS}>
              {t(key)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {exhaustionPenalty > 0 && (
          <p className="text-xs text-muted-foreground">{t("exhaustion", { value: `${MINUS}${exhaustionPenalty}` })}</p>
        )}
      </div>

      {takesModifier && (
        <RollModifierInput
          label={t("modifier")}
          decreaseLabel={t("decrease")}
          increaseLabel={t("increase")}
          value={modifierText}
          onChange={setModifierText}
        />
      )}

      {extraDice && (
        <div className="grid gap-2">
          <span className="text-xs font-semibold text-muted-foreground">{t("extraDice")}</span>
          <ToggleGroup
            type="single"
            value={extra}
            // 永遠要有一個值（無＝不加骰）
            onValueChange={(next) => setExtra(next || NONE)}
            aria-label={t("extraDice")}
            className="flex w-full flex-wrap justify-start gap-1.5"
          >
            {EXTRA_DICE.map((dice) => (
              <ToggleGroupItem
                key={dice}
                value={dice}
                aria-label={dice === NONE ? t("none") : extraLabel(dice)}
                className="min-h-11 flex-none rounded-full border px-3 tabular-nums data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background sm:min-h-9"
              >
                {dice === NONE ? t("none") : extraLabel(dice)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
    </RollOptionsFrame>
  );
}
