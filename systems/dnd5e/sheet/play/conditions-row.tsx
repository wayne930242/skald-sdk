"use client";

/** The play view's conditions row: the conditions, the Exhaustion level, and the spell held with Concentration. */

import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@skald/sheet-sdk/components/ui/popover";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { usePlay } from "./play-context";
import { loadLaterText, preloadLaterText } from "./later-text";
import { conditionsOf, exhaustionLevel, exhaustionPatch, MAX_EXHAUSTION, text } from "./play-model";

/** The SRD conditions, in its order; Exhaustion carries a level. */
const CONDITIONS = [
  "blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled", "incapacitated", "invisible",
  "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious",
] as const;

/** The Exhaustion chip (A2-08): its level, what it costs, and a level picker for an editor. */
function ExhaustionChip() {
  const t = useTranslations("play");
  const { values, editable, write, reference } = usePlay();
  const level = exhaustionLevel(values);
  const label = `${reference.nameOf("condition:exhaustion")} ${level}`;
  // SRD 5.2.1: at level 6 the creature dies.
  const effect = level >= MAX_EXHAUSTION ? t("conditions.exhaustionDeath") : t("conditions.exhaustionEffect", { d20: 2 * level, feet: 5 * level });
  const chip = "inline-flex min-h-9 items-center gap-1 rounded-full border border-accent/50 bg-accent/10 px-3 text-sm";
  if (!editable) {
    return (
      <span className={chip} title={effect} data-play-exhaustion={level}>
        {label}
      </span>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={chip} aria-label={t("conditions.exhaustionChip", { label, effect })} data-play-exhaustion={level}>
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2 p-3">
        <p className="text-sm font-semibold">{t("conditions.exhaustionSet")}</p>
        <div className="grid grid-cols-6 gap-1" role="group" aria-label={t("conditions.exhaustionSet")}>
          {Array.from({ length: MAX_EXHAUSTION }, (_, index) => index + 1).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === level}
              aria-label={t("conditions.levelOption", { level: option })}
              onClick={() => write(exhaustionPatch(values, option))}
              className={cn("min-h-11 rounded-md border border-border text-sm tabular-nums hover:bg-muted sm:min-h-9", option === level && "bg-foreground font-semibold text-background hover:bg-foreground")}
            >
              {option}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{effect}</p>
        <button type="button" onClick={() => write(exhaustionPatch(values, 0))} className="min-h-11 w-full rounded-md border border-border text-sm hover:bg-muted sm:min-h-9">
          {t("conditions.removeExhaustion")}
        </button>
      </PopoverContent>
    </Popover>
  );
}

/** The spell held with Concentration (A2-12), with a way to end it. */
export function ConcentrationChip() {
  const t = useTranslations("play");
  const locale = useLocale();
  const { values, editable, write, reference } = usePlay();
  const key = text(values.concentration);
  if (!key) return null;
  const name = key.startsWith("spell:") ? reference.nameOf(key) : key;
  return (
    <span className="inline-flex min-h-9 items-center gap-1 rounded-full border border-sky-500/50 bg-sky-500/10 pl-3 text-sm" data-play-concentration>
      {t("spells.concentrating", { name })}
      {editable ? (
        <button
          type="button"
          aria-label={t("spells.endConcentration", { name })}
          onPointerDown={() => preloadLaterText(locale)}
          onClick={() => {
            write({ concentration: "" });
            void loadLaterText(locale).then((later) => toast(later("spells.concentrationEnded", { name })));
          }}
          className="inline-flex size-9 items-center justify-center rounded-full hover:bg-muted"
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : (
        <span className="pr-3" />
      )}
    </span>
  );
}

export function Conditions() {
  const t = useTranslations("play");
  const { values, editable, write, reference } = usePlay();
  const active = conditionsOf(values);
  const name = (id: string) => reference.nameOf(`condition:${id}`);
  const toggle = (id: string) =>
    write(id === "exhaustion" ? exhaustionPatch(values, active.includes(id) ? 0 : 1) : { conditions: active.includes(id) ? active.filter((item) => item !== id) : [...active, id] });
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" data-play-conditions>
      <span className="text-xs text-muted-foreground">{t("conditions.title")}</span>
      <ConcentrationChip />
      {active.length === 0 && !text(values.concentration) && <span className="rounded-full bg-muted/50 px-3 py-1.5 text-sm">{t("conditions.none")}</span>}
      {active.map((id) => id === "exhaustion" ? <ExhaustionChip key={id} /> : (
        <button
          key={id}
          type="button"
          disabled={!editable}
          onClick={() => toggle(id)}
          aria-label={t("conditions.remove", { name: name(id) })}
          className="inline-flex min-h-9 items-center gap-1 rounded-full border border-accent/50 bg-accent/10 px-3 text-sm"
        >
          {name(id)}
          {editable && <span aria-hidden="true">×</span>}
        </button>
      ))}
      {editable && (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-muted/40 px-3 text-sm hover:bg-muted sm:min-h-9">
              <Plus className="size-3.5" aria-hidden="true" />
              {t("conditions.add")}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="grid w-64 grid-cols-2 gap-1 p-2">
            {CONDITIONS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={active.includes(id)}
                onClick={() => toggle(id)}
                className={cn("min-h-11 rounded-md px-2 text-left text-sm hover:bg-muted sm:min-h-9", active.includes(id) && "bg-accent/15 font-semibold")}
              >
                {name(id)}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
