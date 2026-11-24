import type { ComponentType, ReactNode } from "react";
import type { FatePlayAspect, FatePlaySkill } from "./play-model";
import { FATE_LAZY_PLAY_SLOTS } from "./lazy-slots";

export interface FateSkillTriggerProps {
  skill: FatePlaySkill;
  /** The skill's shown name, for the trigger's accessible name. */
  label: string;
  /** The chip's content (name), to render inside the trigger. */
  children: ReactNode;
}

export interface FateAspectActionProps {
  /** A readable aspect with text (never a face-down secret or a blank card). */
  aspect: FatePlayAspect;
  /** The card's name (kind or player label, numbered when the kind repeats), for the control's label. */
  name: string;
}

/**
 * Seams for the feature surfaces that other tasks own. Each slot reads the character through
 * `useFatePlay()` (play-context) and renders in its own region of the shell; an absent slot
 * renders nothing (no placeholder that looks like a working control).
 *
 * - `rollTray`, `SkillTrigger`, `AspectInvoke` → `plugins/fate/sheet/rolls/**` (F6)
 * - `vitals`, `presets` → `plugins/fate/sheet/{harm,presets}/**` (F7)
 * - `session`, `stunts`, `AspectCompel` → `plugins/fate/sheet/{session,stunts}/**` (F8)
 */
export interface FatePlaySlots {
  /** The dice tray beside the fate points (last roll, invoke, reroll). */
  rollTray?: ComponentType;
  /** Wraps each skill chip on the ladder (+0 included): tap rolls, long-press opens options. */
  SkillTrigger?: ComponentType<FateSkillTriggerProps>;
  /** Under each aspect card in play: invoke this aspect on the latest roll (frame 03). */
  AspectInvoke?: ComponentType<FateAspectActionProps>;
  /** Under the trouble card in play: accept a compel for +1 fate point (frame 03). */
  AspectCompel?: ComponentType<FateAspectActionProps>;
  /** Fate point and session actions under the tokens (new session, end scene, ledger). */
  session?: ComponentType;
  /** The stunts card. */
  stunts?: ComponentType;
  /** The 生命力 card: stress, consequences or conditions, recovery. */
  vitals?: ComponentType;
  /** The recipe entry; the shell renders it only when the sheet is editable in setup mode. */
  presets?: ComponentType;
}

/** What the built-in adapter mounts: each surface lazy, outside the shell chunk (F9). */
export const FATE_PLAY_SLOTS: FatePlaySlots = FATE_LAZY_PLAY_SLOTS;
