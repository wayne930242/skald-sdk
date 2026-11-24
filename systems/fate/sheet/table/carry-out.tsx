"use client";

import { createElement, useId, useState } from "react";
import { useTranslations } from "next-intl";
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
import { useSheetViewer } from "@skald/sheet-sdk/modules/character/ui/renderer/viewer-context";
import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { corePorts } from "@skald/sheet-sdk/modules/systems/ui/core-ports";
import { useRollOptional } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { FateCharacterData, FateLedgerEntry } from "../../domain/character";
import { changeFatePoints, fateLedgerHas } from "../../domain/lifecycle";
import { fateRecord, readFateResources } from "../../domain/normalize";
import type { FateSettledSnapshot } from "../../table-rules/domain/view";
import { useFatePlay } from "../play/play-context";
import { MUTED, TEXT_BUTTON } from "../play/card-styles";
import { useFateCarryOut } from "./use-fate-table";

/** One carry-out per booked wallet state: the same snapshot never lands twice. */
export const fateCarryOutOperationId = (tableId: string, walletRevision: number) => `carry-out:${tableId}:${walletRevision}`;

/**
 * Write the table's booked balance into this copy's own fate points (boss decision 3: the card's
 * owner chooses to take it). Only the balance: free invokes, deferred credits, offers and receipts
 * stay at the table. Through the normal Fate setter, so the Character write-back carries it as any
 * other edit; a ledger entry records where it came from. A replay of one snapshot is a no-op.
 */
export function applyFateCarryOut(previous: FateCharacterData, snapshot: FateSettledSnapshot, tableId: string, note: string): FateCharacterData {
  const v2 = fateRecord(previous.fateV2);
  const ledger = Array.isArray(v2.ledger) ? (v2.ledger as FateLedgerEntry[]) : [];
  const operationId = fateCarryOutOperationId(tableId, snapshot.walletRevision);
  if (fateLedgerHas(ledger, operationId)) return previous;
  const { fatePoints } = readFateResources(previous);
  const result = changeFatePoints(
    { fatePoints, ledger, readOnly: false },
    { reason: "adjustment", delta: snapshot.fatePoints - fatePoints },
    { operationId, timestamp: new Date().toISOString() },
  );
  if (!result.ok) return previous;
  const entry = { ...result.ledgerEntry, note, tableCarryOut: { tableId, walletRevision: snapshot.walletRevision } };
  return { ...previous, fatePoints: result.fatePoints, fateV2: { ...v2, ledger: [...ledger, entry] } };
}

/**
 * The owner's 「帶出已入帳點數」 on a table copy: offered with no open scene, after the table was
 * deactivated, or after it was deleted, as the server's snapshot allows. A read-only session
 * host points to the full sheet rather than attempting a write.
 */
export function FateCarryOut() {
  const t = useTranslations("fatePlay.points.carry");
  const tSession = useTranslations("tables.session");
  const { editable, structural, system, update } = useFatePlay();
  const viewer = useSheetViewer();
  const Link = useHostPort(corePorts.navigationLink);
  const roll = useRollOptional();
  const characterId = roll?.characterId;
  const enabled = !structural && viewer.isOwner === true && (editable || !!roll?.isInSession);
  const { read, refresh } = useFateCarryOut(characterId, enabled);
  const [pending, setPending] = useState<FateSettledSnapshot | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const hintId = useId();
  if (!characterId || !read || read === "loading" || read.status === "none" || read.status === "error") return null;
  if (read.status === "sceneOpen") return (
    <div className="mt-2 flex flex-wrap items-center gap-2" data-fate-carry-out="sceneOpen">
      <button type="button" className={cn(TEXT_BUTTON, "disabled:opacity-50")} disabled aria-describedby={hintId}>{t("button")}</button>
      <p id={hintId} className={cn(MUTED, "text-xs")}>{t("sceneOpen")}</p>
    </div>
  );
  // a host that cannot open the full sheet shows the entry off, with the reason
  if (!editable && !Link) return (
    <div className="mt-2 flex flex-wrap items-center gap-2" data-fate-carry-out="noFullSheet">
      <button type="button" className={cn(TEXT_BUTTON, "disabled:opacity-50")} disabled aria-describedby={hintId}>{t("button")}</button>
      <p id={hintId} className={cn(MUTED, "text-xs")}>{t("noFullSheet")}</p>
    </div>
  );
  if (!editable && Link) return (
    <div className="mt-2 flex flex-wrap items-center gap-2" data-fate-carry-out="fullSheet">
      {/* the host's link component, the same one on every render */}
      {createElement(Link, {
        className: TEXT_BUTTON,
        href: `/sheets/${system.config.id}/${characterId}`,
        target: "_blank",
        rel: "noopener",
        "aria-describedby": hintId,
      }, t("button"))}
      <p id={hintId} className={cn(MUTED, "text-xs")}>{tSession("fullEditor")}</p>
    </div>
  );
  const { snapshot, tableId } = read;
  const confirm = () => {
    update((previous) => applyFateCarryOut(previous, snapshot, tableId, t("note")));
    setDone(snapshot.fatePoints);
    setPending(null);
    refresh();
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2" data-fate-carry-out="ready">
      <button type="button" className={TEXT_BUTTON} onClick={() => setPending(snapshot)}>{t("button")}</button>
      {done !== null && <span className={cn(MUTED, "text-xs")} role="status">{t("done", { points: done })}</span>}
      <AlertDialog open={pending === snapshot} onOpenChange={(open) => { if (!open) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("body", { points: snapshot.fatePoints })}</AlertDialogDescription>
          </AlertDialogHeader>
          {snapshot.tableDeleted && <p className={cn(MUTED, "text-sm")}>{t("deleted")}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction className="min-h-11" onClick={confirm}>{t("confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
