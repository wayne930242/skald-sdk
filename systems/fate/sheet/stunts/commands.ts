import type { FateCharacterData, FateStuntRow } from "../../domain/character";
import { checkFateStuntPurchase, useFateStunt as consumeStunt } from "../../domain/lifecycle";
import {
  fateRecord,
  isFateStuntNonblank,
  readFateResources,
  readFateStunts,
  updateFateStunts,
} from "../../domain/normalize";

export function saveStunt(card: FateCharacterData, patch: FateStuntRow, editable: boolean) {
  if (!editable) return card;
  const old = readFateStunts(card).find((row) => row.id === patch.id);
  const merged: FateStuntRow = { ...old, ...patch, usedSessionId: old?.usedSessionId };
  if (typeof merged.templateText === "string" && merged.customText === merged.templateText)
    merged.customText = "";
  const r = readFateResources(card);
  let override = r.refreshOverride;
  if (isFateStuntNonblank(merged) && !(old && isFateStuntNonblank(old))) {
    const buy = checkFateStuntPurchase(
      { freeStunts: 3, minRefresh: 1 },
      { base: r.baseRefresh, earned: r.earnedRefresh, override, nonblankStunts: r.stuntCount },
    );
    if (!buy.ok) return card;
    override = buy.overrideAfter;
  } else if (
    old &&
    isFateStuntNonblank(old) &&
    !isFateStuntNonblank(merged) &&
    override !== undefined &&
    r.stuntCount > 3
  )
    override++;
  const updated = updateFateStunts(card, (rows) =>
    old ? rows.map((row) => (row.id === old.id ? merged : row)) : [...rows, merged],
  );
  const state = fateRecord(card.fateV2);
  const next = {
    ...updated,
    fateV2: {
      ...state,
      refresh: {
        ...fateRecord(state.refresh),
        base: r.baseRefresh,
        earned: r.earnedRefresh,
        override,
      },
    },
  };
  return { ...next, fatePoints: r.fatePoints, refresh: readFateResources(next).effectiveRefresh };
}
export function markUsed(card: FateCharacterData, id: string, editable: boolean) {
  const session = fateRecord(fateRecord(card.fateV2).session).id;
  const stunt = readFateStunts(card).find((row) => row.id === id);
  if (!stunt) return card;
  const result = consumeStunt(stunt, typeof session === "string" ? session : undefined, !editable);
  if (!result.ok || !result.patch) return card;
  return updateFateStunts(card, (rows) =>
    rows.map((row) => (row.id === id ? { ...row, ...result.patch } : row)),
  );
}
export function stuntProse(row: FateStuntRow) {
  return (
    row.customText ??
    [
      row.because ?? row.quality,
      row.skill,
      row.action,
      row.circumstance,
      row.effect ?? row.feat,
      row.limit ?? row.limitation,
    ]
      .filter(Boolean)
      .join(" · ")
  );
}
