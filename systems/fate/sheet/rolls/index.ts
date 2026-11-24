/**
 * Fate v2 rolls (F6): the named integration API for the B shell's slots. Assembly (F9) wires
 * `rollTray` and `SkillTrigger` into `FATE_PLAY_SLOTS`; nothing here registers itself.
 */
import type { FatePlaySlots } from "../play/slots";
import { FateAspectInvoke } from "./aspect-invoke";
import { FateRollTray } from "./roll-tray";
import { FateSkillTrigger } from "./skill-trigger";

export { FateAspectInvoke, FateRollTray, FateSkillTrigger };
export { useFateRollGesture } from "./roll-gesture";

/** The dice tray beside the fate points. */
export const rollTray: NonNullable<FatePlaySlots["rollTray"]> = FateRollTray;
/** Wraps each ladder chip (+0 included): tap rolls, long press opens the options. */
export const SkillTrigger: NonNullable<FatePlaySlots["SkillTrigger"]> = FateSkillTrigger;
/** Under each aspect card: invoke that aspect on the latest roll. */
export const AspectInvoke: NonNullable<FatePlaySlots["AspectInvoke"]> = FateAspectInvoke;
