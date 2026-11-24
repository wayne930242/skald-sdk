import type { DiceModifiers, SingleRoll } from "./types";
import { parseDiceExpression } from "./parser";

/**
 * Applies a group's keep/drop modifiers (`kh` `kl` `dh` `dl`) to its rolls, setting each
 * roll's `kept`. The roller and `keptRollFlags` share it, so a stored roll is read back
 * with the same choice the roller made (ties included).
 */
export function markKeptRolls(rolls: SingleRoll[], mods: DiceModifiers): void {
  if (!mods.keepHighest && !mods.keepLowest && !mods.dropHighest && !mods.dropLowest) return;
  // Indices by value, highest first
  const sortedIndices = rolls
    .map((_, idx) => idx)
    .sort((a, b) => rolls[b].value - rolls[a].value);

  for (const roll of rolls) {
    roll.kept = true;
  }

  if (mods.dropHighest) {
    for (let i = 0; i < mods.dropHighest && i < sortedIndices.length; i++) {
      rolls[sortedIndices[i]].kept = false;
    }
  }

  if (mods.dropLowest) {
    for (let i = 0; i < mods.dropLowest && i < sortedIndices.length; i++) {
      rolls[sortedIndices[sortedIndices.length - 1 - i]].kept = false;
    }
  }

  if (mods.keepHighest) {
    for (let i = mods.keepHighest; i < sortedIndices.length; i++) {
      rolls[sortedIndices[i]].kept = false;
    }
  }

  if (mods.keepLowest) {
    for (let i = 0; i < sortedIndices.length - mods.keepLowest; i++) {
      rolls[sortedIndices[i]].kept = false;
    }
  }
}

/**
 * Which faces of a stored plain roll counted toward its total, one flag per face.
 *
 * A stored roll keeps every face it rolled (`rolls`, each group's faces in notation
 * order) and its notation, not which faces a keep/drop modifier discarded; a roll card
 * reads that back here, so `2d20kl1+5` with faces `[20, 14]` shows 20 as dropped
 * instead of a `-15` modifier. Every face counts when the notation has no keep/drop
 * modifier, cannot be parsed, explodes (the face count is then unknown), or names a
 * different number of faces than were stored.
 */
export function keptRollFlags(rolls: number[], notation?: string): boolean[] {
  const allKept = rolls.map(() => true);
  if (!notation) return allKept;
  // Linear: anything any table member stores reaches here, so no backtracking regex.
  const body = notation.replace(/^[a-z0-9]+:/i, "");
  const cut = body.search(/[<>=]/);
  const dice = (cut < 0 ? body : body.slice(0, cut)).trim();
  const parsed = parseDiceExpression(dice);
  if (!parsed) return allKept;
  const groups = parsed.dice;
  const dropsAny = groups.some(({ modifiers: mods }) =>
    !!(mods?.keepHighest || mods?.keepLowest || mods?.dropHighest || mods?.dropLowest),
  );
  if (!dropsAny) return allKept;
  if (groups.some(({ modifiers: mods }) => mods?.exploding || mods?.compounding || mods?.penetrating)) return allKept;
  if (groups.reduce((sum, group) => sum + group.count, 0) !== rolls.length) return allKept;

  const flags: boolean[] = [];
  let offset = 0;
  for (const group of groups) {
    const faces = rolls
      .slice(offset, offset + group.count)
      .map((value): SingleRoll => ({ value, kept: true }));
    offset += group.count;
    markKeptRolls(faces, group.modifiers ?? {});
    flags.push(...faces.map((face) => face.kept));
  }
  return flags;
}
