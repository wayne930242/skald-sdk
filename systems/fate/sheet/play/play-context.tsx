"use client";

import { createContext, useContext } from "react";
import type { Schema } from "@skald/types/schema";
import type { LoadedSystem } from "@skald/types/system";
import type { FateCharacterData } from "../../domain/character";
import type { RuleId } from "../../reference/rule-ids";
import type { FatePlayAspect, FatePlaySkill, FateSecretAccess } from "./play-model";

export type FateCharacterUpdater = (previous: FateCharacterData) => FateCharacterData;

type FateSkillEditor = (skillId: string, chip: HTMLElement) => void;

/** What every part of the B view and every slot reads: the character, the write paths and the gates. */
export interface FatePlayContextValue {
  data: FateCharacterData;
  schema: Schema;
  system: LoadedSystem;
  /** Ordinary edits (text, notes, used boosts): off on a read-only host. */
  editable: boolean;
  /** Structural edits (roster, ranks, presets, permanent aspects): editable and in setup mode. */
  structural: boolean;
  /** Owner or GM, verified by the host; `unknown` hides every secret aspect. */
  secretAccess: FateSecretAccess;
  /** Applies a whole-record update through the schema setter, then saves. A no-op when read-only. */
  update: (updater: FateCharacterUpdater) => void;
  /** Sets one top-level field (text, notes, portrait). A no-op when read-only. */
  setField: (fieldId: string, value: unknown) => void;
  /** Opens the rules reader at a section (the book's start without one). */
  openRules: (section?: RuleId) => void;
  /** The active preset's roster (stock skills, approaches or a short list) with ratings. */
  skills: FatePlaySkill[];
  /** Names of the preset lists' non-stock skills (approaches, short lists), in this locale. */
  skillLabels?: Readonly<Record<string, string>>;
  aspects: { permanent: FatePlayAspect[]; held: FatePlayAspect[] };
  /**
   * Edit mode (B-023): opens the roster editor at this skill, the edit target of its ladder chip.
   * Absent in play, on a read-only sheet and while no recipe slot provides the editor.
   */
  editSkill?: FateSkillEditor;
  /** The recipe slot offers its roster editor here while it is mounted, and withdraws it with `null`. */
  provideSkillEditor?: (open: FateSkillEditor | null) => void;
}

export const FatePlayContext = createContext<FatePlayContextValue | null>(null);

export function useFatePlay(): FatePlayContextValue {
  const value = useContext(FatePlayContext);
  if (!value) throw new Error("useFatePlay must be used inside the Fate play view");
  return value;
}
