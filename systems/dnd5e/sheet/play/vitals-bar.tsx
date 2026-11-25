"use client";

import { useState } from "react";
import { Minus, Plus, Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import type { RollConfig } from "@skald/dice/roll-expression";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@skald/sheet-sdk/components/ui/alert-dialog";
import { useRollOptional } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import { OverrideMark } from "@skald/sheet-sdk/modules/character/ui/derived/override-mark";
import { useIsOverridden } from "@skald/sheet-sdk/modules/character/ui/derived/use-is-overridden";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { fieldRoll, useOpenDndEditor, usePlay, usePlayEditing } from "./play-context";
import type { EditTarget } from "./edit-layer";
import { D20Icon, PlayRollButton } from "./play-roll-button";
import { useD20RollGesture } from "../d20-roll-gesture";
import { Conditions } from "./conditions-row";
import { loadLaterText, preloadLaterText, type LaterText } from "./later-text";

export { ConcentrationChip, Conditions } from "./conditions-row";
import {
  adjustHitPoints,
  deathSave,
  exhaustionLevel,
  hitPoints,
  keptD20,
  longRestPatch,
  num,
  shortRestPatch,
  signed,
  speedShown,
  armorSlows,
} from "./play-model";
import { hitDicePools, spendHitDie as spendPoolDie, type HitDicePool } from "./class-model";

const PANEL = "rounded-xl border border-border bg-card";
const TILE = "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-muted/50 px-2 py-1.5 text-center";
const TILE_LABEL = "max-w-full text-balance text-xs leading-tight text-muted-foreground";
const TILE_VALUE = "whitespace-nowrap text-xl font-semibold leading-tight tabular-nums";
const ICON_BUTTON =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-muted/40 sm:size-10";

/** B-023: in edit mode a play control opens its value's editor; its name says so. */
function useEditTap(target: EditTarget, name: string) {
  const tRenderer = useTranslations("renderer");
  const editing = usePlayEditing();
  const open = useOpenDndEditor();
  return editing ? { onClick: () => open(target), label: tRenderer("editValue", { name }) } : null;
}

function HitPointBlock({ compact }: { compact: boolean }) {
  const t = useTranslations("play");
  const { values, editable, write } = usePlay();
  const edit = useEditTap("hp", t("hp.title"));
  const hp = hitPoints(values);
  const ratio = hp.max > 0 ? Math.min(1, hp.current / hp.max) : 0;
  const value = (
    <>
      <span className="text-3xl font-semibold">{hp.current}</span>
      <span className="text-sm text-muted-foreground"> / {hp.max}</span>
      <OverrideMark fieldId="hpMax" className="text-sm" />
    </>
  );
  const valueClass = cn("flex-1 whitespace-nowrap text-center tabular-nums", compact ? "min-w-0" : "min-w-[4.5rem]");
  return (
    <div className="flex min-w-0 flex-col gap-2" data-play-hp>
      {!compact && <span className="text-xs text-muted-foreground">{t("hp.title")}</span>}
      <div className={cn("flex items-center", compact ? "gap-1" : "gap-2")}>
        <button type="button" className={ICON_BUTTON} aria-label={edit?.label ?? t("hp.damage")} disabled={!edit && (!editable || (hp.current <= 0 && hp.temp <= 0))} onClick={edit?.onClick ?? (() => write(adjustHitPoints(values, -1)))}>
          <Minus className="size-4" />
        </button>
        {edit ? (
          <button type="button" className={cn(valueClass, "rounded-lg hover:bg-muted")} aria-label={edit.label} aria-haspopup="dialog" onClick={edit.onClick} data-play-hp-value>
            {value}
          </button>
        ) : (
          <p className={valueClass} aria-label={t("hp.value", { current: hp.current, max: hp.max })} data-play-hp-value>
            {value}
          </p>
        )}
        <button type="button" className={ICON_BUTTON} aria-label={edit?.label ?? t("hp.heal")} disabled={!edit && (!editable || hp.current >= hp.max)} onClick={edit?.onClick ?? (() => write(adjustHitPoints(values, 1)))}>
          <Plus className="size-4" />
        </button>
        {!compact && <TempButton />}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={cn("h-full rounded-full", ratio > 0.5 ? "bg-emerald-500" : ratio > 0.25 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

function TempButton({ tile = false }: { tile?: boolean }) {
  const t = useTranslations("play");
  const { values, editable, write } = usePlay();
  const edit = useEditTap("hp", t("hp.title"));
  const temp = hitPoints(values).temp;
  return (
    <button
      type="button"
      disabled={!editable}
      aria-label={edit?.label ?? `${t("hp.addTemp")} (${temp})`}
      onClick={edit?.onClick ?? (() => write({ hpTemp: temp + 1 }))}
      className={cn(
        tile ? cn(TILE, "min-h-11 w-full") : "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 text-sm sm:min-h-10",
        "transition-colors hover:bg-muted disabled:hover:bg-muted/40",
      )}
    >
      {tile ? (
        <>
          <span className={TILE_LABEL}>{t("hp.temp")}</span>
          <span className="flex items-center gap-1 text-base font-semibold tabular-nums">
            {temp}
            <Plus className="size-3.5" aria-hidden="true" />
          </span>
        </>
      ) : (
        <>
          <span>{t("hp.temp")}</span>
          <span className="font-semibold tabular-nums">{temp}</span>
          <Plus className="size-3.5" aria-hidden="true" />
        </>
      )}
    </button>
  );
}

/** A vitals tile; `note` is a warning chip under the value (Speed: 「力量不足 −10」, plan-uat2 §3.3). */
function StatTile({ label, value, testId, note, target, derived }: { label: string; value: string; testId?: string; note?: string; target?: EditTarget; derived?: string }) {
  const edit = useEditTap(target ?? "hp", label);
  const content = (
    <>
      <span className={TILE_LABEL}>{label}</span>
      <span className={TILE_VALUE}>
        {value}
        {derived && <OverrideMark fieldId={derived} />}
      </span>
      {note && <span className="text-2xs text-destructive">{note}</span>}
    </>
  );
  // B-023: edit mode makes a tile with a target a button to its editor; Proficiency stays static (Q8)
  return target && edit ? (
    <button type="button" className={cn(TILE, "transition-colors hover:bg-muted")} data-play-stat={testId} aria-label={edit.label} aria-haspopup="dialog" onClick={edit.onClick}>
      {content}
    </button>
  ) : (
    <div className={TILE} data-play-stat={testId}>
      {content}
    </div>
  );
}

function InitiativeTile() {
  const t = useTranslations("play");
  const { values, schema } = usePlay();
  const open = useOpenDndEditor();
  const initiative = num(values.initiative);
  return (
    <PlayRollButton
      onEdit={() => open("initiative")}
      roll={fieldRoll(schema, "initiative")}
      data={values}
      label={t("initiative")}
      icon={false}
      aria-label={`${t("initiative")} ${signed(initiative)}`}
      className={cn(TILE, "h-auto w-full border-border bg-muted/50 font-normal")}
    >
      <span className="flex flex-col items-center gap-0.5">
        <span className={TILE_LABEL}>{t("initiative")}</span>
        <span className={cn(TILE_VALUE, "flex items-center gap-1")}>
          <D20Icon className="text-accent" />
          {signed(initiative)}
          <OverrideMark fieldId="initiative" />
        </span>
      </span>
    </PlayRollButton>
  );
}

export function HitDiceBlock() {
  const t = useTranslations("play");
  const { values, editable, update } = usePlay();
  const roll = useRollOptional();
  const edit = useEditTap("hitDice", t("hitDice.short"));
  const pools = hitDicePools(values);
  const [busy, setBusy] = useState(false);
  const use = async (faces: number) => {
    const pool = pools.find((candidate) => candidate.faces === faces);
    if (!roll || busy || !pool || pool.left <= 0) return;
    setBusy(true);
    try {
      const result = await roll.executeRoll(
        { expression: `1d${faces}+{{@mod}}`, system: "dnd5e" as RollConfig["system"] },
        { mod: num(values.conMod) },
        t("hitDice.roll"),
      );
      if (!result || !update) return;
      // The dice can take seconds: heal from the HP and spent dice at commit time, so damage or a
      // die spent elsewhere meanwhile is kept. The maximums still come from the click-time values.
      update((previous) => {
        const patch = spendPoolDie(
          { ...values, hp: previous.hp, hitDiceSpent: previous.hitDiceSpent, multiclass: previous.multiclass },
          faces,
          result.rolled,
        );
        return patch ? { ...previous, ...patch } : previous;
      });
    } finally {
      setBusy(false);
    }
  };
  const single = pools.length === 1;
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-play-hit-dice>
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span>{single ? t("hitDice.title", { faces: pools[0].faces }) : t("hitDice.short")}</span>
        <span className="font-semibold text-foreground">
          {single ? t("hitDice.left", { left: pools[0].left, max: pools[0].max }) : hitDiceSummary(pools)}
          <OverrideMark fieldId="hitDiceMax" />
        </span>
      </div>
      {single ? (
        <button
          type="button"
          disabled={!edit && (!editable || !update || !roll || pools[0].left <= 0 || busy)}
          title={!edit && pools[0].left <= 0 ? t("hitDice.none") : undefined}
          aria-label={edit?.label}
          onClick={edit?.onClick ?? (() => void use(pools[0].faces))}
          className={USE_DIE}
        >
          {t("hitDice.use")}
        </button>
      ) : (
        // Several die sizes: one button per size, so the player picks which die to spend.
        <div className="flex gap-1.5">
          {pools.map((pool) => (
            <button
              key={pool.faces}
              type="button"
              disabled={!edit && (!editable || !update || !roll || pool.left <= 0 || busy)}
              title={!edit && pool.left <= 0 ? t("hitDice.none") : undefined}
              aria-label={edit?.label}
              onClick={edit?.onClick ?? (() => void use(pool.faces))}
              data-hit-die={pool.faces}
              className={cn(USE_DIE, "flex-1")}
            >
              {`${t("hitDice.use")} d${pool.faces}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const USE_DIE =
  "min-h-11 rounded-lg border border-border bg-muted/50 px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50 disabled:hover:bg-muted/50 sm:min-h-10";

/** Several pools on one line: "d10 3/5 · d6 1/2"; one pool: "3/5". */
function hitDiceSummary(pools: HitDicePool[]): string {
  if (pools.length === 1) return `${pools[0].left}/${pools[0].max}`;
  return pools.map((pool) => `d${pool.faces} ${pool.left}/${pool.max}`).join(" · ");
}

function Pips({ field, label }: { field: "deathSuccesses" | "deathFailures"; label: string }) {
  const t = useTranslations("play");
  const { values, editable, write } = usePlay();
  const count = Math.min(3, Math.max(0, num(values[field])));
  return (
    <div className="flex items-center gap-1" role="group" aria-label={t("death.mark", { label, count })}>
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      {[0, 1, 2].map((index) => {
        const on = index < count;
        return (
          <button
            key={index}
            type="button"
            disabled={!editable}
            aria-pressed={on}
            aria-label={`${label} ${index + 1}`}
            onClick={() => write({ [field]: count === index + 1 ? index : index + 1 })}
            className="inline-flex size-8 items-center justify-center rounded-full disabled:cursor-default"
          >
            <span className={cn("size-4 rounded-full border-2", on ? (field === "deathFailures" ? "border-red-500 bg-red-500" : "border-emerald-500 bg-emerald-500") : "border-muted-foreground/60")} />
          </button>
        );
      })}
    </div>
  );
}

/** A Death Saving Throw is a d20 Test: the d20 macro, with Exhaustion's penalty as its modifier. */
const DEATH_SAVE: RollConfig = { expression: "{{#d20[@mod]}}" };

/**
 * Rolls a Death Saving Throw (A1-04): a d20, less 2 per Exhaustion level, recorded on the pips.
 * A tap rolls it at once; the d20 gesture opens advantage, a modifier and extra dice (Bless), and
 * the natural die read for a 1 or a 20 is the one kept (B-022). Shown at 0 HP; the pips stay for
 * marking by hand.
 */
function DeathSaveRoll() {
  const t = useTranslations("play");
  const locale = useLocale();
  const { values, editable, update } = usePlay();
  const roll = useRollOptional();
  const [busy, setBusy] = useState(false);
  const level = exhaustionLevel(values);
  const rollSave = async (adv: number, transformExpression?: (expression: string) => string, extraArgs?: Record<string, number>) => {
    if (busy || !roll || !update) return;
    setBusy(true);
    // The outcome toast's label loads while the dice roll.
    preloadLaterText(locale);
    try {
      const result = await roll.executeRoll(
        transformExpression ? { expression: transformExpression(DEATH_SAVE.expression) } : DEATH_SAVE,
        { mod: -2 * level },
        t("death.rollLabel"),
        { ...extraArgs, adv },
      );
      const natural = result?.rolls ? keptD20(result.rolls, adv) : undefined;
      if (!result || typeof natural !== "number") return;
      const total = result.rolled;
      // Tallies from commit time: a pip marked by hand while the dice rolled is kept.
      update((previous) => ({ ...previous, ...deathSave({ ...values, ...previous }, natural, total).patch }));
      const { outcome, patch } = deathSave(values, natural, total);
      const message = (await loadLaterText(locale))(`death.${outcome}`, { count: num(patch.deathFailures ?? patch.deathSuccesses) });
      if (outcome === "revived" || outcome === "stable" || outcome === "success") toast.success(message);
      else toast.error(message);
    } finally {
      setBusy(false);
    }
  };
  const editing = usePlayEditing();
  const open = useOpenDndEditor();
  const tRenderer = useTranslations("renderer");
  const gesture = useD20RollGesture({
    d20: true,
    rollName: t("death.rollLabel"),
    exhaustionPenalty: 2 * level,
    roll: rollSave,
    onEdit: editing ? () => open("deathSaves") : undefined,
  });
  if (!editable || !update || !roll || hitPoints(values).current > 0) return null;
  return (
    <>
      <button
        type="button"
        disabled={busy}
        {...gesture.buttonProps}
        aria-label={editing ? tRenderer("editValue", { name: t("death.title") }) : undefined}
        className="mt-1 inline-flex min-h-11 touch-manipulation select-none items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 text-sm font-medium transition-colors [-webkit-touch-callout:none] hover:bg-muted disabled:opacity-50 sm:min-h-9"
        data-play-death-roll
      >
        <D20Icon className="text-accent" />
        {t("death.roll")}
      </button>
      {gesture.dialog}
    </>
  );
}

export function DeathSaves() {
  const t = useTranslations("play");
  return (
    <div className="flex flex-col gap-0.5" data-play-death>
      <span className="text-xs text-muted-foreground">{t("death.title")}</span>
      <Pips field="deathSuccesses" label={t("death.successes")} />
      <Pips field="deathFailures" label={t("death.failures")} />
      <DeathSaveRoll />
    </div>
  );
}

export function InspirationButton({ tile = false }: { tile?: boolean }) {
  const t = useTranslations("play");
  const { values, editable, write } = usePlay();
  const on = values.heroicInspiration === true;
  return (
    <button
      type="button"
      disabled={!editable}
      aria-pressed={on}
      onClick={() => write({ heroicInspiration: !on })}
      className={cn(
        tile ? cn(TILE, "min-h-11 w-full") : "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm sm:min-h-10",
        on ? "border-accent/60 bg-accent/15 text-foreground" : "border-border bg-muted/40",
        "transition-colors hover:bg-muted disabled:hover:bg-transparent",
      )}
    >
      <Star className={cn("size-4", on ? "fill-accent text-accent" : "text-accent")} aria-hidden="true" />
      <span className={tile ? "text-xs" : undefined}>{tile ? t("inspirationShort") : t("inspiration")}</span>
    </button>
  );
}

export function RestButtons() {
  const t = useTranslations("play");
  const locale = useLocale();
  const { values, editable, write } = usePlay();
  // B-023 Q2: a rest has nothing to edit, so edit mode disables it (the layout stays)
  const editing = usePlayEditing();
  const resting = editable && !editing;
  const [confirm, setConfirm] = useState(false);
  // The confirmation's labels (lazy): the dialog opens once they have loaded.
  const [labels, setLabels] = useState<LaterText | null>(null);
  const preload = () => preloadLaterText(locale);
  const shortRest = async () => {
    const patch = shortRestPatch(values);
    const rested = Object.keys(patch).length > 0;
    if (rested) write(patch);
    const later = await loadLaterText(locale);
    if (rested) toast.success(later("rest.shortDone"));
    else toast(later("rest.shortHint"));
  };
  const askLongRest = async () => {
    const later = await loadLaterText(locale);
    setLabels(() => later);
    setConfirm(true);
  };
  const longRest = (later: LaterText) => {
    write(longRestPatch(values));
    setConfirm(false);
    toast.success(later("rest.longDone"));
  };
  const button = "min-h-11 rounded-full border border-border bg-muted/40 px-5 text-sm transition-colors hover:bg-muted disabled:opacity-50 sm:min-h-10";
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={button} disabled={!resting} onPointerDown={preload} onClick={() => void shortRest()}>
        {t("rest.short")}
      </button>
      <button type="button" className={button} disabled={!resting} onPointerDown={preload} onClick={() => void askLongRest()}>
        {t("rest.long")}
      </button>
      <AlertDialog open={confirm && labels !== null} onOpenChange={setConfirm}>
        {labels && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{labels("rest.longTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{labels("rest.longBody")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{labels("rest.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => longRest(labels)}>{t("rest.long")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  );
}

/** Desktop and wide panels: two rows across the top, as frame 05. */
export function VitalsBar() {
  const t = useTranslations("play");
  const { values } = usePlay();
  const speed = speedShown(values, useIsOverridden("currentSpeed"));
  return (
    <section className={cn(PANEL, "space-y-3 p-3")} aria-label={t("hp.title")} data-play-vitals>
      <div className="grid grid-cols-[minmax(15rem,1.3fr)_minmax(0,2.4fr)_minmax(10rem,0.9fr)_auto] items-center gap-4">
        <HitPointBlock compact={false} />
        <div className="grid grid-cols-5 gap-2 border-l border-border pl-4">
          <StatTile label={t("ac")} value={String(num(values.ac))} testId="ac" target="ac" derived="ac" />
          <InitiativeTile />
          <StatTile label={t("speed")} value={t("feet", { value: speed })} testId="speed" note={armorSlows(values) ? t("armorStr") : undefined} target="speed" derived="currentSpeed" />
          <StatTile label={t("prof")} value={signed(num(values.profBonus))} testId="prof" />
          <StatTile label={t("passive")} value={String(num(values.passivePerception))} testId="passive" target="passive" derived="passivePerception" />
        </div>
        <div className="border-l border-border pl-4">
          <HitDiceBlock />
        </div>
        <div className="border-l border-border pl-4">
          <DeathSaves />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
        <InspirationButton />
        <Conditions />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <RestButtons />
        </div>
      </div>
    </section>
  );
}

/** Phones and narrow panels: the compact card of frame 07. */
export function CompactVitals() {
  const t = useTranslations("play");
  const { values } = usePlay();
  const speed = speedShown(values, useIsOverridden("currentSpeed"));
  const hd = hitDicePools(values);
  return (
    <section className={cn(PANEL, "space-y-2 p-2.5")} aria-label={t("hp.title")} data-play-vitals>
      <div className="grid grid-cols-[minmax(0,1fr)_4.25rem_4.25rem] items-stretch gap-1.5">
        <HitPointBlock compact />
        <StatTile label={t("acShort")} value={String(num(values.ac))} testId="ac" target="ac" derived="ac" />
        <InitiativeTile />
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        <TempButton tile />
        <StatTile label={t("speed")} value={t("feet", { value: speed })} testId="speed" note={armorSlows(values) ? t("armorStr") : undefined} target="speed" derived="currentSpeed" />
        <StatTile label={t("profShort")} value={signed(num(values.profBonus))} testId="prof" />
        <StatTile label={t("hitDice.short")} value={hitDiceSummary(hd)} testId="hit-dice" target="hitDice" derived="hitDiceMax" />
        <InspirationButton tile />
      </div>
    </section>
  );
}
