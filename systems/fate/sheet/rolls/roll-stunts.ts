import type { FateAction, FateCharacterData, FateStuntRow } from "../../domain/character";
import { fateStuntAvailable } from "../../domain/lifecycle";
import { fateRecord, isFateStuntNonblank, readFateStunts } from "../../domain/normalize";
import { FATE_ACTIONS } from "../../domain/roll";

/** A Condensed bonus stunt adds +2 when its fictional condition holds. */
export const FATE_STUNT_BONUS = 2;

export interface FateRollStunt {
  stuntId: string;
  title: string;
  /** The circumstance the player confirms before it counts. */
  condition: string;
  bonus: number;
  available: boolean;
  /** Why a once-per-session stunt cannot be used now. */
  blocked?: "used" | "noSession" | "readOnly";
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const isAction = (value: string): value is FateAction => (FATE_ACTIONS as readonly string[]).includes(value);

function stuntSkillMatches(row: FateStuntRow, skillId: string, skillName: string): boolean {
  if (row.skillId) return row.skillId === skillId;
  const skill = text(row.skill);
  return skill !== "" && (skill === skillId || skill === skillName);
}

/**
 * Bonus stunts for this skill and action. Nothing is preselected: the player ticks the ones whose
 * fiction applies. A stunt that names no recognised action is offered for every action.
 */
export function fateRollStunts(
  data: FateCharacterData, skill: { id: string; name: string }, action: FateAction, editable: boolean,
): FateRollStunt[] {
  const sessionId = text(fateRecord(fateRecord(data.fateV2).session).id) || undefined;
  return readFateStunts(data).flatMap((row) => {
    if (row.type !== "bonus" || !isFateStuntNonblank(row) || !stuntSkillMatches(row, skill.id, skill.name)) return [];
    const stuntAction = text(row.action);
    if (isAction(stuntAction) && stuntAction !== action) return [];
    const once = row.oncePerSession === true;
    const blocked = !once ? undefined : !editable ? "readOnly" : !sessionId ? "noSession" : fateStuntAvailable(row, sessionId) ? undefined : "used";
    return [{
      stuntId: row.id,
      title: text(row.title) || text(row.quality) || text(row.customText) || text(row.circumstance),
      condition: text(row.circumstance) || text(row.because) || text(row.customText),
      bonus: FATE_STUNT_BONUS,
      available: blocked === undefined,
      ...(blocked ? { blocked } : {}),
    }];
  });
}

/** The character's own gear ratings, shown as a hint beside the controls (never preselected). */
export function fateGearHint(data: FateCharacterData): { weapon?: number; armor?: number; scaleTierId?: string } {
  const gear = fateRecord(fateRecord(data.fateV2).gear);
  const rating = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) ? value : undefined);
  const tier = text(gear.scaleTierId);
  return {
    ...(rating(gear.weapon) !== undefined ? { weapon: rating(gear.weapon) } : {}),
    ...(rating(gear.armor) !== undefined ? { armor: rating(gear.armor) } : {}),
    ...(tier ? { scaleTierId: tier } : {}),
  };
}
