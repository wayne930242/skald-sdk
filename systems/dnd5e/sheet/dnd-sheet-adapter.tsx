"use client";

import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import type { LoadedSystem } from "@skald/types/system";
import type { EditorHandlers } from "@skald/sheet-sdk/modules/sheet-schema";
import type { SheetAdapterInput, SheetAdapterOutput } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";
import type { CharacterUpdater } from "./compendium-dialog";
import type { CompendiumDialogTab, CompendiumStart } from "./compendium-rows";
import { isMulticlass } from "./play/casting-classes";
import { sheetNamesFrom } from "./play/sheet-names";
import { spellLibrary } from "./play/spell-library";
import { presentRefs } from "./compendium-present";
import type { CharacterReferenceRow, ReferenceRequest } from "./reference-dialog";
import type { LevelUpRequest } from "./play/play-context";
import { useDevicePacks } from "./use-device-packs";
import { useTablePackScope } from "./pack-scope";
import { useReferenceContext } from "./use-reference-context";
import { DndPlayView } from "./play/play-view";
import { PLAY_VIEW_FIELDS } from "./play/play-model";
import { loadPlayMessages } from "./play/play-messages";

// The dialogs load when first opened: the sheet's own chunk stays small (D&D sheet ≤ CoC + 60 KB).
const CompendiumDialog = lazy(() => import("./compendium-dialog").then((module) => ({ default: module.CompendiumDialog })));
const ReferenceDialog = lazy(() => import("./reference-dialog").then((module) => ({ default: module.ReferenceDialog })));
const LevelUpDialog = lazy(() => import("./level-up/level-up-dialog").then((module) => ({ default: module.LevelUpDialog })));

/** Lists whose rows name a reference (`name`, `ref`, `origin`, `text`), in sheet order. */
export const REFERENCE_LISTS = [
  "features",
  "speciesTraits",
  "feats",
  "weapons",
  "spells",
  "equipment",
  "toolProficiencies",
  "weaponMasteries",
  "languages",
] as const;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function toReferenceRow(list: string, row: Record<string, unknown>): CharacterReferenceRow {
  return { list, name: text(row.name), ref: text(row.ref), origin: text(row.origin) || "custom", text: text(row.text) };
}

/** The character's named rows, for the reference browser. */
export function collectReferenceRows(data: Record<string, unknown>): CharacterReferenceRow[] {
  return REFERENCE_LISTS.flatMap((list) => {
    const rows = Array.isArray(data[list]) ? (data[list] as unknown[]) : [];
    return rows
      .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
      .map((row) => toReferenceRow(list, row))
      .filter((row) => row.name || row.ref);
  });
}

/** The character's level for a reference request, which a class's progression table highlights. */
function levelOf(character: Record<string, unknown> | undefined): { level?: number } {
  const level = Number(character?.level);
  return Number.isInteger(level) && level > 0 ? { level } : {};
}

/**
 * The play view is the built-in D&D template's presentation: a fork or user template keeps its
 * own layout (its added fields would not show in play). It also needs the §3.2 field contract.
 */
export function supportsPlayView(system: LoadedSystem): boolean {
  if (system.runtime?.builtinTemplate !== true) return false;
  const fields = system.schema?.fields ?? {};
  return PLAY_VIEW_FIELDS.every((id) => Object.hasOwn(fields, id));
}

/**
 * D&D sheet adapter: the reference and compendium handlers and their dialogs. Rows call
 * `openReference` through their name field's action (it receives the row, and the character as
 * the handler context); the toolbar calls `openReferenceBrowser` and `openCompendium` with the
 * character. Every request carries the character's level. A table copy whose setup takes the GM's
 * homebrew reads the table's shared copies with its packs (`useTablePackScope`); a vault sheet
 * reads the device's packs alone.
 */
export function useDnd5eSheetAdapter({ system, initialData, inTable = false }: SheetAdapterInput): SheetAdapterOutput {
  const scope = useTablePackScope();
  const { packs, revalidate } = useDevicePacks(scope);
  const [reference, setReference] = useState<ReferenceRequest | null>(null);
  const [compendium, setCompendium] = useState<{ update: CharacterUpdater; level?: number; start: CompendiumStart } | null>(null);
  const [levelUp, setLevelUp] = useState<LevelUpRequest | null>(null);
  // The toolbar's 資料庫 reopens on the last tab used (plan-uat2 §3.2).
  const lastTab = useRef<CompendiumDialogTab>("spells");
  // The English names (dialog search) and the lazy names (creatures, magic items, tables, chapters:
  // plan T2b §5.10) load once a dialog has opened, not with the sheet. Overlays reach only the
  // reference views: play rows read the SRD source.
  const [dialogOpened, setDialogOpened] = useState(false);
  if (!dialogOpened && (reference !== null || compendium !== null || levelUp !== null)) setDialogOpened(true);
  const context = useReferenceContext(system, packs, { english: dialogOpened, reference: dialogOpened });

  const libraryStart = useCallback((character: Record<string, unknown> = {}, start: CompendiumStart = { tab: lastTab.current }): CompendiumStart => {
    const base = { ...start, present: presentRefs(character) };
    // Every entry point can switch to Spells. Keep the caller's filters and the level-up target intact.
    if (start.spellClasses || start.castingClassOf || !isMulticlass(character)) return base;
    const { spellClasses } = spellLibrary(system, character, context, {
      names: sheetNamesFrom(context.names), subclassMeta: (id) => context.packMetaOf?.(`subclass:${id}`),
    });
    return { ...base, spellClasses };
  }, [context, system]);

  const handlers = useMemo<EditorHandlers>(
    () => ({
      openReference: (row, _setData, handlerContext) =>
        setReference({ mode: "row", row: toReferenceRow("", row), ...levelOf(handlerContext?.character) }),
      openReferenceBrowser: (data) => {
        revalidate();
        setReference({ mode: "browser", rows: collectReferenceRows(data), ...levelOf(data) });
      },
      openCompendium: (data, setData) => {
        revalidate();
        setCompendium({ update: (updater) => setData(updater), ...levelOf(data), start: libraryStart(data) });
      },
    }),
    [revalidate, libraryStart],
  );

  const closeReference = useCallback(() => setReference(null), []);
  const closeCompendium = useCallback(() => setCompendium(null), []);
  const compendiumLevel = compendium?.level;
  const preview = useCallback(
    (ref: string) => setReference({ mode: "ref", ref, ...(compendiumLevel ? { level: compendiumLevel } : {}) }),
    [compendiumLevel],
  );
  const openRowReference = useCallback(
    (row: Record<string, unknown>, character?: Record<string, unknown>) =>
      setReference({ mode: "row", row: toReferenceRow("", row), ...levelOf(character) }),
    [],
  );
  const openPlayCompendium = useCallback(
    (update: CharacterUpdater, character?: Record<string, unknown>, start?: CompendiumStart) => {
      revalidate();
      if (start) lastTab.current = start.tab;
      setCompendium({ update, ...levelOf(character), start: libraryStart(character, start) });
    },
    [revalidate, libraryStart],
  );
  const openLevelUp = useCallback(
    (request: LevelUpRequest) => {
      revalidate();
      setLevelUp(request);
    },
    [revalidate],
  );
  const closeLevelUp = useCallback(() => setLevelUp(null), []);
  const rememberTab = useCallback((tab: CompendiumDialogTab) => {
    lastTab.current = tab;
  }, []);
  const playable = useMemo(() => supportsPlayView(system), [system]);
  // Start the play labels with the sheet: the view itself mounts once the character data is in.
  const locale = useLocale();
  if (playable) void loadPlayMessages(locale);

  return {
    handlers,
    defaultData: initialData || system.defaultData,
    playView: playable ? (
      <DndPlayView system={system} reference={context} openReference={openRowReference} openCompendium={openPlayCompendium} openLevelUp={openLevelUp} />
    ) : undefined,
    // One layout for play and edit (plan-uat2 §3.1): edit mode unlocks the structural fields in it.
    ...(playable ? { playViewModes: "both" as const } : {}),
    dialogs: (
      <Suspense fallback={null}>
        {compendium !== null && (
          <CompendiumDialog
            open={reference === null}
            system={system}
            context={context}
            onClose={closeCompendium}
            onUpdate={compendium.update ?? null}
            onPreview={preview}
            characterLevel={compendium.level}
            start={compendium.start}
            onTabChange={rememberTab}
            inTable={inTable}
          />
        )}
        {levelUp !== null && compendium === null && reference === null && (
          <LevelUpDialog request={levelUp} system={system} context={context} packs={packs} inTable={inTable} onClose={closeLevelUp} />
        )}
        {reference !== null && <ReferenceDialog request={reference} context={context} onClose={closeReference} />}
      </Suspense>
    ),
  };
}
