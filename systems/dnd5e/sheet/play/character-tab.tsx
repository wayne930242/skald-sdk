"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUpCircle, ImagePlus, Loader2, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePortraitActions } from "@skald/sheet-sdk/modules/character/ui/portrait/portrait-actions";
import { useRollOptional } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { EditLayer, EditSlot, usePlay } from "./play-context";
import { displayName } from "./row-text";
import { num, rows, text } from "./play-model";
import { classLine } from "./class-model";
import { CARD, CARD_TITLE } from "./card-styles";
import { useDndRecalc } from "./use-dnd-recalc";

/** The top character level: the helper is hidden there. */
const LEVEL_CAP = 20;

/** Longer than this (characters or lines) starts folded, with a toggle to read it all. */
const FOLD_CHARS = 360;
const FOLD_LINES = 6;

function needsFold(value: string): boolean {
  return value.length > FOLD_CHARS || value.split("\n").length > FOLD_LINES;
}

/** A player's own long text (appearance, backstory): kept as written, folded when long. */
function LongText({ value, id }: { value: string; id: string }) {
  const t = useTranslations("play.character");
  const [open, setOpen] = useState(false);
  const fold = needsFold(value);
  return (
    <div>
      <p
        id={id}
        className={cn("whitespace-pre-wrap break-words text-base leading-7", fold && !open && "line-clamp-6")}
        data-play-long-text
      >
        {value}
      </p>
      {fold && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((shown) => !shown)}
          className="mt-1 inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-accent hover:bg-muted"
        >
          {open ? t("showLess") : t("showMore")}
        </button>
      )}
    </div>
  );
}

function Portrait({ name }: { name: string }) {
  const t = useTranslations("play.character");
  const { values, editable, write } = usePlay();
  const characterId = useRollOptional()?.characterId ?? null;
  const src = text(values.portrait).trim() || null;
  const portrait = usePortraitActions({
    src,
    name,
    characterId,
    editable,
    onChange: editable ? (url) => write({ portrait: url }) : null,
  });
  // A phone keeps the portrait to a 7rem column beside the name, so the name shows on the first screen.
  const frame = "relative mx-auto aspect-square w-full max-w-[18rem] overflow-hidden rounded-xl border border-border bg-muted";
  return (
    <div className="space-y-2" data-play-portrait>
      {src ? (
        <button
          type="button"
          onClick={portrait.activate}
          aria-label={portrait.label}
          className={cn(frame, "block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2")}
        >
          <Image src={src} alt="" fill unoptimized sizes="18rem" className="object-cover" />
          {portrait.uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Loader2 className="size-6 animate-spin" aria-hidden />
            </span>
          )}
        </button>
      ) : (
        <div className={cn(frame, "flex flex-col items-center justify-center gap-3 p-2 text-center @lg:p-4")} data-play-portrait-empty>
          <User className="size-8 text-muted-foreground/60 @lg:size-12" aria-hidden />
          <p className="sr-only text-sm text-muted-foreground @lg:not-sr-only">{t("noPortrait")}</p>
          {portrait.canUpload && (
            <button
              type="button"
              onClick={portrait.pick}
              disabled={portrait.uploading}
              aria-label={portrait.uploading ? t("uploading") : t("upload")}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-2 text-sm font-medium hover:bg-muted disabled:opacity-60 @lg:px-4"
            >
              {portrait.uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
              <span className="hidden @lg:inline" aria-hidden>{portrait.uploading ? t("uploading") : t("upload")}</span>
            </button>
          )}
        </div>
      )}
      {portrait.elements}
    </div>
  );
}

function Summary() {
  const t = useTranslations("play.character");
  const tField = useTranslations("field");
  const tOption = useTranslations("option");
  const { values, editable, openLevelUp } = usePlay();
  const recalc = useDndRecalc();
  const name = text(values.name).trim();
  const classText = classLine(values, { separator: " / ", level: String });
  const level = num(values.level);
  const species = [text(values.species), text(values.lineage)].map((part) => part.trim()).filter(Boolean).join(" · ");
  const alignment = text(values.alignment);
  const alignmentKey = `alignment.${alignment}`;
  const facts: Array<[string, string]> = [
    [tField("species"), species],
    [tField("background"), text(values.background).trim()],
    [tField("alignment"), alignment && tOption.has(alignmentKey) ? tOption(alignmentKey) : alignment],
  ];
  return (
    <div className="min-w-0 space-y-3">
      <div>
        <h2 className={cn("font-display text-2xl leading-tight", !name && "text-muted-foreground")} data-play-character-name>
          {name || t("unnamed")}
        </h2>
        <p className="mt-1 text-base text-muted-foreground">
          {[classText, level > 0 ? t("level", { level }) : ""].filter(Boolean).join(" · ")}
        </p>
        {/* Phase 2b §4.4: one level per run, never past 20, only where the sheet can change. */}
        {editable && openLevelUp && level < LEVEL_CAP && (
          <button
            type="button"
            onClick={() => openLevelUp(recalc)}
            className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted sm:min-h-9"
            data-play-level-up
          >
            <ArrowUpCircle className="size-4" aria-hidden />
            {t("levelUp")}
          </button>
        )}
      </div>
      <dl className="grid gap-x-3 gap-y-2 text-base sm:grid-cols-[auto_minmax(0,1fr)]">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-sm text-muted-foreground sm:pt-0.5">{label}</dt>
            <dd className={cn("-mt-1.5 sm:mt-0", !value && "text-muted-foreground")}>{value || t("blank")}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * A card with its ✎ (plan-uat2 §3.2): an editor of the sheet edits it in place, in play too; the
 * editor is a part of the edit layer, loaded on the first ✎.
 */
function EditableCard({ title, field, children, ...props }: { title: string; field: "appearance" | "backstory" | "notes" | "languages"; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  const tCommon = useTranslations("common");
  const { editable, update } = usePlay();
  const [editing, setEditing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  // The editor unmounts on 儲存 or 取消: the focus goes back to ✎, not to the page.
  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    trigger.current?.focus();
  }, [editing]);
  const done = () => {
    refocus.current = true;
    setEditing(false);
  };
  return (
    <section className={CARD} aria-label={title} {...props}>
      <header className="flex items-center justify-between gap-2">
        <h3 className={CARD_TITLE}>{title}</h3>
        {editable && update && !editing && (
          <button ref={trigger} type="button" onClick={() => setEditing(true)} aria-label={`${tCommon("edit")} ${title}`} className="-my-2 size-11 rounded-md text-muted-foreground hover:bg-muted sm:size-9">
            ✎
          </button>
        )}
      </header>
      {editing ? (
        <Suspense fallback={null}>
          {field === "languages" ? <EditLayer part="languages" onDone={done} /> : <EditLayer part="text" field={field} onDone={done} />}
        </Suspense>
      ) : (
        children
      )}
    </section>
  );
}

function TextCard({ field }: { field: "appearance" | "backstory" | "notes" }) {
  const t = useTranslations("play.character");
  const tField = useTranslations("field");
  const { values } = usePlay();
  const title = tField(field);
  const value = text(values[field]);
  return (
    <EditableCard title={title} field={field} data-play-character-text={field}>
      <div className="mt-2">
        {value.trim() ? (
          <LongText value={value.trim()} id={`play-character-${field}`} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("notWritten")}</p>
        )}
      </div>
    </EditableCard>
  );
}

function Languages() {
  const tField = useTranslations("field");
  const tFeatures = useTranslations("play.features");
  const { values, reference } = usePlay();
  const names = rows(values.languages).map((row) => displayName(reference, row).trim()).filter(Boolean);
  const title = tField("languages");
  return (
    <EditableCard title={title} field="languages" data-play-languages>
      {names.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{tFeatures("empty")}</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {names.map((item, index) => (
            <li key={`${item}-${index}`} className="rounded-full bg-muted/60 px-2.5 py-1 text-sm">
              {item}
            </li>
          ))}
        </ul>
      )}
    </EditableCard>
  );
}

/**
 * The 角色 tab (play view, first and default): who the character is before what it does. The
 * official sheet's page 2 identity boxes (portrait, appearance, backstory and alignment, languages)
 * plus the page 1 name line and the notes. An editor writes the text and languages here (✎) and
 * can upload or replace the portrait; the portrait opens large for anyone.
 */
export function CharacterTab() {
  const { values } = usePlay();
  const name = text(values.name).trim();
  return (
    <div className="@container space-y-3" data-play-character-tab>
      <section className={cn(CARD, "grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-4 @lg:grid-cols-[minmax(11rem,15rem)_minmax(0,1fr)]")} data-play-identity>
        <Portrait name={name} />
        <EditSlot part="identity"><Summary /></EditSlot>
      </section>
      <EditSlot part="vitals" />
      <TextCard field="appearance" />
      <TextCard field="backstory" />
      <Languages />
      <TextCard field="notes" />
    </div>
  );
}
