"use client";

import { createContext, lazy, Suspense, useCallback, useContext, useState, type ReactNode } from "react";
import { useSheetMode } from "@skald/sheet-sdk/modules/character/ui/renderer/sheet-mode";
import type { RecalcNoticeInput } from "@skald/sheet-sdk/modules/character/ui/derived/use-recalc";
import type { LoadedSystem } from "@skald/types/system";
import type { Schema } from "@skald/types/schema";
import type { RollConfig } from "@skald/dice/roll-expression";
import type { ReferenceContextValue } from "../use-reference-context";
import type { CompendiumStart } from "../compendium-rows";
import type { CharacterPatch, CharacterValues } from "./play-model";
import type { EditPartName, EditTarget } from "./edit-layer";

/** What every part of the play view reads: the character, the write path and the shared choices. */
export interface PlayContextValue {
  /** Stored data with the formula values (derived values and overrides) on top. */
  values: CharacterValues;
  /** The stored data alone: what a recalculation diffs (B-024). */
  data: Record<string, unknown>;
  /** Writes are off on a read-only host (a shared sheet, a team mate's card). */
  editable: boolean;
  write: (patch: CharacterPatch) => void;
  /** Applies a whole-data update (adding rows): same path as the compendium. */
  update: ((updater: (previous: Record<string, unknown>) => Record<string, unknown>) => void) | null;
  reference: ReferenceContextValue;
  openReference: (row: Record<string, unknown>) => void;
  /** Opens the compendium on `start`'s tab and filters (the last tab when absent). */
  openCompendium: ((start?: CompendiumStart) => void) | null;
  /**
   * Opens the level-up helper (phase 2b §4.4) with the caller's recalc notice (`useDndRecalc`, which
   * needs this context); null where the sheet cannot change or has no helper.
   */
  openLevelUp: ((recalc: LevelUpRequest["recalc"]) => void) | null;
  system: LoadedSystem;
  schema: Schema;
}

/**
 * What the level-up helper gets from the play view (phase 2b §4.4): it is mounted by the adapter,
 * outside the play view's contexts, so the view hands over its write path, a reader of the stored
 * data now, its recalc notice and its compendium opener.
 */
export interface LevelUpRequest {
  update: (updater: (previous: Record<string, unknown>) => Record<string, unknown>) => void;
  current: () => Record<string, unknown>;
  /** B-024: the notice of what the change recalculated; `into` shows its rows in the level-up notice. */
  recalc: (before: Record<string, unknown>, after: Record<string, unknown>, into?: RecalcNoticeInput["into"]) => void;
  openCompendium: ((start: CompendiumStart) => void) | null;
}

export const PlayContext = createContext<PlayContextValue | null>(null);

export function usePlay(): PlayContextValue {
  const value = useContext(PlayContext);
  if (!value) throw new Error("usePlay must be used inside the D&D play view");
  return value;
}

function isRollConfig(value: unknown): value is RollConfig {
  return typeof value === "object" && value !== null && typeof (value as RollConfig).expression === "string";
}

/** A field's roll from the schema, so the play view rolls what the template rolls. */
export function fieldRoll(schema: Schema, fieldId: string): RollConfig | undefined {
  const roll = (schema.fields[fieldId] as { roll?: unknown } | undefined)?.roll;
  return isRollConfig(roll) ? roll : undefined;
}

/** A list row field's roll (`weapons.attack`, `weapons.damageMod`). */
export function rowFieldRoll(schema: Schema, listId: string, fieldId: string): RollConfig | undefined {
  const list = schema.fields[listId] as { rowTemplate?: { children?: Array<{ id?: string; roll?: unknown }> } } | undefined;
  const roll = list?.rowTemplate?.children?.find((child) => child.id === fieldId)?.roll;
  return isRollConfig(roll) ? roll : undefined;
}

/** The edit layer (`edit-layer.tsx`), loaded the first time a part renders. */
export const EditLayer = lazy(() => import("./edit-layer").then((module) => ({ default: module.EditPart })));

/**
 * Edit mode in the play view (plan-uat2 §3.1): in edit mode the edit layer's `part` (loaded on the
 * first switch to 編輯), else `children`, the play card it stands in for.
 */
export function EditSlot({ part, children = null }: { part: EditPartName; children?: ReactNode }) {
  return useSheetMode() === "edit" ? (
    <Suspense fallback={children}>
      <EditLayer part={part} />
    </Suspense>
  ) : (
    children
  );
}

/** Edit mode on a sheet the player can change: taps open editors (B-023). */
export function usePlayEditing(): boolean {
  const { editable } = usePlay();
  return useSheetMode() === "edit" && editable;
}

/** The value editor (`edit-layer.tsx`), loaded with the first tap in edit mode. */
const EditorDialog = lazy(() => import("./edit-layer").then((module) => ({ default: module.EditorDialog })));

/** The edit-exit recalc notice (`edit-layer.tsx`), loaded with the first switch to 編輯. */
const RecalcOnEditExit = lazy(() => import("./edit-layer").then((module) => ({ default: module.RecalcOnEditExit })));

const OpenEditorContext = createContext<(target: EditTarget) => void>(() => {});

/**
 * B-023: the play view's one value editor. A tap on a roll or play control in edit mode opens the
 * editor of what it shows (`EDIT_TARGETS`); the dialog and its fields load on the first open.
 */
export function DndEditorHost({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<EditTarget | null>(null);
  const open = useCallback((next: EditTarget) => setTarget(next), []);
  // Armed on the first edit entry and kept: the recalc hook must see the later exits and entries
  const editing = usePlayEditing();
  const [armed, setArmed] = useState(editing);
  if (editing && !armed) setArmed(true);
  return (
    <OpenEditorContext.Provider value={open}>
      {children}
      {armed && (
        <Suspense fallback={null}>
          <RecalcOnEditExit />
        </Suspense>
      )}
      {target && (
        <Suspense fallback={null}>
          <EditorDialog target={target} onClose={() => setTarget(null)} />
        </Suspense>
      )}
    </OpenEditorContext.Provider>
  );
}

/** Opens the play view's value editor on `target`. */
export function useOpenDndEditor(): (target: EditTarget) => void {
  return useContext(OpenEditorContext);
}
