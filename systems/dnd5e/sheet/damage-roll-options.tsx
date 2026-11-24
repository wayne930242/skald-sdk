"use client";

import { use, useId, useMemo, useState } from "react";
import { NextIntlClientProvider, useLocale, useMessages, useTranslations } from "next-intl";
import { Checkbox } from "@skald/sheet-sdk/components/ui/checkbox";
import { Dialog } from "@skald/sheet-sdk/components/ui/dialog";
import { buildRollExpression } from "@skald/sheet-sdk/modules/rolls";
import { RollOptionsFrame } from "@skald/sheet-sdk/modules/rolls/ui/dice/roll-options-dialog";
import { RollModifierInput, rollModifierValue } from "@skald/sheet-sdk/modules/rolls/ui/dice/roll-modifier-input";
import type { CustomRollOptionsProps } from "@skald/sheet-sdk/modules/rolls/ui/dice/use-roll-gesture";
import { withCriticalDice } from "./d20-roll-args";
import { loadD20RollMessages } from "./roll-options-messages";

/** The one-time hint after the first roll, from the dialog's labels (loading them for the dialog too). */
export function loadHint(locale: string): Promise<string> {
  return loadD20RollMessages(locale).then((labels) => String(labels.damageHint));
}

/**
 * One damage roll's options (B-022), opened by the sheet roll gesture: a Critical Hit, which rolls
 * the damage dice twice over, and a modifier. Every opening starts from a plain roll.
 */
export default function DamageRollOptions({ open, onOpenChange, ...rest }: CustomRollOptionsProps) {
  const locale = useLocale();
  const messages = useMessages();
  const own = use(loadD20RollMessages(locale));
  const merged = useMemo(() => ({ ...messages, d20Roll: own }), [messages, own]);
  return (
    <NextIntlClientProvider locale={locale} messages={merged}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {open && <Content {...rest} />}
      </Dialog>
    </NextIntlClientProvider>
  );
}

function Content({ name, onRoll }: Omit<CustomRollOptionsProps, "open" | "onOpenChange">) {
  const t = useTranslations("d20Roll");
  const [critical, setCritical] = useState(false);
  const [modifierText, setModifierText] = useState("0");
  const criticalId = useId();
  const modifier = rollModifierValue(modifierText);

  const roll = () =>
    onRoll({
      transformExpression:
        critical || modifier !== 0
          ? (expression) => buildRollExpression(critical ? withCriticalDice(expression) : expression, { flatModifier: modifier })
          : undefined,
    });

  return (
    <RollOptionsFrame title={name} onRoll={roll}>
      <div className="grid gap-1" data-damage-roll-options>
        <div className="flex min-h-11 items-center gap-2 sm:min-h-9">
          <Checkbox id={criticalId} checked={critical} onCheckedChange={(next) => setCritical(next === true)} />
          <label htmlFor={criticalId} className="text-sm font-medium">{t("critical")}</label>
        </div>
        <p className="text-xs text-muted-foreground">{t("criticalHint")}</p>
      </div>
      <RollModifierInput
        label={t("modifier")}
        decreaseLabel={t("decrease")}
        increaseLabel={t("increase")}
        value={modifierText}
        onChange={setModifierText}
      />
    </RollOptionsFrame>
  );
}
