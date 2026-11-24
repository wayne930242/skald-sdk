"use client";

import { useId, useMemo, useState } from "react";
import { BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@skald/sheet-sdk/components/ui/dialog";
import { NumberStepper } from "@skald/sheet-sdk/components/ui/number-stepper";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { FateAction } from "../../domain/character";
import {
  FATE_ACTIONS,
  defaultFateRollOptions,
  fateScaleModes,
  gradeFateRoll,
  previewFateRoll,
  type FateAdvantageTarget,
  type FateOutcome,
  type FateRollOptions,
} from "../../domain/roll";
import { sheetRuleTargets } from "../../reference/rule-ids";
import { useFatePlay } from "../play/play-context";
import type { FatePlaySkill } from "../play/play-model";
import { ICON_BUTTON, MUTED, TEXT_BUTTON } from "../play/card-styles";
import { signed } from "../play/skill-ladder";
import { OUTCOME_TONE, useLadderText } from "./roll-format";
import type { FateRollRules } from "./roll-rules";
import { fateGearHint, fateRollStunts } from "./roll-stunts";
import { useReturnFocus } from "./return-focus";

/** Phone: a bottom sheet over the page; wider: a centred dialog (frames 08 and 16). */
export const FATE_SHEET_DIALOG =
  "max-h-[92dvh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none max-sm:p-4 sm:max-w-xl";

const ADVANTAGE_TARGETS = ["new", "known", "unknown"] as const satisfies readonly FateAdvantageTarget[];
const OPPOSITION_RANGE = { min: -10, max: 20 } as const;

const PREVIEW_TONE: Record<FateOutcome, string> = {
  fail: "bg-red-500/15 text-red-600 dark:text-red-300",
  tie: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  style: "bg-emerald-500/30 text-emerald-800 dark:text-emerald-200",
};

function Choice({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(TEXT_BUTTON, "min-w-0 flex-1", selected && "border-accent bg-accent/15 font-semibold text-accent")}
    >
      {children}
    </button>
  );
}

export interface FateRollOptionsDialogProps {
  skill: FatePlaySkill;
  label: string;
  rules: FateRollRules;
  onRoll: (options: FateRollOptions) => void;
  onClose: () => void;
}

/**
 * Roll options (frame 08), opened by a long press, right click or Shift+Enter. Starts from the
 * defaults (overcome against +0, nothing selected); cancelling or closing never rolls and never
 * uses a stunt. Gear and scale appear only when the character's preset enables them.
 */
export function FateRollOptionsDialog({ skill, label, rules, onRoll, onClose }: FateRollOptionsDialogProps) {
  const t = useTranslations("fateRolls.options");
  const ta = useTranslations("fateRolls.action");
  const { data, editable, openRules } = useFatePlay();
  const ladder = useLadderText();
  const ids = useId();
  const [options, setOptions] = useState<FateRollOptions>(defaultFateRollOptions);
  const set = (patch: Partial<FateRollOptions>) => setOptions((current) => ({ ...current, ...patch }));

  const stunts = useMemo(() => fateRollStunts(data, { id: skill.id, name: label }, options.action, editable), [data, skill.id, label, options.action, editable]);
  const availableStunts = new Set(stunts.filter((stunt) => stunt.available).map((stunt) => stunt.stuntId));
  const selectedStunts = options.stunts.filter((stunt) => availableStunts.has(stunt.stuntId));
  if (selectedStunts.length !== options.stunts.length) {
    setOptions({ ...options, stunts: selectedStunts });
  }
  const gear = fateGearHint(data);
  const scaleModes = rules.scale.enabled ? fateScaleModes(rules.scale, options.action) : [];
  const showGear = rules.ratings.enabled && options.action === "attack";

  const chooseAction = (action: FateAction) => {
    const allowed = new Set(fateRollStunts(data, { id: skill.id, name: label }, action, editable).filter((s) => s.available).map((s) => s.stuntId));
    setOptions((current) => ({
      ...current,
      action,
      stunts: current.stunts.filter((stunt) => allowed.has(stunt.stuntId)),
      // Gear counts only for an attack; a scale mode must suit the new action.
      ...(action === "attack" ? {} : { weapon: 0, armor: 0 }),
      scale: current.scale && rules.scale.enabled && fateScaleModes(rules.scale, action).some((mode) => mode.id === current.scale?.modeId) ? current.scale : null,
    }));
  };

  const toggleStunt = (stuntId: string, bonus: number, on: boolean) =>
    setOptions((current) => ({
      ...current,
      stunts: on ? [...current.stunts.filter((s) => s.stuntId !== stuntId), { stuntId, bonus }] : current.stunts.filter((s) => s.stuntId !== stuntId),
    }));

  const scaleMode = rules.scale.modes.find((mode) => mode.id === options.scale?.modeId);
  const scaleDifference = options.scale ? rules.scale.tiers.indexOf(options.scale.selfTier) - rules.scale.tiers.indexOf(options.scale.otherTier) : 0;
  const beforeRollBonus = scaleMode?.timing === "beforeRoll" && scaleDifference > 0 ? scaleMode.perTier * scaleDifference : 0;
  const preview = previewFateRoll(skill.rating, options, beforeRollBonus);
  const base = skill.rating + options.stunts.reduce((sum, s) => sum + s.bonus, 0) + beforeRollBonus;
  const scaleProblem = options.scale && (scaleDifference <= 0 ? "notHigher" : null);

  const parts = [
    `${label} ${signed(skill.rating)}`,
    ...options.stunts.map((chosen) => `${stunts.find((s) => s.stuntId === chosen.stuntId)?.title || t("stunt")} ${signed(chosen.bonus)}`),
    ...(beforeRollBonus ? [`${t("scale.title")} ${signed(beforeRollBonus)}`] : []),
  ];

  const returnFocus = useReturnFocus();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={FATE_SHEET_DIALOG} data-fate-roll-options onCloseAutoFocus={returnFocus}>
        <DialogHeader className="text-left">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="font-medium text-accent">{t("subtitle", { skill: label, rating: ladder(skill.rating) })}</DialogDescription>
        </DialogHeader>

        <fieldset className="min-w-0 space-y-2">
          <legend className="mb-1 inline-flex items-center gap-1 text-sm font-medium">
            {t("action")}
            <button type="button" className={ICON_BUTTON} aria-label={t("rules", { section: t("action") })} onClick={() => openRules(sheetRuleTargets.actions)}>
              <BookOpen className="size-4" aria-hidden />
            </button>
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={t("action")}>
            {FATE_ACTIONS.map((action) => (
              <Choice key={action} selected={options.action === action} onSelect={() => chooseAction(action)}>{ta(action)}</Choice>
            ))}
          </div>
          {options.action === "createAdvantage" && (
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("advantage.title")}>
              {ADVANTAGE_TARGETS.map((target) => (
                <Choice key={target} selected={options.advantage === target} onSelect={() => set({ advantage: target })}>{t(`advantage.${target}`)}</Choice>
              ))}
            </div>
          )}
        </fieldset>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1">
            <label htmlFor={`${ids}-opposition`} className="text-sm font-medium">{t("opposition")}</label>
            <div className="flex flex-wrap items-center gap-2">
              <NumberStepper
                id={`${ids}-opposition`}
                value={options.opposition}
                onValueChange={(value) => set({ opposition: Math.max(OPPOSITION_RANGE.min, Math.min(OPPOSITION_RANGE.max, Math.trunc(value))) })}
                min={OPPOSITION_RANGE.min}
                max={OPPOSITION_RANGE.max}
                decrementLabel={t("lower", { field: t("opposition") })}
                incrementLabel={t("raise", { field: t("opposition") })}
              />
              <span className="text-sm text-muted-foreground" data-fate-opposition-label>{ladder(options.opposition)}</span>
            </div>
            <p className={cn(MUTED, "text-xs")}>{t("oppositionHint")}</p>
          </div>

          {scaleModes.length > 0 && (
            <div className="min-w-0 space-y-1" data-fate-scale-options>
              <span className="text-sm font-medium">{t("scale.title")}</span>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-accent)]"
                  checked={options.scale !== null}
                  onChange={(event) => set({
                    scale: event.target.checked
                      ? { selfTier: gear.scaleTierId && rules.scale.tiers.includes(gear.scaleTierId) ? gear.scaleTierId : rules.scale.tiers[0] ?? "", otherTier: rules.scale.tiers[0] ?? "", modeId: scaleModes[0].id }
                      : null,
                  })}
                />
                {t("scale.apply")}
              </label>
              {options.scale && (
                <div className="grid gap-1.5">
                  {(["selfTier", "otherTier"] as const).map((side) => (
                    <label key={side} className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2 text-sm">
                      <span>{t(`scale.${side}`)}</span>
                      <select
                        className="h-11 min-w-0 rounded-md border border-input bg-background px-2 @3xl:h-9"
                        value={options.scale?.[side] ?? ""}
                        onChange={(event) => setOptions((current) => (current.scale ? { ...current, scale: { ...current.scale, [side]: event.target.value } } : current))}
                      >
                        {rules.scale.tiers.map((tier) => <option key={tier} value={tier}>{t.has(`scale.tiers.${tier}`) ? t(`scale.tiers.${tier}`) : tier}</option>)}
                      </select>
                    </label>
                  ))}
                  <label className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2 text-sm">
                    <span>{t("scale.mode")}</span>
                    <select
                      className="h-11 min-w-0 rounded-md border border-input bg-background px-2"
                      value={options.scale.modeId}
                      onChange={(event) => setOptions((current) => (current.scale ? { ...current, scale: { ...current.scale, modeId: event.target.value } } : current))}
                    >
                      {scaleModes.map((mode) => <option key={mode.id} value={mode.id}>{t(`scale.modes.${mode.timing}`, { value: mode.perTier })}</option>)}
                    </select>
                  </label>
                  <p className={cn(MUTED, "text-xs")}>{scaleProblem ? t("scale.notHigher") : t("scale.difference", { tiers: scaleDifference })}</p>
                </div>
              )}
            </div>
          )}

          {showGear && (
            <div className="min-w-0 space-y-2 sm:col-span-2" data-fate-gear-options>
              {(["weapon", "armor"] as const).map((kind) => (
                <div key={kind} className="flex flex-wrap items-center gap-2">
                  <label htmlFor={`${ids}-${kind}`} className="w-28 text-sm font-medium">{t(`gear.${kind}`)}</label>
                  <NumberStepper
                    id={`${ids}-${kind}`}
                    value={options[kind]}
                    onValueChange={(value) => set({ [kind]: Math.max(0, Math.min(rules.ratings.enabled ? rules.ratings.max : 0, Math.trunc(value))) })}
                    min={0}
                    max={rules.ratings.enabled ? rules.ratings.max : 0}
                    decrementLabel={t("lower", { field: t(`gear.${kind}`) })}
                    incrementLabel={t("raise", { field: t(`gear.${kind}`) })}
                  />
                  {kind === "weapon" && gear.weapon !== undefined && <span className={cn(MUTED, "text-xs")}>{t("gear.yours", { rating: gear.weapon })}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {stunts.length > 0 && (
          <fieldset className="min-w-0 space-y-2" data-fate-stunt-options>
            <legend className="text-sm font-medium">{t("stunts")}</legend>
            {stunts.map((stunt) => {
              const checked = options.stunts.some((s) => s.stuntId === stunt.stuntId);
              return (
                <label
                  key={stunt.stuntId}
                  className={cn("flex min-h-11 items-start gap-3 rounded-lg border border-border p-3", checked && "border-accent bg-accent/10", !stunt.available && "opacity-60")}
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-[var(--color-accent)]"
                    checked={checked}
                    disabled={!stunt.available}
                    onChange={(event) => toggleStunt(stunt.stuntId, stunt.bonus, event.target.checked)}
                  />
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    <span className="block font-medium text-accent">{stunt.title || t("stunt")} {signed(stunt.bonus)}</span>
                    <span className="block text-sm">{stunt.condition ? t("confirmCondition", { condition: stunt.condition }) : t("confirmFiction")}</span>
                    {stunt.blocked && <span className="block text-xs text-muted-foreground">{t(`stuntBlocked.${stunt.blocked}`)}</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}

        <section className="rounded-lg border border-border bg-muted/30 p-3" aria-label={t("preview.title")} data-fate-roll-preview>
          <p className="text-xs font-medium text-muted-foreground">{t("preview.title")}</p>
          <p className="font-display text-2xl text-accent">{ladder(base)}</p>
          <p className="text-sm [overflow-wrap:anywhere]">{parts.join(" + ")}</p>
          <ol className="mt-2 grid grid-cols-9 gap-0.5 text-center text-2xs tabular-nums" aria-label={t("preview.range", { opposition: signed(options.opposition) })}>
            {preview.map((cell) => (
              <li key={cell.dice} className={cn("rounded px-0.5 py-1", PREVIEW_TONE[cell.outcome])} title={t(`preview.cell`, { dice: signed(cell.dice), total: signed(cell.total) })}>
                <span className="block">{signed(cell.dice)}</span>
                <span className="sr-only">{t("preview.cell", { dice: signed(cell.dice), total: signed(cell.total) })} {t(`preview.outcome.${cell.outcome}`)}</span>
              </li>
            ))}
          </ol>
          <p className={cn(MUTED, "mt-1 text-xs")}>
            {t("preview.note")}{" "}
            <span className={OUTCOME_TONE[gradeFateRoll(base, options.opposition).outcome]}>{t(`preview.outcome.${gradeFateRoll(base, options.opposition).outcome}`)}</span>
          </p>
        </section>

        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" className={cn(TEXT_BUTTON, "min-w-24")} onClick={onClose}>{t("cancel")}</button>
          <button
            type="button"
            className={cn(TEXT_BUTTON, "min-w-28 border-accent bg-accent text-accent-foreground hover:bg-accent/90")}
            disabled={Boolean(scaleProblem)}
            onClick={() => onRoll(options)}
          >
            {t("roll")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
