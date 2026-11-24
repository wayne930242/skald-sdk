"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Diamond } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@skald/sheet-sdk/components/ui/dialog";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { readFateHarm } from "../../domain/normalize";
import type { FateAspectRef, FateInvokeGrant, FateSceneAspect } from "../../table-rules/domain/view";
import { useFatePlay } from "../play/play-context";
import { MUTED, TEXT_BUTTON } from "../play/card-styles";
import { FATE_SHEET_DIALOG } from "../rolls/roll-options-dialog";
import { FateDiceRow, useLadderText } from "../rolls/roll-format";
import { useReturnFocus } from "../rolls/return-focus";
import type { useFateRolls } from "../rolls/use-fate-rolls";
import { fateTableAspectKey, type FateTableInvokeRequest } from "./table-rolls";

type Rolls = ReturnType<typeof useFateRolls>;
type Effect = FateTableInvokeRequest["effect"];

interface PaidOption {
  readonly key: string;
  readonly aspect: FateAspectRef;
  readonly label: string;
  readonly group: "own" | "scene" | "others";
  /** Another character's own aspect: a paid invoke may be hostile (they are owed a point at close). */
  readonly canBeHostile: boolean;
}

interface FreeOption {
  readonly key: string;
  readonly grant: FateInvokeGrant;
  readonly label: string;
}

/**
 * F6's invoke picker at an active table (plan-table F6 step 1): held free invokes and boosts from
 * the table, then paid invokes of this character's aspects and consequences, the scene's and its
 * zones' aspects, and other readable characters' aspects and consequences. Only what the table's
 * view gave this viewer is listed: no unrevealed name reaches a player. The table rechecks and pays.
 */
export function FateTableInvokeDialog({ rolls, effect: initialEffect, preselectAspectId, onClose }: {
  rolls: Rolls;
  effect: Effect;
  /** An aspect card's 援引: this character's aspect, chosen at once for a fate point. */
  preselectAspectId?: string;
  onClose: () => void;
}) {
  const t = useTranslations("fateRolls.table");
  const ti = useTranslations("fateRolls.invoke");
  const tk = useTranslations("fatePlay.aspects.kind");
  const { data, aspects } = useFatePlay();
  const ladder = useLadderText();
  const returnFocus = useReturnFocus();
  const [effect, setEffect] = useState<Effect>(initialEffect);
  const [choice, setChoice] = useState<string | null>(() => preselectAspectId && rolls.tray
    ? `character:${rolls.tray.snapshot.characterId}:${preselectAspectId}`
    : null);
  const [hostile, setHostile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const { tray, table } = rolls;
  const link = table.kind === "table" ? table.link : null;
  const view = link?.view;
  const snapshot = tray?.snapshot;
  // Other cards' aspects are read now, for this picker (F008), not on every table change.
  const loadOthers = link?.loadOthers;
  useEffect(() => { loadOthers?.(); }, [loadOthers]);

  const sceneText = useMemo(() => {
    const all: FateSceneAspect[] = [...(view?.scene?.aspects.public ?? []), ...(view?.scene?.aspects.gmOnly ?? [])];
    return new Map(all.map((aspect) => [aspect.id, aspect]));
  }, [view]);

  const own = useMemo(() => {
    if (!snapshot) return [];
    const rows = [...aspects.permanent, ...aspects.held]
      .filter((aspect) => !aspect.hidden && aspect.kind !== "boost" && aspect.text.trim() !== "")
      .map((aspect) => ({ id: aspect.id, label: aspect.text.trim() || aspect.label || tk(aspect.kind) }));
    const harm = readFateHarm(data);
    const injuries = [...Object.values(harm.consequences), ...Object.values(harm.extraMild), ...Object.values(harm.conditions)]
      .filter((injury) => injury.metadata?.injuryId && injury.text.trim() !== "")
      .map((injury) => ({ id: injury.metadata!.injuryId, label: injury.text.trim() }));
    return [...rows, ...injuries];
  }, [aspects, data, snapshot, tk]);

  if (!tray || !snapshot || tray.root.kind !== "table" || !link || !view) return null;
  const root = tray.root;
  const characterId = snapshot.characterId;

  const labelOf = (ref: FateAspectRef): string => {
    if (ref.kind === "scene") return sceneText.get(ref.sceneAspectId)?.text ?? t("unknownAspect");
    if (ref.characterId === characterId) return own.find((row) => row.id === ref.aspectId)?.label ?? t("unknownAspect");
    return link.others.find((row) => row.characterId === ref.characterId && row.aspectId === ref.aspectId)?.text ?? t("unknownAspect");
  };

  const grants = [...(view.scene?.grants.public ?? []), ...(view.scene?.grants.gmOnly ?? [])];
  const free: FreeOption[] = grants
    .filter((grant) => grant.canUse && grant.remaining > 0
      && (grant.holder.kind === "gm" ? link.isGmRunner : grant.holder.kind === "character" && grant.holder.characterId === characterId))
    .map((grant) => ({ key: `grant:${grant.id}`, grant, label: labelOf(grant.aspect) }));

  const paid: PaidOption[] = [
    ...own.map((row) => {
      const aspect: FateAspectRef = { kind: "character", characterId, aspectId: row.id };
      return { key: fateTableAspectKey(aspect), aspect, label: row.label, group: "own" as const, canBeHostile: false };
    }),
    ...[...sceneText.values()].filter((aspect) => aspect.kind === "situation").map((aspect) => {
      const ref: FateAspectRef = { kind: "scene", sceneAspectId: aspect.id };
      return { key: fateTableAspectKey(ref), aspect: ref, label: aspect.text, group: "scene" as const, canBeHostile: false };
    }),
    ...link.others.map((row) => {
      const ref: FateAspectRef = { kind: "character", characterId: row.characterId, aspectId: row.aspectId };
      return { key: fateTableAspectKey(ref), aspect: ref, label: t("othersAspect", { name: row.characterName, text: row.text }), group: "others" as const, canBeHostile: true };
    }),
  ];

  // Who pays a fate point: the PC's own wallet when the viewer plays it, else the GM pool.
  const wallet = table.kind === "table" && table.wallet?.canOperate ? table.wallet : undefined;
  const pool = !wallet && link.isGmRunner ? view.gm?.pool ?? undefined : undefined;
  const payer = wallet ? { source: "wallet" as const, count: wallet.value } : pool ? { source: "pool" as const, count: pool.value } : null;
  const paidKeys = new Set(snapshot.modifiers.filter((m) => m.kind === "invoke" && m.payment === "paid").map((m) => (m.kind === "invoke" ? m.aspectId : "")));
  const paidRefusal = (option: PaidOption) => {
    if (!payer) return t("noPayer");
    if (paidKeys.has(option.key)) return t("paidRepeat");
    if (payer.count < 1) return t("noPoints");
    return null;
  };

  const selectedFree = free.find((option) => option.key === choice);
  const selectedPaid = paid.find((option) => option.key === choice);
  const canConfirm = !!(selectedFree || (selectedPaid && !paidRefusal(selectedPaid))) && !rolls.busy && !rolls.structural;

  const confirm = async () => {
    if (submitting.current || (!selectedFree && !selectedPaid)) return;
    submitting.current = true;
    setError(null);
    const request: FateTableInvokeRequest = selectedFree
      ? {
        effect, source: "grant", grantId: selectedFree.grant.id, aspectKey: fateTableAspectKey(selectedFree.grant.aspect),
        isBoost: selectedFree.grant.isBoost, label: selectedFree.label,
      }
      : {
        effect, source: payer!.source, aspect: selectedPaid!.aspect, hostile: selectedPaid!.canBeHostile && hostile,
        aspectKey: selectedPaid!.key, label: selectedPaid!.label,
      };
    const outcome = await rolls.invokeAtTable(request);
    submitting.current = false;
    if (outcome.ok) onClose();
    else setError(t(`failure.${outcome.reason}`));
  };

  const radio = (key: string, body: ReactNode, refusal: string | null, extra?: ReactNode) => (
    <li key={key}>
      <label className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2",
        choice === key && "border-accent bg-accent/15",
        refusal && "cursor-not-allowed opacity-60",
      )}>
        <input
          type="radio"
          name="fate-table-invoke"
          className="size-4 accent-[var(--color-accent)]"
          checked={choice === key}
          disabled={!!refusal}
          onChange={() => { setChoice(key); setHostile(false); }}
        />
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          {body}
          {refusal && <span className="block text-xs text-muted-foreground">{refusal}</span>}
        </span>
        {extra}
      </label>
    </li>
  );

  const group = (name: PaidOption["group"]) => paid.filter((option) => option.group === name);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn(FATE_SHEET_DIALOG, "sm:max-w-3xl")} data-fate-table-invoke onCloseAutoFocus={returnFocus}>
        <DialogHeader className="text-left">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="min-w-0 space-y-3" role="radiogroup" aria-label={t("title")}>
            <section aria-label={t("free")}>
              <h3 className="mb-1 text-sm font-medium text-accent">{t("free")}</h3>
              {free.length === 0 ? <p className={MUTED}>{ti("noFree")}</p> : (
                <ul className="space-y-1.5">
                  {free.map((option) => radio(option.key, (
                    <>
                      <span className="block font-medium">{option.label}</span>
                      <span className={cn(MUTED, "block text-xs")}>{option.grant.isBoost ? t("boost") : t("remaining", { count: option.grant.remaining })}</span>
                    </>
                  ), null, (
                    <span className="inline-flex items-center gap-0.5 text-sm tabular-nums text-accent" aria-hidden>
                      <Diamond className={cn("size-3.5", option.grant.isBoost && "fill-current")} />
                      {option.grant.remaining}
                    </span>
                  )))}
                </ul>
              )}
            </section>
            <section aria-label={t("paid")}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">{t("paid")}</h3>
                <span className={cn(MUTED, "text-xs")} data-fate-table-payer={payer?.source ?? "none"}>
                  {payer ? t(payer.source === "wallet" ? "payerWallet" : "payerPool", { count: payer.count }) : t("noPayer")}
                </span>
              </div>
              {(["own", "scene", "others"] as const).map((name) => group(name).length > 0 && (
                <div key={name} className="mb-2">
                  <p className={cn(MUTED, "mb-1 text-xs")}>{t(`group.${name}`)}</p>
                  <ul className="space-y-1.5">
                    {group(name).map((option) => radio(option.key, <span>{option.label}</span>, paidRefusal(option)))}
                  </ul>
                </div>
              ))}
            </section>
          </div>
          <div className="min-w-0 space-y-3">
            <section className="rounded-lg border border-border p-3" aria-label={ti("original")}>
              <FateDiceRow faces={snapshot.faces} size="sm" className="my-2" />
              <p className="text-sm">{ti("opposition", { opposition: ladder(snapshot.opposition) })}</p>
            </section>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={ti("effect")}>
              {(["plus2", "reroll"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={effect === value}
                  onClick={() => setEffect(value)}
                  className={cn(TEXT_BUTTON, effect === value && "border-accent bg-accent/15 font-semibold text-accent")}
                >
                  {ti(`effects.${value}`)}
                </button>
              ))}
            </div>
            {selectedPaid?.canBeHostile && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 size-4" checked={hostile} onChange={(event) => setHostile(event.target.checked)} data-fate-table-hostile />
                <span>{t("hostile")}</span>
              </label>
            )}
            {root.audience === "gm" && <p className={cn(MUTED, "text-xs")} data-fate-table-gm-audience>{t("gmAudience")}</p>}
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className={cn(MUTED, "text-xs")}>{t("note")}</p>
          <div className="flex gap-2">
            <button type="button" className={cn(TEXT_BUTTON, "min-w-24")} onClick={onClose}>{ti("cancel")}</button>
            <button
              type="button"
              className={cn(TEXT_BUTTON, "min-w-28 border-accent bg-accent text-accent-foreground hover:bg-accent/90")}
              disabled={!canConfirm}
              onClick={() => void confirm()}
            >
              {ti("confirm")}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
