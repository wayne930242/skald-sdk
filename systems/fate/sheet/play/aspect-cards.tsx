"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { BookOpen, EyeOff, Lock, LockOpen, Plus, X } from "lucide-react";
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
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { FateAspectKind, FateAspectRow } from "../../domain/character";
import { updateFateAspects } from "../../domain/normalize";
import { sheetRuleTargets } from "../../reference/rule-ids";
import { useFatePlay } from "./play-context";
import type { FatePlayAspect } from "./play-model";
import { InlineText } from "./inline-text";
import { ASPECT_CARD, ASPECT_CARD_INNER, CARD, CARD_HEAD, CARD_TITLE, ICON_BUTTON, MUTED, TEXT_BUTTON } from "./card-styles";
import type { FatePlaySlots } from "./slots";

const KIND_RULE = {
  highConcept: sheetRuleTargets.highConcept,
  trouble: sheetRuleTargets.trouble,
  relationship: sheetRuleTargets.relationship,
  free: sheetRuleTargets.freeAspect,
  situation: sheetRuleTargets.aspects,
  boost: sheetRuleTargets.boost,
} as const satisfies Record<FateAspectKind, string>;

/** The label the old field renderer shows for a row, written with each edit (F1 mirror). */
function useStockLabel() {
  const t = useTranslations("aspect");
  return (kind: FateAspectKind) => (t.has(kind) ? t(kind) : kind);
}

/** One write path for every aspect change: the F1 updater inside the schema setter. */
function useAspectWriter() {
  const { update } = useFatePlay();
  const stockLabel = useStockLabel();
  return (change: (rows: readonly FateAspectRow[]) => readonly FateAspectRow[]) =>
    update((previous) => updateFateAspects(previous, change, stockLabel));
}

/** Free invokes on the card, as the table's ◇n token; nothing when there are none. */
function FreeInvokes({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span className="text-xs tabular-nums text-accent" aria-label={label} role="img">
      <span aria-hidden>◇{count}</span>
    </span>
  );
}

type SecretChange = { id: string; secret: boolean } | null;

function SecretConfirm({ change, onClose }: { change: SecretChange; onClose: () => void }) {
  const t = useTranslations("fatePlay.secret");
  const write = useAspectWriter();
  const confirm = () => {
    if (change) write((rows) => rows.map((row) => (row.id === change.id ? { ...row, secret: change.secret } : row)));
    onClose();
  };
  return (
    <AlertDialog open={change !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{change?.secret === false ? t("revealTitle") : t("title")}</AlertDialogTitle>
          <AlertDialogDescription>{change?.secret === false ? t("revealBody") : t("body")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction className="min-h-11" onClick={confirm}>{change?.secret === false ? t("revealConfirm") : t("confirm")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface AspectCardProps {
  aspect: FatePlayAspect;
  /** The card's name for its controls: kind (or player label), numbered when the kind repeats. */
  name: string;
  onSecret: (change: SecretChange) => void;
  invoke?: FatePlaySlots["AspectInvoke"];
  compel?: FatePlaySlots["AspectCompel"];
}

function AspectCard({ aspect, name, onSecret, invoke: Invoke, compel: Compel }: AspectCardProps) {
  const t = useTranslations("fatePlay.aspects");
  const tRules = useTranslations("fatePlay.rules");
  const { editable, structural, openRules } = useFatePlay();
  const write = useAspectWriter();
  const kindLabel = aspect.label ?? t(`kind.${aspect.kind}`);
  const prompt = aspect.kind in PROMPTS ? t(`prompt.${aspect.kind as keyof typeof PROMPTS}`) : "";
  const setText = (text: string) => write((rows) => rows.map((row) => (row.id === aspect.id ? { ...row, text } : row)));
  const remove = () => write((rows) => rows.filter((row) => row.id !== aspect.id));
  // Play actions belong to a readable card with text; edit mode shows the structural ones instead.
  const playable = !structural && !aspect.hidden && aspect.text.trim() !== "";
  const showInvoke = playable && !!Invoke;
  const showCompel = playable && !!Compel && aspect.kind === "trouble";
  return (
    <article
      className={cn(ASPECT_CARD, "w-[calc(50%-0.25rem)] shrink-0 snap-start @2xl:w-auto")}
      data-fate-aspect={aspect.id}
      data-hidden={aspect.hidden ? "true" : "false"}
    >
      <div className={ASPECT_CARD_INNER}>
        <header className="flex min-w-0 items-center justify-between gap-1 border-b border-accent/30 pb-1">
          <span className="inline-flex min-w-0 items-center gap-1 text-sm font-semibold text-accent">
            <span className="truncate">{aspect.hidden ? t("hidden") : kindLabel}</span>
            {aspect.secret && <Lock className="size-3.5 shrink-0" aria-hidden />}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5">
            <FreeInvokes count={aspect.freeInvokes} label={t("freeInvokes", { count: aspect.freeInvokes })} />
            {!aspect.hidden && (
              <button type="button" onClick={() => openRules(KIND_RULE[aspect.kind])} aria-label={tRules("section", { section: kindLabel })} className={cn(ICON_BUTTON, "-mr-1")}>
                <BookOpen className="size-3.5" aria-hidden />
              </button>
            )}
          </span>
        </header>
        {aspect.hidden ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 py-3 text-center">
            <EyeOff className="size-5 text-muted-foreground" aria-hidden />
            <p className={MUTED}>{t("hiddenNote")}</p>
          </div>
        ) : (
          <InlineText
            value={aspect.text}
            field={name}
            editable={editable}
            onCommit={setText}
            emptyAction={t("write", { label: name })}
            className="flex-1"
          >
            {aspect.text.trim() ? (
              <p className="font-display text-base leading-snug [overflow-wrap:anywhere] @3xl:text-lg">{aspect.text}</p>
            ) : (
              <p className={MUTED}>{prompt}</p>
            )}
            {aspect.conflict && <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">{t("conflict", { text: aspect.conflict })}</p>}
          </InlineText>
        )}
        {(showInvoke || showCompel) && (
          <footer className="flex flex-wrap items-center gap-1" data-fate-aspect-actions>
            {showInvoke && Invoke && <Invoke aspect={aspect} name={name} />}
            {showCompel && Compel && <Compel aspect={aspect} name={name} />}
          </footer>
        )}
        {structural && (
          <footer className="flex flex-wrap items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => onSecret({ id: aspect.id, secret: !aspect.secret })}
              aria-pressed={aspect.secret}
              aria-label={aspect.secret ? t("secretOn") : t("makeSecret")}
              className={cn(TEXT_BUTTON, "px-2", aspect.secret && "border-accent bg-accent text-accent-foreground hover:bg-accent/90")}
            >
              {aspect.secret ? <Lock className="size-3.5" aria-hidden /> : <LockOpen className="size-3.5" aria-hidden />}
              <span aria-hidden className="hidden @3xl:inline">{aspect.secret ? t("secretOn") : t("makeSecret")}</span>
            </button>
            <button type="button" onClick={remove} aria-label={t("remove", { label: name })} className={ICON_BUTTON}>
              <X className="size-4" aria-hidden />
            </button>
          </footer>
        )}
      </div>
    </article>
  );
}

const PROMPTS = { highConcept: true, trouble: true, relationship: true, free: true } as const;

/**
 * The character's own aspects as a row of cards: a sideways band two cards wide on a phone (it
 * scrolls inside itself, the page does not), three across in a table's panel, five across on a
 * desktop, each step by the view's own width so narrow text never breaks every few characters.
 * Text edits in play, and each card offers 援引 (the trouble also 接受強迫); adding, removing and
 * the secret switch belong to edit mode.
 */
export function AspectCards({ invoke, compel }: { invoke?: FatePlaySlots["AspectInvoke"]; compel?: FatePlaySlots["AspectCompel"] }) {
  const t = useTranslations("fatePlay.aspects");
  const tRules = useTranslations("fatePlay.rules");
  const { aspects, structural, openRules } = useFatePlay();
  const write = useAspectWriter();
  const [secretChange, setSecretChange] = useState<SecretChange>(null);
  const counts = new Map<string, number>();
  for (const aspect of aspects.permanent) counts.set(aspect.kind, (counts.get(aspect.kind) ?? 0) + 1);
  const add = () => {
    const id = `aspect-${crypto.randomUUID()}`;
    write((rows) => [...rows, { id, kind: "free", text: "", freeInvokes: 0, secret: false }]);
  };
  return (
    <section className="min-w-0 space-y-2" data-fate-aspects>
      <div className={CARD_HEAD}>
        <span className="inline-flex items-center gap-1">
          <h2 className={CARD_TITLE}>{t("title")}</h2>
          <button type="button" onClick={() => openRules(sheetRuleTargets.aspects)} aria-label={tRules("section", { section: t("title") })} className={ICON_BUTTON}>
            <BookOpen className="size-4" aria-hidden />
          </button>
        </span>
        <span className="flex items-center gap-2">
          {aspects.permanent.length > 2 && <span className={cn(MUTED, "text-xs @2xl:hidden")}>{t("swipe")}</span>}
          {structural && (
            <button type="button" onClick={add} className={TEXT_BUTTON}>
              <Plus className="size-4" aria-hidden />
              {t("add")}
            </button>
          )}
        </span>
      </div>
      {aspects.permanent.length === 0 ? (
        <p className={cn(CARD, MUTED)}>{t("empty")}</p>
      ) : (
        <div
          role="region"
          aria-label={t("title")}
          tabIndex={0}
          className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @2xl:mx-0 @2xl:grid @2xl:grid-cols-3 @2xl:gap-3 @2xl:overflow-visible @2xl:px-0 @2xl:pb-0 @5xl:grid-cols-5"
          data-fate-aspect-band
        >
          {aspects.permanent.map((aspect, index) => {
            const label = aspect.label ?? t(`kind.${aspect.kind}`);
            const name = !aspect.label && (counts.get(aspect.kind) ?? 0) > 1 ? t("numbered", { label, number: index + 1 }) : label;
            return <AspectCard key={aspect.id} aspect={aspect} name={name} onSecret={setSecretChange} invoke={invoke} compel={compel} />;
          })}
        </div>
      )}
      <SecretConfirm change={secretChange} onClose={() => setSecretChange(null)} />
    </section>
  );
}

const FIELD = "min-h-11 min-w-0 rounded-md border border-input bg-background px-2 text-base @3xl:min-h-9";
const MAX_FREE_INVOKES = 9;

/**
 * Adds a held aspect in play (the scene's situation aspect the table agreed on, or a boost the
 * GM granted), so the player need not roll to hold one. A boost carries its one free invoke and
 * goes away when used; a situation aspect starts with the free invokes the table gave it. The new
 * row's ID is made here, outside the updater, so a retried write adds it once.
 */
function AddHeld({ onDone }: { onDone: () => void }) {
  const t = useTranslations("fatePlay");
  const write = useAspectWriter();
  const name = useId();
  const [kind, setKind] = useState<"situation" | "boost">("situation");
  const [text, setText] = useState("");
  const [invokes, setInvokes] = useState("0");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const count = Number(invokes);
  const valid = text.trim() !== "" && (kind === "boost" || (Number.isSafeInteger(count) && count >= 0 && count <= MAX_FREE_INVOKES));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    const id = `${kind}-${crypto.randomUUID()}`;
    const row: FateAspectRow = { id, kind, text: text.trim(), freeInvokes: kind === "boost" ? 1 : count, secret: false };
    write((rows) => (rows.some((existing) => existing.id === id) ? rows : [...rows, row]));
    onDone();
  };
  return (
    <form className="flex w-full min-w-0 flex-wrap items-end gap-2 rounded-lg border border-border p-2" onSubmit={submit} data-fate-held-form>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">{t("held.kind")}</legend>
        {(["situation", "boost"] as const).map((option) => (
          <label key={option} className="inline-flex min-h-11 items-center gap-1.5 text-sm @3xl:min-h-9">
            <input type="radio" name={name} value={option} checked={kind === option} onChange={() => setKind(option)} className="size-4" />
            {t(`aspects.kind.${option}`)}
          </label>
        ))}
      </fieldset>
      <label className="grid min-w-0 flex-1 basis-56 gap-1 text-sm">
        <span>{t("held.text")}</span>
        <input className={FIELD} ref={input} value={text} onChange={(event) => setText(event.target.value)} enterKeyHint="done" />
      </label>
      {kind === "situation" && (
        <label className="grid w-24 gap-1 text-sm">
          <span>{t("held.invokes")}</span>
          <input className={FIELD} type="number" inputMode="numeric" min={0} max={MAX_FREE_INVOKES} step={1} value={invokes} onChange={(event) => setInvokes(event.target.value)} />
        </label>
      )}
      <span className="flex gap-2">
        <button type="button" className={TEXT_BUTTON} onClick={onDone}>{t("held.cancel")}</button>
        <button type="submit" className={cn(TEXT_BUTTON, "border-accent text-accent")} disabled={!valid}>{t("held.submit")}</button>
      </span>
    </form>
  );
}

/**
 * Boosts and situation aspects the character holds: an ordinary strip. In play (not only setup)
 * the player adds one the table agreed on and removes a used one.
 */
export function HeldAspects() {
  const t = useTranslations("fatePlay");
  const { aspects, editable, openRules } = useFatePlay();
  const write = useAspectWriter();
  const [adding, setAdding] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const closeForm = () => {
    setAdding(false);
    requestAnimationFrame(() => addButton.current?.focus());
  };
  return (
    <section className={cn(CARD, "flex flex-wrap items-center gap-x-3 gap-y-2 py-2 @3xl:py-2.5")} data-fate-held>
      <span className="inline-flex items-center gap-1">
        <h3 className="text-sm font-semibold">{t("held.title")}</h3>
        <button type="button" onClick={() => openRules(sheetRuleTargets.boost)} aria-label={t("rules.section", { section: t("held.title") })} className={ICON_BUTTON}>
          <BookOpen className="size-3.5" aria-hidden />
        </button>
      </span>
      {aspects.held.length === 0 ? (
        <span className={MUTED}>{t("held.empty")}</span>
      ) : (
        <ul className="flex min-w-0 flex-1 basis-full flex-wrap gap-2 @md:basis-auto">
          {aspects.held.map((aspect) => {
            const kind = t(`aspects.kind.${aspect.kind}`);
            return (
              <li key={aspect.id} className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-border bg-muted/30 pl-3" data-fate-held-aspect={aspect.id}>
                <span className="min-w-0 py-1.5 text-sm [overflow-wrap:anywhere]">{aspect.hidden ? t("aspects.hidden") : aspect.text}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{kind}</span>
                <span className="shrink-0 text-xs text-accent" aria-label={t("aspects.freeInvokes", { count: aspect.freeInvokes })}>
                  {aspect.kind === "boost" ? "◆" : "◇"}{aspect.freeInvokes}
                </span>
                {editable && !aspect.hidden ? (
                  <button
                    type="button"
                    onClick={() => write((rows) => rows.filter((row) => row.id !== aspect.id))}
                    aria-label={t("held.remove", { kind, text: aspect.text })}
                    className={ICON_BUTTON}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                ) : (
                  <span className="w-2" aria-hidden />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editable && !adding && (
        <button ref={addButton} type="button" onClick={() => setAdding(true)} aria-label={t("held.add")} className={cn(TEXT_BUTTON, "ml-auto min-w-11 px-2.5 @3xl:ml-0 @3xl:px-3")}>
          <Plus className="size-4" aria-hidden />
          <span aria-hidden className="hidden @3xl:inline">{t("held.add")}</span>
        </button>
      )}
      {editable && adding && <AddHeld onDone={closeForm} />}
    </section>
  );
}
