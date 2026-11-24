"use client";

import Image from "next/image";
import { BookOpen, ImagePlus, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePortraitActions } from "@skald/sheet-sdk/modules/character/ui/portrait/portrait-actions";
import { useSheetViewer } from "@skald/sheet-sdk/modules/character/ui/renderer/viewer-context";
import { useRollOptional } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { useFatePlay } from "./play-context";
import { visibleHighConcept } from "./play-model";
import { InlineText } from "./inline-text";
import { CARD, MUTED, TEXT_BUTTON } from "./card-styles";
import type { FatePlaySlots } from "./slots";

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * The character's portrait: a view-only thumbnail in play (a tap shows it large), uploadable and
 * replaceable in edit mode only. Without a picture it shows the name's first character.
 */
function Portrait({ name, editing }: { name: string; editing: boolean }) {
  const { data, setField } = useFatePlay();
  const characterId = useRollOptional()?.characterId ?? null;
  const src = text(data.portrait).trim() || null;
  const portrait = usePortraitActions({
    src,
    name,
    characterId,
    editable: editing,
    onChange: editing ? (url) => setField("portrait", url) : null,
  });
  const frame = cn(
    "relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted",
    editing ? "size-16 @3xl:size-20" : "size-11 @3xl:size-12",
  );
  const initial = Array.from(name.trim())[0] ?? "?";
  return (
    <div data-fate-portrait>
      {src || portrait.canUpload ? (
        <button
          type="button"
          onClick={src ? portrait.activate : portrait.pick}
          disabled={portrait.uploading}
          aria-label={portrait.label}
          className={cn(frame, "min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
        >
          {src ? (
            <Image src={src} alt="" fill unoptimized sizes="5rem" className="object-cover" />
          ) : (
            <ImagePlus className="size-6 text-muted-foreground" aria-hidden />
          )}
          {portrait.uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Loader2 className="size-5 animate-spin" aria-hidden />
            </span>
          )}
        </button>
      ) : (
        <div className={cn(frame, "font-display text-xl text-accent")} aria-hidden>{initial}</div>
      )}
      {portrait.elements}
    </div>
  );
}

function RulesButton() {
  const t = useTranslations("fatePlay");
  const { openRules } = useFatePlay();
  return (
    <button type="button" onClick={() => openRules()} aria-label={t("rules.open")} className={cn(TEXT_BUTTON, "min-w-11 shrink-0 px-2.5 @3xl:px-3")}>
      <BookOpen className="size-4" aria-hidden />
      <span aria-hidden className="hidden @md:inline">{t("rules.open")}</span>
    </button>
  );
}

/**
 * Who the character is, in play: a compact strip under the host's header (frame 03/04), which
 * already shows the name. Portrait thumbnail, high concept (unless secret), description and player
 * on one or two lines, and the rules entry. Nothing here edits; edit mode opens the full form.
 */
function IdentityStrip() {
  const t = useTranslations("fatePlay");
  const { data, aspects } = useFatePlay();
  const highConcept = visibleHighConcept(aspects.permanent);
  const player = text(data.player).trim();
  const description = text(data.description).trim();
  // The full sheet page's header already shows the portrait; table panels do not, so keep it there.
  // The host header is print:hidden, so a print-only copy stays for the browser's own print (PR-F001).
  const hostShowsPortrait = useSheetViewer().hostShowsPortrait === true;
  return (
    <section className="flex min-w-0 items-center gap-3" data-fate-identity>
      {hostShowsPortrait ? (
        <div className="hidden print:block" data-fate-portrait-print>
          <Portrait name={text(data.name)} editing={false} />
        </div>
      ) : (
        <Portrait name={text(data.name)} editing={false} />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium @3xl:text-base", !highConcept && "text-muted-foreground")} data-fate-high-concept>
          {highConcept || t("identity.noHighConcept")}
        </p>
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground @3xl:text-sm">
          {description && <span className="line-clamp-1 min-w-0 [overflow-wrap:anywhere]" data-fate-description>{description}</span>}
          {description && player && <span aria-hidden>·</span>}
          {player && <span className="shrink-0" data-fate-player>{t("identity.playerLine", { player })}</span>}
        </p>
      </div>
      <RulesButton />
    </section>
  );
}

/**
 * Who the character is, in edit mode: portrait upload, name, player and description as editable
 * text, with the recipe slot and the rules entry.
 */
function IdentityEditor({ presets: Presets }: { presets?: FatePlaySlots["presets"] }) {
  const t = useTranslations("fatePlay");
  const { data, setField } = useFatePlay();
  const name = text(data.name);
  const player = text(data.player);
  const description = text(data.description);
  return (
    <section className={cn(CARD, "flex flex-col gap-3 @3xl:flex-row @3xl:items-start")} data-fate-identity data-editing>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Portrait name={name} editing />
        <div className="grid min-w-0 flex-1 gap-1">
          <InlineText value={name} field={t("identity.name")} editable onCommit={(value) => setField("name", value)}>
            <p className={cn("font-display text-xl leading-tight [overflow-wrap:anywhere]", !name.trim() && "text-muted-foreground")}>
              {name.trim() || t("identity.unnamed")}
            </p>
          </InlineText>
          <InlineText value={player} field={t("identity.player")} editable onCommit={(value) => setField("player", value)}>
            <p className={cn(MUTED, "[overflow-wrap:anywhere]")} data-fate-player>
              {t("identity.playerLine", { player: player.trim() || t("notWritten") })}
            </p>
          </InlineText>
          <InlineText value={description} field={t("identity.description")} editable multiline onCommit={(value) => setField("description", value)}>
            <p className={cn("whitespace-pre-wrap text-sm [overflow-wrap:anywhere]", !description.trim() && "text-muted-foreground")} data-fate-description>
              {description.trim() || t("notWritten")}
            </p>
          </InlineText>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {Presets && <Presets />}
        <RulesButton />
      </div>
    </section>
  );
}

/** The strip in play, the form in edit mode (editable and in setup). */
export function Identity({ presets }: { presets?: FatePlaySlots["presets"] }) {
  const { structural } = useFatePlay();
  return structural ? <IdentityEditor presets={presets} /> : <IdentityStrip />;
}
