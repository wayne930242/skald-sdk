import type {
  FateCharacterData as Card,
  FateLedgerEntry,
  FateV2State,
} from "../../domain/character";
import type { FateCommandContext } from "../../domain/engine";
import {
  changeFatePoints,
  endFateScene,
  fateBoundaries,
  fateRecoveryStatus,
  resolveFateCompel,
  startFateSession,
} from "../../domain/lifecycle";
import {
  fateRecord,
  readFateHarm,
  readFateResources,
  updateFateSplitStress,
} from "../../domain/normalize";

export function sessionState(data: Card) {
  const state: FateV2State = fateRecord(data.fateV2);
  return {
    ...state,
    ledger: Array.isArray(state.ledger) ? state.ledger : [],
    milestones: Array.isArray(state.milestones) ? state.milestones : [],
  };
}
export const newOperation = (): FateCommandContext => ({
  operationId: crypto.randomUUID(),
  timestamp: new Date().toISOString(),
});
export function transition(
  card: Card,
  kind: "scene" | "session",
  previousId: string | undefined,
  ctx: FateCommandContext,
  editable: boolean,
) {
  const state = sessionState(card);
  if (!editable || state[kind]?.id !== previousId) return card;
  const input = { ...state, ...readFateResources(card), readOnly: false };
  if (kind === "session") {
    const result = startFateSession(input, { sessionId: ctx.operationId }, ctx);
    if (!result.ok) return card;
    return {
      ...card,
      fatePoints: result.fatePoints,
      fateV2: {
        ...state,
        session: result.session,
        ledger: result.ledgerEntry ? [...state.ledger, result.ledgerEntry] : state.ledger,
      },
    };
  }
  const result = endFateScene(
    input,
    { sceneId: previousId ?? "", nextSceneId: ctx.operationId },
    ctx,
  );
  if (!result.ok) return card;
  const cleared = updateFateSplitStress(
    updateFateSplitStress(card, "physicalStress", () => []),
    "mentalStress",
    () => [],
  );
  return {
    ...cleared,
    fateV2: {
      ...sessionState(cleared),
      scene: result.scene,
      harm: { ...state.harm, unifiedStress: [] },
    },
  };
}
export function reminders(card: Card) {
  const harm = readFateHarm(card),
    boundaries = fateBoundaries(sessionState(card));
  return [
    ...Object.entries(harm.consequences),
    ...Object.entries(harm.extraMild),
    ...Object.entries(harm.conditions),
    ...(harm.legacyExtraMild ? [["legacy", { text: harm.legacyExtraMild }] as const] : []),
  ]
    .filter(([, injury]) => injury.text.trim())
    .map(([key, injury]) => ({
      key,
      text: injury.text,
      status: fateRecoveryStatus("metadata" in injury ? injury : {}, boundaries),
    }));
}
export type PointAction = "adjust" | "accept" | "refuse" | "withdraw";
export function pointChange(
  card: Card,
  action: PointAction,
  delta: number,
  note: string,
  ctx: FateCommandContext,
  editable: boolean,
  /** The compelled aspect, when the compel came from its card (shown in the ledger). */
  aspectId?: string,
) {
  const state = sessionState(card),
    input = { ...readFateResources(card), ledger: state.ledger, readOnly: !editable };
  if (action === "withdraw" || (action === "adjust" && (!note.trim() || !delta))) return card;
  const result =
    action === "adjust"
      ? changeFatePoints(input, { reason: "adjustment", delta }, ctx)
      : resolveFateCompel(input, { accepted: action === "accept", ...(aspectId ? { aspectId } : {}) }, ctx);
  if (!result.ok) return card;
  const entry: FateLedgerEntry & { note?: string } = {
    ...result.ledgerEntry,
    ...(action === "adjust" ? { note: note.trim() } : {}),
  };
  return {
    ...card,
    fatePoints: result.fatePoints,
    fateV2: { ...state, ledger: [...state.ledger, entry] },
  };
}
