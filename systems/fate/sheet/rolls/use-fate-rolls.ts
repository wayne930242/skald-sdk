"use client";

import { useCallback, useEffect, useRef } from "react";
import { customAlphabet, nanoid } from "nanoid";
import { useTranslations } from "next-intl";
import type { RollConfig } from "@skald/dice/roll-expression";
import { useRollOptional, type RollResultEvent } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import type { FateAspectKind, FateCharacterData } from "../../domain/character";
import { applyFateInvoke, FATE_INVOKE_BONUS, type FateInvokeRefusal, type FateInvokeRequest, type FateRewardTarget } from "../../domain/invoke";
import { fateRecord, readFateAspects, readFateResources } from "../../domain/normalize";
import {
  applyFateScaleAfterRoll,
  createFateRoll,
  resolveFateRoll,
  toFateFaces,
  type FateOutcomeOffer,
  type FateRollOptions,
  type FateRollSnapshot,
} from "../../domain/roll";
import { useFatePlay } from "../play/play-context";
import type { FatePlaySkill } from "../play/play-model";
import {
  buildFateFollowUp,
  captureFateRootDelivery,
  classifyFateDispatch,
  fateDeliveryMode,
  liveFateSink,
  verifyFateChatBinding,
  type FateDeliveryMode,
  type FateSinkReader,
} from "./roll-delivery";
import { claimFateReward, commitFateInvoke, markFateStuntsUsed, reverseFateInvoke, setFateReceiptStatus, type FateCommandVerdict } from "./roll-commands";
import { useFateRollRules, type FateRollRules } from "./roll-rules";
import {
  fateRollScope,
  lockFateRoll,
  patchFateTrayRoll,
  setFateTableFailure,
  setFateTableRootPending,
  setFateTrayRoll,
  unlockFateRoll,
  useFateRollStore,
  type FateTableRollFailure,
  type FateTrayRoll,
} from "./roll-store";
import { fateRollStunts } from "./roll-stunts";
import { settleFateTableMode, useFateTableMode } from "../table/use-fate-table";
import {
  fateTableRootDelivery,
  FateTableRollError,
  liveWait,
  sendFateTableInvoke,
  type FateTableInvokeRequest,
  type FateTableRootPosted,
  type FateTableWait,
} from "../table/table-rolls";

/** The expression of every Fate v2 roll: four Fate dice plus the bonus, against the opposition. */
export const FATE_ROLL_EXPRESSION = "fate:4dF+{{@skill}}>={{@target}}";

const correlationTag = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 4);

export type FateInvokeOutcome =
  | { ok: true; delivery: "posted" | "rejected" | "unknown" | "local" }
  | { ok: false; reason: FateInvokeRefusal | "busy" | "noRoll" | "settled" | "blocked" | "stale" | "editMode" };

/** A table invoke: committed by the table, or why not (the table's code, or a local guard). */
export type FateTableInvokeResult =
  | { ok: true }
  | { ok: false; reason: FateTableRollFailure | "busy" | "noRoll" | "settled" | "editMode" };

/** Test seams for the transport and the dice of a reroll; production uses the live ones. */
export interface FateRollDeps {
  sink: FateSinkReader;
  random: () => number;
  /** Table commands: operation IDs (UUIDs, the receipts' key) and the wait between resends. */
  operationId: () => string;
  wait: FateTableWait;
}

const LIVE_DEPS: FateRollDeps = { sink: liveFateSink, random: () => Math.random(), operationId: () => crypto.randomUUID(), wait: liveWait };
let deps: FateRollDeps = LIVE_DEPS;

/** Replace the sink or the dice for a test; call with no argument to restore them. */
export function setFateRollDeps(next?: Partial<FateRollDeps>) {
  deps = next ? { ...LIVE_DEPS, ...next } : LIVE_DEPS;
}

function useStockLabel() {
  const t = useTranslations("aspect");
  return useCallback((kind: FateAspectKind) => (t.has(kind) ? t(kind) : kind), [t]);
}

function sessionIdOf(data: FateCharacterData): string | undefined {
  const id = fateRecord(fateRecord(data.fateV2).session).id;
  return typeof id === "string" && id ? id : undefined;
}

/** Try the chosen after-roll scale mode once the roll succeeds; never twice (the engine refuses). */
function withPendingScale(snapshot: FateRollSnapshot, pending: FateRollOptions["scale"], rules: FateRollRules): FateRollSnapshot {
  if (!pending || snapshot.scale) return snapshot;
  const applied = applyFateScaleAfterRoll(snapshot, pending, rules);
  return applied.ok ? applied.snapshot : snapshot;
}

/**
 * The roll and invoke transactions of one mounted Fate sheet. The tray and every skill trigger
 * share the character-scoped store, so the last roll, the lock and the invoke history are one.
 */
export function useFateRolls() {
  const t = useTranslations("fateRolls");
  const play = useFatePlay();
  const roll = useRollOptional();
  const stockLabel = useStockLabel();
  const rules = useFateRollRules(play.data);
  const scope = fateRollScope(roll?.characterId);
  const tray = useFateRollStore((state) => state.rolls[scope]);
  const busy = useFateRollStore((state) => state.busy[scope] === true);
  const tableFailure = useFateRollStore((state) => state.tableFailures[scope]);
  const tableRootPending = useFateRollStore((state) => state.tableRootPending[scope]);
  // Plan-r2 T3: an active table runs this copy's rolls and points; v2 everywhere else.
  const table = useFateTableMode();

  // The record as of the last render, read at confirm time (never the picker's snapshot).
  const dataRef = useRef(play.data);
  useEffect(() => {
    dataRef.current = play.data;
  }, [play.data]);

  const now = { characterId: roll?.characterId, onBehalf: roll?.onBehalf ?? false };
  const deliveryMode = (current: FateTrayRoll): FateDeliveryMode => fateDeliveryMode(current.root, current.localAck, now, deps.sink);

  /** Roll a skill through the host roller, keeping only this call's result. */
  const rollSkill = async (skill: FatePlaySkill, label: string, options: FateRollOptions): Promise<boolean> => {
    // Edit mode never rolls (B-023), however the request got here (an options dialog opened in play).
    if (!roll || play.structural) return false;
    if (!lockFateRoll(scope)) return false;
    try {
      // Still reading whether a table holds this copy: the answer decides (never a guess).
      const settled = await settleFateTableMode(table);
      // A table holds this copy but the sheet cannot reach it: no roll that could spend locally.
      if (settled !== "v2" && table.kind !== "table") {
        setFateTableFailure(scope, settled === "unavailable" ? "unavailable" : "readOnly");
        return false;
      }
      const tableLink = table.kind === "table" ? table.link : null;
      if (tableLink) setFateTableFailure(scope, undefined);
      const available = new Set(fateRollStunts(dataRef.current, { id: skill.id, name: label }, options.action, play.editable)
        .filter((stunt) => stunt.available).map((stunt) => stunt.stuntId));
      if (options.stunts.some((stunt) => !available.has(stunt.stuntId))) return false;
      const rootRollId = nanoid();
      const tag = correlationTag();
      const characterId = roll.characterId ?? scope;
      const beforeRoll = options.scale && rules.scale.modes.find((mode) => mode.id === options.scale?.modeId)?.timing === "beforeRoll" ? options.scale : null;
      const draft = createFateRoll(
        { rootRollId, characterId, skillId: skill.id, rating: skill.rating, faces: [0, 0, 0, 0], options: { ...options, scale: beforeRoll }, visibility: "local" },
        rules,
      );
      if (!draft.ok) return false;
      const bonus = draft.snapshot.modifiers.reduce((sum, modifier) => sum + modifier.value, 0);
      // A new object per roll: the listener keeps the result of this call only.
      const config: RollConfig = { expression: FATE_ROLL_EXPRESSION };
      let captured: RollResultEvent | null = null;
      const stop = roll.onRollResult((event) => {
        if (event.config === config) captured = event;
      });
      let result;
      let posted: FateTableRootPosted | null = null;
      // At an active table the root goes out through the table's roll RPC, never the chat sink.
      const deliver = tableLink
        ? fateTableRootDelivery(tableLink.port, deps.operationId(), { rating: skill.rating, bonus, opposition: options.opposition }, (value) => {
          posted = value;
        }, deps.wait, (pending) => {
          // Unknown outcome: keep the operation; 「再確認一次」 resends it, or the player lets it go.
          setFateTableRootPending(scope, pending);
          setFateTableFailure(scope, "unavailable");
        })
        : undefined;
      try {
        result = await roll.executeRoll(config, { skill: skill.rating + bonus, target: options.opposition }, t("chat.root", { skill: label, tag }), undefined, { rollKey: skill.id, ...(deliver ? { deliver } : {}) });
      } catch (error) {
        if (!tableLink) throw error;
        setFateTableFailure(scope, error instanceof FateTableRollError ? error.code : "unavailable");
        return false;
      } finally {
        setFateTableRootPending(scope, undefined);
        stop();
      }
      const event = captured as RollResultEvent | null;
      if (!result || !event) return false;
      let faces;
      try {
        faces = toFateFaces(event.result.rolls);
      } catch {
        return false;
      }
      const tablePosted = posted as FateTableRootPosted | null;
      if (tableLink && (!tablePosted || event.entry.messageId !== tablePosted.messageId || (event.visibility !== "all" && event.visibility !== "gm"))) {
        setFateTableFailure(scope, "invalid");
        return false;
      }
      const root: FateTrayRoll["root"] = tableLink && tablePosted
        ? { kind: "table", messageId: tablePosted.messageId, audience: event.visibility as "all" | "gm", tableId: tableLink.tableId, revision: tablePosted.rollRevision }
        : captureFateRootDelivery({
          inSession: roll.isInSession,
          sentToChat: event.entry.sentToChat,
          visibility: event.visibility,
          entryId: event.entry.id,
          characterId: roll.characterId,
          characterName: roll.characterName,
          onBehalf: roll.onBehalf,
        }, deps.sink);
      // The table totals the roll from what it was made with; an after-roll scale mode is not part of it.
      const pendingScale = options.scale && !beforeRoll && !tableLink ? options.scale : null;
      const snapshot = withPendingScale(
        { ...draft.snapshot, faces, visibility: root.kind === "chat" || root.kind === "table" ? root.audience : "local" },
        pendingScale, rules,
      );
      if (tableLink) setFateTableFailure(scope, undefined);
      setFateTrayRoll(scope, {
        skillId: skill.id, skillLabel: label, tag, snapshot, root, revisions: [], localAck: false, pendingScale, settled: false,
        ...(tableLink && options.scale && !beforeRoll ? { tableScaleSkipped: true } : {}),
      });
      // A once-per-session stunt is used by an accepted roll, not by opening the options.
      const used = options.stunts.map((stunt) => stunt.stuntId);
      if (play.editable && used.length > 0) {
        const sessionId = sessionIdOf(dataRef.current);
        play.update((previous) => markFateStuntsUsed(previous, used, sessionId));
      }
      return true;
    } finally {
      unlockFateRoll(scope);
    }
  };

  /** One invoke: validate, apply locally, then announce it to the root's audience if that is verifiable. */
  const invoke = async (request: FateInvokeRequest): Promise<FateInvokeOutcome> => {
    const current = useFateRollStore.getState().rolls[scope];
    if (!current) return { ok: false, reason: "noRoll" };
    if (!play.editable) return { ok: false, reason: "readOnly" };
    if (play.structural) return { ok: false, reason: "editMode" };
    if (current.settled) return { ok: false, reason: "settled" };
    const mode = deliveryMode(current);
    // A table roll's invokes go through the table only (invokeAtTable), never the sheet's points.
    if (mode.mode === "blocked" || mode.mode === "table" || table.kind !== "v2") return { ok: false, reason: "blocked" };
    if (!lockFateRoll(scope)) return { ok: false, reason: "busy" };
    try {
      const data = dataRef.current;
      const { rows } = readFateAspects(data);
      const { fatePoints } = readFateResources(data);
      // IDs and time are fixed here, outside the updater: a replay of the command is a no-op.
      const context = { operationId: nanoid(), timestamp: new Date().toISOString() };
      const characterId = roll?.characterId ?? scope;
      const applied = applyFateInvoke(current.snapshot, request, { readOnly: false, characterId, fatePoints, aspects: rows }, context, deps.random, rules);
      if (!applied.ok) return { ok: false, reason: applied.reason };
      const status = mode.mode === "chat" ? "pending" : "local";
      let verdict: FateCommandVerdict | undefined;
      play.update((previous) => commitFateInvoke(previous, {
        context, characterId, snapshot: current.snapshot, request, delta: applied.delta, ledgerEntry: applied.ledgerEntry, status,
      }, stockLabel, (value) => {
        verdict = value;
      }));
      // Only an updater that ran and applied counts; a deferred or refused one is treated as stale.
      if (verdict !== "applied") return { ok: false, reason: "stale" };
      const snapshot = withPendingScale(applied.snapshot, current.pendingScale, rules);
      patchFateTrayRoll(scope, current.snapshot.rootRollId, (tray) => ({
        ...tray,
        snapshot,
        revisions: [...tray.revisions, { operationId: context.operationId, request, parent: current.snapshot, status }],
      }));
      if (mode.mode !== "chat") return { ok: true, delivery: "local" };

      // Re-check immediately before the dispatch; a changed binding never falls back to another audience.
      const binding = verifyFateChatBinding(mode.root, now, deps.sink);
      const hadHandler = deps.sink.handlerIds().length > 0;
      let delivery: "posted" | "rejected" | "unknown" = "rejected";
      if (binding.ok && hadHandler) {
        const label = t("chat.followUp", { skill: current.skillLabel, effect: t(`chat.effect.${request.effect}`), tag: current.tag });
        const message = buildFateFollowUp({
          messageId: nanoid(), timestamp: new Date(), root: mode.root, userName: binding.userName,
          snapshot, result: resolveFateRoll(snapshot, rules), label,
        });
        delivery = classifyFateDispatch(await deps.sink.dispatch(message), hadHandler);
      }
      play.update((previous) => setFateReceiptStatus(previous, context.operationId, delivery, ["pending"]));
      patchFateTrayRoll(scope, current.snapshot.rootRollId, (tray) => ({
        ...tray,
        revisions: tray.revisions.map((revision) => (revision.operationId === context.operationId ? { ...revision, status: delivery } : revision)),
      }));
      return { ok: true, delivery };
    } finally {
      unlockFateRoll(scope);
    }
  };

  /**
   * One invoke on a table root: the table pays (wallet, GM pool or a held free invoke), applies +2
   * or its own reroll and posts the follow-up, all at once; the tray then shows the table's faces.
   * An unknown outcome keeps the operation, so `confirmAtTable` resends it unchanged.
   */
  const sendAtTable = async (
    current: FateTrayRoll, request: FateTableInvokeRequest, operationId: string,
  ): Promise<FateTableInvokeResult> => {
    if (table.kind !== "table" || current.root.kind !== "table" || table.link.tableId !== current.root.tableId) {
      setFateTableFailure(scope, "readOnly");
      return { ok: false, reason: "readOnly" };
    }
    setFateTableFailure(scope, undefined);
    const label = t("chat.followUp", { skill: current.skillLabel, effect: t(`chat.effect.${request.effect}`), tag: current.tag });
    const outcome = await sendFateTableInvoke({ port: table.link.port, root: current.root, request, operationId, label, wait: deps.wait });
    const rootRollId = current.snapshot.rootRollId;
    if (!outcome.ok) {
      setFateTableFailure(scope, outcome.code);
      patchFateTrayRoll(scope, rootRollId, (tray) => ({
        ...tray,
        // Unknown: keep it to resend as is; refused: nothing was paid.
        tablePending: outcome.code === "unavailable" ? { operationId, request } : undefined,
      }));
      return { ok: false, reason: outcome.code };
    }
    const { faces, rollRevision } = outcome.value;
    const payment = request.source === "grant" ? "free" as const : "paid" as const;
    patchFateTrayRoll(scope, rootRollId, (tray) => {
      if (tray.root.kind !== "table") return tray;
      const parent = tray.snapshot;
      const snapshot = {
        ...parent,
        resultId: operationId,
        parentResultId: parent.resultId,
        faces,
        modifiers: [...parent.modifiers, {
          kind: "invoke" as const, aspectId: request.aspectKey, payment, effect: request.effect, operationId,
          value: request.effect === "plus2" ? FATE_INVOKE_BONUS : 0,
        }],
      };
      return {
        ...tray,
        snapshot,
        root: { ...tray.root, revision: rollRevision },
        revisions: [...tray.revisions, { operationId, request: { aspectId: request.aspectKey, payment, effect: request.effect }, parent, status: "posted" }],
        tableLabels: { ...tray.tableLabels, [request.aspectKey]: request.label },
        tablePending: undefined,
      };
    });
    table.link.refresh();
    return { ok: true };
  };

  const invokeAtTable = async (request: FateTableInvokeRequest): Promise<FateTableInvokeResult> => {
    const current = useFateRollStore.getState().rolls[scope];
    if (!current || current.root.kind !== "table") return { ok: false, reason: "noRoll" };
    if (play.structural) return { ok: false, reason: "editMode" };
    if (current.settled) return { ok: false, reason: "settled" };
    if (current.tablePending) return { ok: false, reason: "busy" };
    if (!lockFateRoll(scope)) return { ok: false, reason: "busy" };
    try {
      return await sendAtTable(current, request, deps.operationId());
    } finally {
      unlockFateRoll(scope);
    }
  };

  /** Resend the table invoke whose outcome is unknown, with its operation ID: it lands at most once. */
  const confirmAtTable = async (): Promise<FateTableInvokeResult> => {
    const current = useFateRollStore.getState().rolls[scope];
    const pending = current?.tablePending;
    if (!current || !pending) return { ok: false, reason: "noRoll" };
    if (!lockFateRoll(scope)) return { ok: false, reason: "busy" };
    try {
      return await sendAtTable(current, pending.request, pending.operationId);
    } finally {
      unlockFateRoll(scope);
    }
  };

  /** Give back an invoke whose announcement was definitely refused; only the latest one. */
  const reverse = (operationId: string): boolean => {
    const current = useFateRollStore.getState().rolls[scope];
    const last = current?.revisions.at(-1);
    if (!current || current.settled || !play.editable || play.structural || last?.operationId !== operationId || last.status !== "rejected") return false;
    if (!lockFateRoll(scope)) return false;
    try {
      const timestamp = new Date().toISOString();
      let verdict: FateCommandVerdict | undefined;
      play.update((previous) => reverseFateInvoke(previous, operationId, timestamp, stockLabel, (value) => {
        verdict = value;
      }));
      if (verdict !== "applied") return false;
      patchFateTrayRoll(scope, current.snapshot.rootRollId, (tray) => ({
        ...tray,
        snapshot: last.parent,
        revisions: tray.revisions.map((revision) => (revision.operationId === operationId ? { ...revision, status: "reversed" } : revision)),
      }));
      return true;
    } finally {
      unlockFateRoll(scope);
    }
  };

  /** Take the result's boost or free invokes onto one of this character's rows; settles the roll. */
  const claim = (offerId: FateOutcomeOffer["id"], target: FateRewardTarget): boolean => {
    const current = useFateRollStore.getState().rolls[scope];
    const status = current?.revisions.at(-1)?.status;
    // Rewards at a table are the table's grants (GM-issued); the sheet does not keep a second counter.
    if (!current || current.root.kind === "table" || table.kind !== "v2" || !play.editable || play.structural || current.settled || status === "rejected" || status === "pending" || !lockFateRoll(scope)) return false;
    try {
      const context = { operationId: nanoid(), timestamp: new Date().toISOString() };
      let verdict: FateCommandVerdict | undefined;
      play.update((previous) => claimFateReward(previous, {
        snapshot: current.snapshot, result: resolveFateRoll(current.snapshot, rules), offerId, target,
      }, context, stockLabel, (value) => {
        verdict = value;
      }));
      if (verdict !== "applied") return false;
      patchFateTrayRoll(scope, current.snapshot.rootRollId, (tray) => ({ ...tray, settled: true }));
      return true;
    } finally {
      unlockFateRoll(scope);
    }
  };

  /** The player keeps this roll's invokes on the sheet: nothing is sent to the table. */
  const keepLocal = () => {
    const current = useFateRollStore.getState().rolls[scope];
    if (current) patchFateTrayRoll(scope, current.snapshot.rootRollId, (tray) => ({ ...tray, localAck: true }));
  };

  return {
    canRoll: !!roll,
    table,
    tableFailure,
    /** A table root roll whose outcome is unknown: resend it as is, or let it go. */
    tableRootPending,
    invokeAtTable,
    confirmAtTable,
    editable: play.editable,
    /** Edit mode on a writable sheet: a retained roll's invokes, reversal and claims wait for play. */
    structural: play.structural,
    rules,
    tray,
    busy,
    deliveryMode: tray ? deliveryMode(tray) : null,
    result: tray ? resolveFateRoll(tray.snapshot, rules) : null,
    rollSkill,
    invoke,
    reverse,
    claim,
    keepLocal,
  };
}
