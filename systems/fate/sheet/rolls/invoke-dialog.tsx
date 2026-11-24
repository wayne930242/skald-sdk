"use client";

import { useRef, useState } from "react";
import { BookOpen, Diamond } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@skald/sheet-sdk/components/ui/dialog";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { checkFateInvoke, FATE_INVOKE_BONUS, type FateInvokeRequest } from "../../domain/invoke";
import { readFateAspects, readFateResources } from "../../domain/normalize";
import { gradeFateRoll } from "../../domain/roll";
import { sheetRuleTargets } from "../../reference/rule-ids";
import { useFatePlay } from "../play/play-context";
import type { FatePlayAspect } from "../play/play-model";
import { ICON_BUTTON, MUTED, TEXT_BUTTON } from "../play/card-styles";
import { FateToken } from "../play/fate-points";
import { signed } from "../play/skill-ladder";
import { FATE_SHEET_DIALOG } from "./roll-options-dialog";
import { FateDiceRow, OUTCOME_TONE, useLadderText, useOutcomeText } from "./roll-format";
import type { useFateRolls } from "./use-fate-rolls";
import { useReturnFocus } from "./return-focus";

type Rolls = ReturnType<typeof useFateRolls>;
type Choice = { aspectId: string; payment: "free" | "paid" };

function aspectName(aspect: FatePlayAspect, kindLabel: string, hiddenLabel: string) {
  return aspect.hidden ? hiddenLabel : aspect.text.trim() || aspect.label || kindLabel;
}

/**
 * The invoke picker (frames 09 and 16): free uses first, then this character's own aspects for a
 * fate point; +2 keeps the faces, a reroll throws four new dice. Nothing is spent until "confirm",
 * which rechecks the current record; the lock keeps a double tap from paying twice.
 */
export function FateInvokeDialog({ rolls, effect: initialEffect, preselect, onClose }: {
  rolls: Rolls;
  effect: FateInvokeRequest["effect"];
  /** An aspect card's 援引: choose this aspect at once (its free invoke first, else a fate point). */
  preselect?: string;
  onClose: () => void;
}) {
  const t = useTranslations("fateRolls.invoke");
  const tk = useTranslations("fatePlay.aspects.kind");
  const ta = useTranslations("fateRolls.action");
  const { data, aspects, openRules } = useFatePlay();
  const ladder = useLadderText();
  const outcomeText = useOutcomeText();
  const [choice, setChoice] = useState<Choice | null>(() => {
    const aspect = [...aspects.permanent, ...aspects.held].find((row) => row.id === preselect);
    const current = rolls.tray;
    if (!aspect || !current) return null;
    const availability = { readOnly: !rolls.editable, characterId: current.snapshot.characterId, fatePoints: readFateResources(data).fatePoints, aspects: readFateAspects(data).rows };
    const payments: Choice["payment"][] = aspect.freeInvokes > 0 ? ["free", "paid"] : ["paid"];
    const payment = payments.find((option) => checkFateInvoke(current.snapshot, { aspectId: aspect.id, payment: option, effect: initialEffect }, availability).ok);
    return payment ? { aspectId: aspect.id, payment } : null;
  });
  const [effect, setEffect] = useState(initialEffect);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const returnFocus = useReturnFocus();
  const { tray, result } = rolls;
  if (!tray || !result) return null;
  const snapshot = tray.snapshot;
  const mode = rolls.deliveryMode;

  const { rows } = readFateAspects(data);
  const { fatePoints } = readFateResources(data);
  const availability = { readOnly: !rolls.editable, characterId: snapshot.characterId, fatePoints, aspects: rows };
  // A blank card is nothing to invoke; a face-down secret one is a real aspect without its text.
  const all = [...aspects.permanent, ...aspects.held].filter((aspect) => aspect.hidden || aspect.text.trim() !== "");
  const free = all.filter((aspect) => aspect.freeInvokes > 0);
  const paid = all.filter((aspect) => aspect.kind !== "boost");
  const verdict = (option: Choice) => checkFateInvoke(snapshot, { ...option, effect }, availability);
  const chosen = choice ? verdict(choice) : null;
  const blocked = mode?.mode === "blocked";
  // Edit mode (B-023): a picker opened in play stays open but confirms only back in play.
  const playOnly = rolls.editable && rolls.structural;
  const canConfirm = !!choice && chosen?.ok === true && !blocked && !rolls.busy && rolls.editable && !playOnly;

  const plus2 = gradeFateRoll(result.total + FATE_INVOKE_BONUS, snapshot.opposition);
  const chosenAspect = choice ? all.find((aspect) => aspect.id === choice.aspectId) : undefined;

  const confirm = async () => {
    // A second tap while the first is in flight does nothing (the store lock also refuses it).
    if (!choice || submitting.current) return;
    submitting.current = true;
    setError(null);
    const outcome = await rolls.invoke({ ...choice, effect });
    submitting.current = false;
    if (outcome.ok) onClose();
    else setError(t(`refusal.${outcome.reason}`));
  };

  const option = (aspect: FatePlayAspect, payment: Choice["payment"]) => {
    const value = { aspectId: aspect.id, payment };
    const check = verdict(value);
    const selected = choice?.aspectId === aspect.id && choice.payment === payment;
    const kind = tk(aspect.kind);
    return (
      <li key={`${payment}:${aspect.id}`}>
        <label
          className={cn(
            "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2",
            selected && "border-accent bg-accent/15",
            !check.ok && "cursor-not-allowed opacity-60",
          )}
        >
          <input
            type="radio"
            name="fate-invoke"
            className="size-4 accent-[var(--color-accent)]"
            checked={selected}
            disabled={!check.ok}
            onChange={() => setChoice(value)}
          />
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            {payment === "free" ? (
              <>
                <span className="block font-medium">{aspectName(aspect, kind, t("hidden"))}</span>
                <span className={cn(MUTED, "block text-xs")}>{aspect.kind === "boost" ? t("boostNote") : kind}</span>
              </>
            ) : (
              <span className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-xs text-muted-foreground">{kind}</span>
                <span>{aspectName(aspect, kind, t("hidden"))}</span>
              </span>
            )}
            {!check.ok && <span className="block text-xs text-muted-foreground">{t(`refusal.${check.reason}`)}</span>}
          </span>
          {payment === "free" && (
            <span className="inline-flex items-center gap-0.5 text-sm tabular-nums text-accent" aria-label={t("freeCount", { count: aspect.freeInvokes })}>
              <Diamond className={cn("size-3.5", aspect.kind === "boost" && "fill-current")} aria-hidden />
              {aspect.freeInvokes}
            </span>
          )}
        </label>
      </li>
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn(FATE_SHEET_DIALOG, "sm:max-w-3xl")} data-fate-invoke-dialog onCloseAutoFocus={returnFocus}>
        <DialogHeader className="text-left">
          <DialogTitle className="inline-flex items-center gap-1">
            {t("title")}
            <button type="button" className={ICON_BUTTON} aria-label={t("rules")} onClick={() => openRules(sheetRuleTargets.rollInvoke)}>
              <BookOpen className="size-4" aria-hidden />
            </button>
          </DialogTitle>
          <DialogDescription>{t("subtitle", { action: ta(snapshot.action) })}</DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="min-w-0 space-y-3" role="radiogroup" aria-label={t("title")}>
            <section aria-label={t("free")}>
              <h3 className="mb-1 text-sm font-medium text-accent">{t("free")}</h3>
              {free.length === 0 ? <p className={MUTED}>{t("noFree")}</p> : <ul className="space-y-1.5">{free.map((aspect) => option(aspect, "free"))}</ul>}
            </section>
            <section aria-label={t("paid")}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">{t("paid")}</h3>
                <span className={cn(MUTED, "text-xs")}>{t("paidCost")}</span>
              </div>
              {paid.length === 0 ? <p className={MUTED}>{t("noAspects")}</p> : <ul className="space-y-1.5">{paid.map((aspect) => option(aspect, "paid"))}</ul>}
            </section>
          </div>

          <div className="min-w-0 space-y-3">
            <section className="rounded-lg border border-border p-3" aria-label={t("original")}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span>{t("originalLine", { skill: tray.skillLabel, rating: signed(snapshot.rating) })}</span>
                <span className={OUTCOME_TONE[result.outcome]}>{outcomeText(result.outcome, result.shifts)}</span>
              </div>
              <FateDiceRow faces={snapshot.faces} size="sm" className="my-2" />
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{t("total", { total: ladder(result.total) })}</span>
                <span className="text-muted-foreground">{t("opposition", { opposition: ladder(snapshot.opposition) })}</span>
              </div>
            </section>

            <div className="space-y-1">
              <span className="text-sm font-medium">{t("effect")}</span>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("effect")}>
                {(["plus2", "reroll"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={effect === value}
                    onClick={() => setEffect(value)}
                    className={cn(TEXT_BUTTON, effect === value && "border-accent bg-accent/15 font-semibold text-accent")}
                  >
                    {t(`effects.${value}`)}
                  </button>
                ))}
              </div>
            </div>

            {choice && chosenAspect && (
              <p className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm" data-fate-invoke-cost>
                {choice.payment === "paid" ? (
                  <>
                    <FateToken />
                    <span>{t("costPaid", { from: fatePoints, to: fatePoints - 1 })}</span>
                  </>
                ) : (
                  <span>{chosenAspect.kind === "boost" ? t("costBoost") : t("costFree", { from: chosenAspect.freeInvokes, to: chosenAspect.freeInvokes - 1 })}</span>
                )}
              </p>
            )}

            <section className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3" aria-label={t("preview")} data-fate-invoke-preview>
              <p className="text-xs font-medium text-muted-foreground">{t("preview")}</p>
              {effect === "plus2" ? (
                <>
                  <p className="font-display text-xl">{t("plus2Line", { total: signed(result.total), bonus: FATE_INVOKE_BONUS, after: ladder(result.total + FATE_INVOKE_BONUS) })}</p>
                  <p className={OUTCOME_TONE[plus2.outcome]}>{outcomeText(plus2.outcome, plus2.shifts)}</p>
                </>
              ) : (
                <p className="text-sm">{t("rerollLine")}</p>
              )}
            </section>
          </div>
        </div>

        {blocked && mode?.mode === "blocked" && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm" data-fate-invoke-blocked>
            <p>{t(`blocked.${mode.reason}`)}</p>
            <button type="button" className={cn(TEXT_BUTTON, "mt-2")} onClick={rolls.keepLocal}>{t("keepLocal")}</button>
          </div>
        )}
        {playOnly && <p className="text-sm text-muted-foreground" data-fate-play-only>{t("playOnly")}</p>}
        {error && !playOnly && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className={cn(MUTED, "text-xs")}>
            {mode?.mode === "chat" ? t("noteChat") : t("noteLocal")} {t("noteNothingYet")}
          </p>
          <div className="flex gap-2">
            <button type="button" className={cn(TEXT_BUTTON, "min-w-24")} onClick={onClose}>{t("cancel")}</button>
            <button
              type="button"
              className={cn(TEXT_BUTTON, "min-w-28 border-accent bg-accent text-accent-foreground hover:bg-accent/90")}
              disabled={!canConfirm}
              aria-disabled={!canConfirm}
              onClick={() => void confirm()}
            >
              {mode?.mode === "chat" ? t("confirm") : t("confirmLocal")}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
