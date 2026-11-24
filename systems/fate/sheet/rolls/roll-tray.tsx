"use client";

import { Suspense, useState } from "react";
import { BookOpen } from "lucide-react";
import { nanoid } from "nanoid";
import { useTranslations } from "next-intl";
import { InfoTip } from "@skald/sheet-sdk/components/ui/info-tip";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { FateInvokeRequest } from "../../domain/invoke";
import { readFateStunts } from "../../domain/normalize";
import type { FateOutcome, FateOutcomeOffer, FateRollModifier } from "../../domain/roll";
import { sheetRuleTargets } from "../../reference/rule-ids";
import { useFatePlay } from "../play/play-context";
import { CARD_HEAD, CARD_TITLE, ICON_BUTTON, MUTED, TEXT_BUTTON } from "../play/card-styles";
import { signed } from "../play/skill-ladder";
import { FateInvokeDialog } from "./invoke-dialog";
import { FateTableInvokeDialog } from "../table/table-invoke-dialog";
import { FateDiceRow, OUTCOME_TONE, useLadderText, useOutcomeText } from "./roll-format";
import { FateRollMessages } from "./roll-messages";
import type { FateRollRevision } from "./roll-store";
import { useFateRolls } from "./use-fate-rolls";

const OUTCOME_RULE: Record<FateOutcome, (typeof sheetRuleTargets)[keyof typeof sheetRuleTargets]> = {
  fail: sheetRuleTargets.failure,
  tie: sheetRuleTargets.tie,
  success: sheetRuleTargets.success,
  style: sheetRuleTargets.successWithStyle,
};

const BOOST_OFFERS = new Set<FateOutcomeOffer["id"]>(["boost", "failWithBoost", "successWithBoost", "armorBoost", "hitWithBoost"]);
const isClaimable = (offer: FateOutcomeOffer) => BOOST_OFFERS.has(offer.id) || offer.id === "freeInvokes";

type Rolls = ReturnType<typeof useFateRolls>;

function useAspectName() {
  const t = useTranslations("fateRolls.tray");
  const tk = useTranslations("fatePlay.aspects.kind");
  const { aspects } = useFatePlay();
  return (aspectId: string) => {
    const aspect = [...aspects.permanent, ...aspects.held].find((row) => row.id === aspectId);
    if (!aspect) return t("goneAspect");
    if (aspect.hidden) return t("hiddenAspect");
    return aspect.text.trim() || aspect.label || tk(aspect.kind);
  };
}

function Modifier({ modifier, labels }: { modifier: FateRollModifier; labels?: Readonly<Record<string, string>> }) {
  const t = useTranslations("fateRolls.tray.modifier");
  const { data } = useFatePlay();
  const ownName = useAspectName();
  // A table invoke names its aspect by key; the tray kept what the viewer saw when choosing it.
  const aspectName = (aspectId: string) => labels?.[aspectId] ?? ownName(aspectId);
  if (modifier.kind === "stunt") {
    const stunt = readFateStunts(data).find((row) => row.id === modifier.stuntId);
    return <li>{t("stunt", { name: stunt?.title || stunt?.quality || stunt?.customText || t("stuntFallback"), value: signed(modifier.value) })}</li>;
  }
  if (modifier.kind === "scale") return <li>{t("scale", { value: signed(modifier.value) })}</li>;
  return <li>{t(`invoke.${modifier.effect}`, { aspect: aspectName(modifier.aspectId), payment: t(`payment.${modifier.payment}`) })}</li>;
}

function Revision({ revision, latest, settled, rolls, atTable }: { revision: FateRollRevision; latest: boolean; settled: boolean; rolls: Rolls; atTable: boolean }) {
  const t = useTranslations("fateRolls.delivery");
  const tt = useTranslations("fateRolls.table");
  return (
    <li className="flex flex-wrap items-center justify-between gap-2" data-fate-revision={revision.operationId} data-status={revision.status}>
      <span>{atTable ? tt("revisionPosted") : t(revision.status)}</span>
      {latest && !settled && revision.status === "rejected" && rolls.editable && !rolls.structural && (
        <button type="button" className={TEXT_BUTTON} disabled={rolls.busy} onClick={() => rolls.reverse(revision.operationId)}>
          {t("reverse")}
        </button>
      )}
    </li>
  );
}

function Claim({ offer, rolls }: { offer: FateOutcomeOffer; rolls: Rolls }) {
  const t = useTranslations("fateRolls.claim");
  const tk = useTranslations("fatePlay.aspects.kind");
  const { aspects } = useFatePlay();
  const aspectName = useAspectName();
  const needsNew = BOOST_OFFERS.has(offer.id) || (offer.id === "freeInvokes" && offer.newAspect === true);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const targets = [...aspects.permanent, ...aspects.held].filter((aspect) => aspect.kind !== "boost");
  const [aspectId, setAspectId] = useState(targets[0]?.id ?? "");
  if (!open) {
    return (
      <button type="button" className={TEXT_BUTTON} onClick={() => setOpen(true)}>
        {BOOST_OFFERS.has(offer.id) ? t("takeBoost") : t("takeInvokes", { count: offer.id === "freeInvokes" ? offer.freeInvokes : 0 })}
      </button>
    );
  }
  const confirm = () => {
    // The new row's ID is made here, outside the updater, so the command is a stable replay.
    const done = needsNew
      ? rolls.claim(offer.id, { kind: "new", aspectId: nanoid(), text: text.trim() })
      : rolls.claim(offer.id, { kind: "existing", aspectId });
    if (done) setOpen(false);
  };
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border p-2" data-fate-claim>
      {needsNew ? (
        <label className="grid gap-1 text-sm">
          <span>{BOOST_OFFERS.has(offer.id) ? t("boostText") : t("aspectText")}</span>
          <input className="h-11 rounded-md border border-input bg-background px-2 @3xl:h-9" value={text} onChange={(event) => setText(event.target.value)} />
        </label>
      ) : (
        <label className="grid gap-1 text-sm">
          <span>{t("which")}</span>
          <select className="h-11 rounded-md border border-input bg-background px-2 @3xl:h-9" value={aspectId} onChange={(event) => setAspectId(event.target.value)}>
            {targets.map((aspect) => <option key={aspect.id} value={aspect.id}>{t("option", { kind: tk(aspect.kind), name: aspectName(aspect.id) })}</option>)}
          </select>
        </label>
      )}
      <div className="flex gap-2">
        <button type="button" className={TEXT_BUTTON} onClick={() => setOpen(false)}>{t("cancel")}</button>
        <button type="button" className={cn(TEXT_BUTTON, "border-accent text-accent")} disabled={needsNew ? !text.trim() : !aspectId} onClick={confirm}>{t("confirm")}</button>
      </div>
    </div>
  );
}

function Tray() {
  const t = useTranslations("fateRolls.tray");
  const ta = useTranslations("fateRolls.action");
  const to = useTranslations("fateRolls.offers");
  const tt = useTranslations("fateRolls.table");
  const { openRules, structural } = useFatePlay();
  const rolls = useFateRolls();
  const ladder = useLadderText();
  const outcomeText = useOutcomeText();
  const [picker, setPicker] = useState<FateInvokeRequest["effect"] | null>(null);
  const { tray, result } = rolls;

  const header = (
    <div className={CARD_HEAD}>
      <span className="inline-flex items-center gap-1">
        <h2 className={CARD_TITLE}>{t("title")}</h2>
        <button type="button" onClick={() => openRules(sheetRuleTargets.outcomes)} aria-label={t("rules")} className={ICON_BUTTON}>
          <BookOpen className="size-4" aria-hidden />
        </button>
      </span>
      {tray && <span className={MUTED}>{t("last", { skill: tray.skillLabel, rating: signed(tray.snapshot.rating) })}</span>}
    </div>
  );

  const rootPending = rolls.tableRootPending;
  const failure = (rolls.tableFailure || rootPending) && (
    <div className="mt-2 space-y-1">
      {rolls.tableFailure && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400" data-fate-table-failure={rolls.tableFailure}>
          {tt(`failure.${rolls.tableFailure}`)}
        </p>
      )}
      {rootPending && (
        <div className="flex flex-wrap items-center gap-2" data-fate-table-root-pending>
          <p className="w-full text-xs text-muted-foreground">{tt("rootPending")}</p>
          {/* The roll waits (busy) on these: they stay usable while it does. */}
          <button type="button" className={TEXT_BUTTON} onClick={() => void rootPending.resend()} data-fate-table-root-confirm>{tt("rootConfirm")}</button>
          <button type="button" className={TEXT_BUTTON} onClick={rootPending.abandon} data-fate-table-root-abandon>{tt("rootAbandon")}</button>
        </div>
      )}
    </div>
  );

  if (!tray || !result) {
    return (
      <div data-fate-roll-tray data-empty>
        {header}
        <p className={MUTED}>
          {rolls.canRoll ? t("empty") : t("noRoller")}
          {rolls.canRoll && (
            <>
              <span className="text-xs"> {t("gestures")}</span>
              <InfoTip label={t("helpLabel")} className="align-middle">{t("help")}</InfoTip>
            </>
          )}
        </p>
        {failure}
      </div>
    );
  }

  const { snapshot } = tray;
  const mode = rolls.deliveryMode;
  const atTable = mode?.mode === "table";
  const canInvoke = !structural && rolls.editable && !tray.settled && !rolls.busy
    && (!atTable || (rolls.table.kind === "table" && !tray.tablePending));
  const lastRevision = tray.revisions.at(-1);
  const canClaim = !atTable && rolls.table.kind === "v2" && !structural && rolls.editable && !tray.settled && lastRevision?.status !== "rejected" && lastRevision?.status !== "pending";
  return (
    <div data-fate-roll-tray data-root={snapshot.rootRollId}>
      {header}
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 @2xl:grid-cols-[auto_minmax(0,1fr)_auto]">
        <div className="flex min-w-0 items-center rounded-lg border border-border bg-muted/30 px-2 py-1.5 @lg:px-3 @lg:py-2">
          <FateDiceRow faces={snapshot.faces} size="fit" />
        </div>
        <div className="grid min-w-0 gap-x-3 gap-y-0.5 @lg:grid-cols-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 @lg:block">
            <p className={cn(MUTED, "text-xs")}>{t("total")}</p>
            <p className="font-display text-xl text-accent @lg:text-2xl" data-fate-total={result.total}>{ladder(result.total)}</p>
            {result.ladder.beyond && <p className={cn(MUTED, "text-xs")}>{t(`beyond.${result.ladder.beyond}`)}</p>}
          </div>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 @lg:block">
            <p className={cn(MUTED, "text-xs")}>{t("opposition", { opposition: ladder(snapshot.opposition) })}</p>
            <p className={cn("text-base font-semibold @lg:text-lg", OUTCOME_TONE[result.outcome])} data-fate-outcome={result.outcome}>
              {outcomeText(result.outcome, result.shifts)}
            </p>
            <p className={cn(MUTED, "text-xs")}>{ta(snapshot.action)}</p>
          </div>
        </div>
        <div className="col-span-2 grid min-w-0 grid-cols-2 gap-2 @2xl:col-span-1 @2xl:flex @2xl:w-44 @2xl:flex-col">
          <button
            type="button"
            className={cn(TEXT_BUTTON, "border-accent bg-accent text-accent-foreground hover:bg-accent/90")}
            disabled={!canInvoke}
            onClick={() => setPicker("plus2")}
          >
            {t("invokePlus2")}
          </button>
          <button type="button" className={TEXT_BUTTON} disabled={!canInvoke} onClick={() => setPicker("reroll")}>
            {t("invokeReroll")}
          </button>
        </div>
      </div>

      {snapshot.modifiers.length > 0 && (
        <ul className={cn(MUTED, "mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs")} aria-label={t("modifiers")}>
          {snapshot.modifiers.map((modifier, index) => <Modifier key={index} modifier={modifier} labels={tray.tableLabels} />)}
        </ul>
      )}
      {tray.pendingScale && !snapshot.scale && <p className={cn(MUTED, "mt-1 text-xs")}>{t("scalePending")}</p>}
      {tray.tableScaleSkipped && <p className={cn(MUTED, "mt-1 text-xs")} data-fate-table-scale-skipped>{tt("scaleSkipped")}</p>}

      <ul className="mt-2 space-y-1 text-sm" aria-label={t("offers")} data-fate-offers>
        {result.offers.map((offer, index) => (
          <li key={`${offer.id}-${index}`} className="flex flex-wrap items-center gap-2">
            <span>{to(offer.id, { count: offer.id === "freeInvokes" ? offer.freeInvokes : 0, shifts: "shifts" in offer ? offer.shifts : 0 })}</span>
            {canClaim && isClaimable(offer) && <Claim offer={offer} rolls={rolls} />}
          </li>
        ))}
        <li>
          <button type="button" className={cn(MUTED, "underline underline-offset-2")} onClick={() => openRules(OUTCOME_RULE[result.outcome])}>
            {t("outcomeHelp", { outcome: outcomeText(result.outcome, result.shifts) })}
          </button>{" "}
          <button type="button" className={cn(MUTED, "underline underline-offset-2")} onClick={() => openRules(sheetRuleTargets[snapshot.action])}>
            {t("actionHelp", { action: ta(snapshot.action) })}
          </button>
        </li>
      </ul>

      {tray.settled && <p className={cn(MUTED, "mt-2 text-xs")}>{t("settled")}</p>}
      {!rolls.editable && <p className={cn(MUTED, "mt-2 text-xs")}>{t("readOnly")}</p>}
      {rolls.editable && structural && <p className={cn(MUTED, "mt-2 text-xs")} data-fate-play-only>{t("playOnly")}</p>}

      {atTable && <p className={cn(MUTED, "mt-2 text-xs")} data-fate-table-no-claim>{tt("noClaim")}</p>}

      <div className="mt-2 space-y-1 text-xs text-muted-foreground" data-fate-delivery={mode?.mode ?? "none"}>
        <p>{atTable ? tt("delivery") : mode?.mode === "chat" ? t("deliveryChat") : mode?.mode === "local" ? t("deliveryLocal") : t(`deliveryBlocked.${mode?.mode === "blocked" ? mode.reason : "notPosted"}`)}</p>
        {mode?.mode === "chat" && <p>{t("nonAtomic")}</p>}
        {tray.revisions.length > 0 && (
          <ol className="space-y-1">
            {tray.revisions.map((revision) => (
              <Revision key={revision.operationId} revision={revision} latest={revision === lastRevision} settled={tray.settled} rolls={rolls} atTable={atTable} />
            ))}
          </ol>
        )}
      </div>
      {failure}
      {atTable && tray.tablePending && (
        <button type="button" className={cn(TEXT_BUTTON, "mt-2")} disabled={rolls.busy} onClick={() => void rolls.confirmAtTable()} data-fate-table-confirm>
          {tt("confirmAgain")}
        </button>
      )}

      {picker && (atTable
        ? <FateTableInvokeDialog rolls={rolls} effect={picker} onClose={() => setPicker(null)} />
        : <FateInvokeDialog rolls={rolls} effect={picker} onClose={() => setPicker(null)} />)}
    </div>
  );
}

/**
 * The dice tray (slot `rollTray`, frame 03): the last roll's faces, total on the ladder, the
 * opposition, shifts and the outcome's offers, with invoke (+2 or reroll) and the delivery state
 * of each invoke. A roll belongs to the character it was made on.
 */
export function FateRollTray() {
  return (
    <Suspense fallback={null}>
      <FateRollMessages>
        <Tray />
      </FateRollMessages>
    </Suspense>
  );
}
