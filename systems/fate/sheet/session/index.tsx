"use client";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ScrollText } from "lucide-react";
import { InfoTip } from "@skald/sheet-sdk/components/ui/info-tip";
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
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@skald/sheet-sdk/components/ui/dialog";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { fateRecord, readFateResources, readFateHarm } from "../../domain/normalize";
import { ASPECT_ACTION, ICON_BUTTON, TEXT_BUTTON } from "../play/card-styles";
import { useFatePlay } from "../play/play-context";
import { signed } from "../play/skill-ladder";
import type { FateAspectActionProps } from "../play/slots";
import {
  newOperation,
  pointChange,
  reminders,
  sessionState,
  transition,
  type PointAction,
} from "./commands";
import { useSessionLabels } from "./labels";
import { useFateTableMode } from "../table/use-fate-table";
const Milestone = lazy(() =>
  import("./milestone-form").then((m) => ({ default: m.MilestoneForm })),
);
type Boundary = "session" | "scene";
function Panel() {
  const t = useSessionLabels(),
    { data, editable: writable, structural, update, aspects } = useFatePlay();
  // B-023: boundaries, compels and adjustments record play, so edit mode leaves them inert;
  // a milestone changes the character, so it stays an edit.
  const editable = writable && !structural;
  // Plan-r2 T3: at an active table its wallet is the balance; the card records no point of its own
  // (a session's refresh, a compel, an adjustment). Ending a scene only clears this card's stress.
  const tableOwns = useFateTableMode().kind !== "v2";
  const pointsEditable = editable && !tableOwns;
  const [open, setOpen] = useState(false),
    [confirm, setConfirm] = useState<Boundary | null>(null),
    [milestone, setMilestone] = useState<"minor" | "major" | null>(null),
    [amount, setAmount] = useState(""),
    [note, setNote] = useState("");
  const state = sessionState(data),
    r = readFateResources(data),
    harm = readFateHarm(data);
  function boundary(kind: Boundary) {
    if (!editable || (kind === "session" && !pointsEditable)) return;
    const ctx = newOperation(),
      previous = state[kind]?.id;
    // `transition` compares the card's own boundary with the one shown, so a stale click is a
    // no-op; the runtime hands the updater its working copy, not necessarily this render's object.
    update((card) => transition(card, kind, previous, ctx, editable));
    setConfirm(null);
  }
  function change(action: PointAction) {
    if (!pointsEditable) return;
    const ctx = newOperation();
    update((card) => pointChange(card, action, Number(amount), note, ctx, editable));
    setNote("");
    setAmount("");
  }
  function close() {
    setOpen(false);
    setMilestone(null);
    setNote("");
    setAmount("");
  }
  const action = (kind: Boundary) => (
    <button
      type="button"
      className={cn(TEXT_BUTTON, "min-w-0 flex-1 flex-col gap-0 px-2 py-1 leading-tight")}
      disabled={kind === "session" ? !pointsEditable : !editable}
      aria-label={t(kind === "session" ? "startLabel" : "endLabel")}
      onClick={() => setConfirm(kind)}
      data-fate-boundary={kind}
    >
      {t(kind)}
    </button>
  );
  return (
    <>
      <div className="flex min-w-0 items-stretch gap-2">
        {action("session")}
        {action("scene")}
        <button
          type="button"
          className={cn(ICON_BUTTON, "border border-border")}
          aria-label={t("manage")}
          title={t("manageHint")}
          onClick={() => setOpen(true)}
        >
          <ScrollText className="size-4" aria-hidden />
        </button>
        <InfoTip label={t("boundaryInfo")} className="self-center">
          <p>{t("boundaryHint")}</p>
          {writable && structural && <p className="mt-1" data-fate-play-only>{t("playOnly")}</p>}
        </InfoTip>
      </div>
      {tableOwns && <p className="mt-1 text-xs text-muted-foreground" data-fate-table-session>{t("tableManaged")}</p>}
      <AlertDialog open={confirm !== null} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm ? t(confirm) : ""}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              {confirm === "scene" ? (
                <p>
                  {t("stress", {
                    physical: harm.physicalStress.length,
                    mental: harm.mentalStress.length,
                    unified: harm.unifiedStress.length,
                  })}
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="font-display text-xl text-foreground">
                    {t("points", { from: r.fatePoints, to: Math.max(r.fatePoints, r.effectiveRefresh) })}
                  </p>
                  <p>{t("carry", { refresh: r.effectiveRefresh })}</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction className="min-h-11" disabled={confirm === "session" ? !pointsEditable : !editable} onClick={() => confirm && boundary(confirm)}>
              {confirm === "scene" ? t("end") : t("start")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) close();
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl"
        >
          <DialogHeader>
            <DialogTitle>{t("manage")}</DialogTitle>
          </DialogHeader>
          {milestone && writable ? (
            <Suspense>
              <Milestone kind={milestone} close={() => setMilestone(null)} />
            </Suspense>
          ) : (
            <div className="grid items-start gap-4 md:grid-cols-[3fr_2fr]">
              <div className="min-w-0 space-y-4">
                <section>
                  <h3>{t("recovery")}</h3>
                  {reminders(data).map((i) => (
                    <p key={i.key}>
                      {i.text} · {t(i.status)}
                    </p>
                  ))}
                </section>
                <section>
                  <h3>{t("milestones")}</h3>
                  {(["minor", "major"] as const).map((k) => (
                    <Button
                      key={k}
                      variant="outline"
                      disabled={!writable}
                      onClick={() => setMilestone(k)}
                    >
                      {t(k)}
                    </Button>
                  ))}
                </section>
                <section>
                  <h3>{t("compel")}</h3>
                  <p>{t("agreed")}</p>
                  <Button disabled={!pointsEditable} variant="outline" onClick={() => change("accept")}>
                    {t("accept")}
                  </Button>
                  <Button
                    disabled={!pointsEditable || r.fatePoints < 1}
                    variant="outline"
                    onClick={() => change("refuse")}
                  >
                    {t("refuse")}
                  </Button>
                </section>
                <details className="rounded-lg border p-3">
                  <summary>{t("adjustment")}</summary>
                  <label>
                    {t("amount")}
                    <Input
                      type="number"
                      step="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </label>
                  <label>
                    {t("reason")}
                    <Input value={note} onChange={(e) => setNote(e.target.value)} />
                  </label>
                  <Button
                    variant="outline"
                    disabled={
                      !pointsEditable ||
                      !note.trim() ||
                      !Number.isSafeInteger(Number(amount)) ||
                      !Number(amount) ||
                      r.fatePoints + Number(amount) < 0
                    }
                    onClick={() => change("adjust")}
                  >
                    {t("apply")}
                  </Button>
                </details>
              </div>
              <section className="rounded-lg border p-3">
                <h3>{t("ledger")}</h3>
                {[...state.ledger].reverse().map((e) => {
                  const aspect = [...aspects.permanent, ...aspects.held].find(
                    (a) => a.id === e.aspectId && !a.hidden,
                  );
                  const desc = e.reason === "adjustment" ? fateRecord(e).note : aspect?.text;
                  return (
                    <p className="flex gap-2" key={e.operationId}>
                      <time>{e.timestamp.slice(11, 16)}</time>
                      <b>{signed(e.delta)}</b>
                      {e.reason === "compel"
                        ? t(e.delta < 0 ? "refused" : "accepted")
                        : t.has(e.reason)
                          ? t(e.reason)
                          : t("ledger")}
                      {typeof desc === "string" && desc}
                    </p>
                  );
                })}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
/**
 * The trouble card's 接受強迫 (frame 03): the same command as the panel's accept, +1 fate point
 * with a ledger entry naming the aspect. Briefly inert after a tap, so a double tap records one
 * compel; a second compel is a second tap later.
 */
export function AspectCompel({ aspect }: FateAspectActionProps) {
  const t = useTranslations("fatePlay.aspects");
  const { editable: writable, structural, update } = useFatePlay();
  // The card hides it in edit mode; a compel records play, so it stays inert there too. At an
  // active table a compel is the GM's offer there (plan-r2 T2), not a point on the card.
  const tableOwns = useFateTableMode().kind !== "v2";
  const editable = writable && !structural && !tableOwns;
  const [done, setDone] = useState(false);
  // A ref, not the state: two taps in one frame both see `done === false` before React re-renders.
  const busy = useRef(false);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => {
      busy.current = false;
      setDone(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, [done]);
  const accept = () => {
    if (!editable || busy.current) return;
    busy.current = true;
    const ctx = newOperation();
    update((card) => pointChange(card, "accept", 0, "", ctx, editable, aspect.id));
    setDone(true);
  };
  return (
    <button
      type="button"
      className={cn(ASPECT_ACTION, "border-accent/50 text-accent")}
      disabled={!editable}
      aria-disabled={done || undefined}
      onClick={accept}
      data-fate-compel={aspect.id}
    >
      {done ? t("compelDone") : t("compel")}
    </button>
  );
}

export function FateSessionPanel() {
  return (
    <Suspense>
      <Panel />
    </Suspense>
  );
}
export { FateSessionPanel as session };
