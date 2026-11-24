"use client";

import { lazy, Suspense, use, useCallback, useMemo, useRef, useState } from "react";
import { NextIntlClientProvider, useLocale, useMessages, useTranslations } from "next-intl";
import type { FateSkillPyramidField } from "@skald/types/schema";
import type { LoadedSystem } from "@skald/types/system";
import { useSchemaData, useSchemaStatic } from "@skald/sheet-sdk/modules/character/ui/renderer/schema-context";
import { useSheetMode } from "@skald/sheet-sdk/modules/character/ui/renderer/sheet-mode";
import { useSheetViewer } from "@skald/sheet-sdk/modules/character/ui/renderer/viewer-context";
import { useRecalcOnEditExit } from "@skald/sheet-sdk/modules/character/ui/derived/use-recalc";
import { cn } from "@skald/sheet-sdk/lib/utils";
import type { RuleId } from "../../reference/rule-ids";
import { FatePlayContext, useFatePlay, type FateCharacterUpdater, type FatePlayContextValue } from "./play-context";
import { projectFateSheet } from "../presets/sheet-state";
import { fateSpreadHint, projectFatePlayAspects, projectFatePlaySkills, readFateVitalsSummary, type FateSecretAccess, type FateSpreadHint, type FateVitalsSummary } from "./play-model";
import { loadFatePlayMessages } from "./play-messages";
import { loadFatePlayRules, type FatePlayRules } from "./play-rules";
import { FATE_PLAY_SLOTS, type FatePlaySlots } from "./slots";
import { Identity } from "./identity";
import { AspectCards, HeldAspects } from "./aspect-cards";
import { SkillLadder } from "./skill-ladder";
import { FatePointsCard } from "./fate-points";
import { StickyStatus } from "./sticky-status";
import { InlineText } from "./inline-text";
import { CARD, CARD_TITLE, MUTED } from "./card-styles";
import { FATE_REFRESH_ID, fateDerivedSnapshot, fateOutOfCap, fateRecalcTriggers } from "./derived";
import { setFateRefreshOverride } from "../../domain/normalize";
import { FateTableModeProvider } from "../table/use-fate-table";
import { FateTableSetupPrompt } from "../presets/table-setup-prompt";

// The reader and both books load when a rules button is first pressed, never with the sheet.
const FateRulesDialog = lazy(() => import("../../reference/fate-rules-dialog").then((module) => ({ default: module.FateRulesDialog })));

export interface FatePlayViewProps {
  system: LoadedSystem;
  /** Feature surfaces (F6–F8); the adapter passes the assembled set. */
  slots?: FatePlaySlots;
  /**
   * Overrides the host's viewer (plan C2). By default the host-known owner or GM sees secret
   * aspects and everyone else, unknown included, does not. Display only: the text still reaches
   * the client in the character data.
   */
  secretAccess?: FateSecretAccess;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

function LongTextCard({ field, title }: { field: "extras" | "notes"; title: string }) {
  const t = useTranslations("fatePlay");
  const { data, editable, setField } = useFatePlay();
  const value = text(data[field]);
  return (
    <section className={CARD} {...{ [`data-fate-${field}`]: "" }}>
      <InlineText value={value} field={title} editable={editable} multiline onCommit={(next) => setField(field, next)}>
        <h2 className={CARD_TITLE}>{title}</h2>
        <p className={cn("mt-2 whitespace-pre-wrap text-base [overflow-wrap:anywhere]", !value.trim() && MUTED)}>{value.trim() ? value : t("notWritten")}</p>
      </InlineText>
    </section>
  );
}

/**
 * B-024 q3: on leaving edit mode, one notice of Fate's derived values that moved (refresh, stress
 * boxes, extra consequence slots) when a trigger changed while editing: a stress skill's rank, the
 * preset, the stunts' refresh cost, a major milestone. Values come from Fate's engine, not formulas.
 */
function RecalcOnEditExit({ sheet, labels }: { sheet: ReturnType<typeof projectFateSheet>; labels: FatePlayRules["labels"] }) {
  const t = useTranslations("fatePlay.derived");
  const { data, update } = useFatePlay();
  const mode = useSheetMode();
  const entered = useRef<typeof sheet | null>(null);
  const label = (fieldId: string) => {
    if (fieldId === FATE_REFRESH_ID) return t("refresh");
    if (fieldId.startsWith("stress:")) {
      const id = fieldId.slice("stress:".length);
      return t("stress", { id, track: labels.tracks[id] ?? id });
    }
    if (fieldId.startsWith("condition:")) {
      const id = fieldId.slice("condition:".length);
      return labels.conditions[id] ?? id;
    }
    return t("slot", { slot: labels.slots[fieldId] ?? fieldId });
  };
  useRecalcOnEditExit({
    triggers: [],
    label,
    snapshot: () => {
      if (mode === "edit") entered.current = sheet;
      return fateDerivedSnapshot(data, sheet);
    },
    triggerValues: () => fateRecalcTriggers(data, sheet),
    // Marks over a new capacity stay on the sheet; the notice says so (never deleted).
    extraRows: () => entered.current ? fateOutOfCap(entered.current, sheet) : [],
    // The only overridable value is refresh, stored in fateV2, not the template's overrides.
    restore: (fieldId) => {
      if (fieldId === FATE_REFRESH_ID) update((previous) => setFateRefreshOverride(previous, undefined));
    },
  });
  return null;
}

const LOWER_COLUMNS = ["", "@4xl:grid-cols-2", "@5xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.9fr)]"] as const;

interface PlayLayoutProps {
  slots: FatePlaySlots;
  hint: FateSpreadHint;
  shape: string;
  summary: FateVitalsSummary;
  labels: FatePlayRules["labels"];
}

function PlayLayout({ slots, hint, shape, summary, labels }: PlayLayoutProps) {
  const t = useTranslations("fatePlay");
  const anchor = useRef<HTMLElement | null>(null);
  const { rollTray: RollTray, stunts: Stunts, vitals: Vitals } = slots;
  const lower = 1 + (Stunts ? 1 : 0) + (Vitals ? 1 : 0);
  return (
    <div className="@container shell-wrap min-w-0 space-y-2.5 pb-8 pt-2 @3xl:space-y-3" data-fate-play-view>
      <StickyStatus anchor={anchor} summary={summary} labels={labels} />
      <FateTableSetupPrompt />
      <Identity presets={slots.presets} />
      <div className={cn("grid min-w-0 gap-2.5 @3xl:gap-3", RollTray && "@3xl:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]")}>
        <FatePointsCard ref={anchor} session={slots.session} />
        {RollTray && (
          <section className={CARD} data-fate-slot="rolls">
            <RollTray />
          </section>
        )}
      </div>
      <AspectCards invoke={slots.AspectInvoke} compel={slots.AspectCompel} />
      <HeldAspects />
      <div className={cn("grid min-w-0 items-start gap-3", LOWER_COLUMNS[lower - 1])}>
        <SkillLadder trigger={slots.SkillTrigger} hint={hint} shape={shape} />
        {Stunts && (
          <section className={CARD} data-fate-slot="stunts">
            <Stunts />
          </section>
        )}
        {Vitals && (
          <section className={CARD} data-fate-slot="vitals">
            <Vitals />
          </section>
        )}
      </div>
      <div className="grid min-w-0 gap-3 @3xl:grid-cols-2">
        <LongTextCard field="extras" title={t("notes.extras")} />
        <LongTextCard field="notes" title={t("notes.notes")} />
      </div>
    </div>
  );
}

/**
 * The built-in Fate Condensed sheet in play (direction B 「梯度與代幣」, frames 03/04/15/17):
 * a compact identity strip, fate point tokens, aspect cards, held boosts, the skill ladder and the
 * player's notes, with the feature slots of F6–F8 in their own regions. Rendered by TemplateRenderer
 * inside its schema, data and roll contexts; host edit mode and print keep the template.
 */
export function FatePlayView(props: FatePlayViewProps) {
  return (
    <Suspense fallback={null}>
      <PlayViewBody {...props} />
    </Suspense>
  );
}

function PlayViewBody({ system, slots = FATE_PLAY_SLOTS, secretAccess: accessOverride }: FatePlayViewProps) {
  const locale = useLocale();
  const viewer = useSheetViewer();
  const secretAccess: FateSecretAccess =
    accessOverride ?? (viewer.isOwner === true || viewer.isGM === true ? "authorized" : "unknown");
  // Both loads start before either suspends, so the labels and the preset rules arrive together.
  const playMessages = loadFatePlayMessages(locale);
  const playRules = loadFatePlayRules(locale);
  const play = use(playMessages);
  const { catalog, labels } = use(playRules);
  const messages = useMessages();
  const data = useSchemaData();
  const { schema, editable, setupMode, setData, onBlur } = useSchemaStatic();
  const [rules, setRules] = useState<{ section?: RuleId } | null>(null);

  const canWrite = editable && !!setData;
  const update = useCallback(
    (updater: FateCharacterUpdater) => {
      if (!canWrite || !setData) return;
      setData((previous) => updater(previous));
      onBlur?.();
    },
    [canWrite, setData, onBlur],
  );
  const setField = useCallback(
    (fieldId: string, value: unknown) => update((previous) => (previous[fieldId] === value ? previous : { ...previous, [fieldId]: value })),
    [update],
  );
  const openRules = useCallback((section?: RuleId) => setRules(section ? { section } : {}), []);
  // The recipe slot's roster editor, once it mounts in edit mode: the ladder chips open it.
  const [skillEditor, setSkillEditor] = useState<{ open: NonNullable<FatePlayContextValue["editSkill"]> } | null>(null);
  const provideSkillEditor = useCallback<NonNullable<FatePlayContextValue["provideSkillEditor"]>>((open) => setSkillEditor(open ? { open } : null), []);
  const structural = canWrite && setupMode;
  const editSkill = structural ? skillEditor?.open : undefined;
  const skillsField = schema.fields.skills as FateSkillPyramidField | undefined;
  // One projection of the active preset for the ladder, the spread hint and the sticky strip, so
  // they follow a recipe (approaches, unified stress, conditions) like the vitals card does.
  const sheet = useMemo(() => projectFateSheet(data, catalog), [data, catalog]);
  const skills = useMemo(() => projectFatePlaySkills(data, skillsField, sheet.roster.active), [data, skillsField, sheet]);
  const hint = useMemo(() => fateSpreadHint(sheet.roster.active, sheet.rules.allocation), [sheet]);
  const summary = useMemo(() => readFateVitalsSummary(data, sheet.harm), [data, sheet]);
  const aspects = useMemo(() => projectFatePlayAspects(data, secretAccess), [data, secretAccess]);

  const context = useMemo<FatePlayContextValue>(
    () => ({
      data,
      schema,
      system,
      editable: canWrite,
      structural,
      secretAccess,
      update,
      setField,
      openRules,
      skills,
      skillLabels: labels.skills,
      aspects,
      editSkill,
      provideSkillEditor,
    }),
    [data, schema, system, canWrite, structural, secretAccess, update, setField, openRules, skills, labels, aspects, editSkill, provideSkillEditor],
  );
  const merged = useMemo(() => ({ ...messages, ...play }), [messages, play]);

  return (
    <NextIntlClientProvider locale={locale} messages={merged}>
      <FatePlayContext.Provider value={context}>
        {/* DOM-less: whether an active table runs this copy's points and rolls (plan-r2 T3). */}
        <FateTableModeProvider>
          <PlayLayout slots={slots} hint={hint} shape={labels.allocations[sheet.rules.allocation.id] ?? sheet.rules.allocation.id} summary={summary} labels={labels} />
        </FateTableModeProvider>
        <RecalcOnEditExit sheet={sheet} labels={labels} />
        {rules && (
          <Suspense fallback={null}>
            <FateRulesDialog initialSection={rules.section} onClose={() => setRules(null)} />
          </Suspense>
        )}
      </FatePlayContext.Provider>
    </NextIntlClientProvider>
  );
}
