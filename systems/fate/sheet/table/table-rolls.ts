/**
 * F6 at an active table (plan-r2 T3): the root roll and each invoke go through the session's roll
 * port to the Fate roll RPCs of migration 164, which commit the chat row with its effects. Nothing
 * here falls back to the chat sink or to the sheet's own fate points: a refusal is an error the
 * sheet shows, and an unknown outcome is resent with the same operation ID (the receipt replays it).
 */
import type { SimpleDiceRoll, SkillCheckRoll } from "@skald/dice";
import type { TableRulesErrorCode } from "@skald/sheet-sdk/modules/table-rules";
import type { FateFaces } from "../../domain/engine";
import type { FateAspectRef } from "../../table-rules/domain/view";
import type { FateTableRollPort, FateTableRollResult } from "./table-bridge";

export const FATE_TABLE_ROOT_RPC = "fate_table_roll_root";
export const FATE_TABLE_INVOKE_RPC = "fate_table_invoke";

export type FateTableAudience = "all" | "gm";

/** A refused or unconfirmed table roll: the roll does not reach chat another way. */
export class FateTableRollError extends Error {
  constructor(readonly code: TableRulesErrorCode | "audience" | "abandoned") {
    super(`fate_table:${code}`);
    this.name = "FateTableRollError";
  }
}

/** Waits between resends of an unknown outcome; tests replace it. */
export type FateTableWait = (ms: number) => Promise<void>;
export const liveWait: FateTableWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RESEND_DELAYS = [400, 1200] as const;

async function withResend(send: () => Promise<FateTableRollResult>, wait: FateTableWait): Promise<FateTableRollResult> {
  let result = await send();
  for (const delay of RESEND_DELAYS) {
    if (result.ok || result.code !== "unavailable") return result;
    await wait(delay);
    result = await send();
  }
  return result;
}

export interface FateTableRootDetails {
  readonly rating: number;
  readonly bonus: number;
  readonly opposition: number;
}

export interface FateTableRootPosted {
  readonly messageId: string;
  readonly rollRevision: number;
  readonly sceneId: string | null;
}

/** What a root roll with an unknown outcome offers while it waits (the roll store keeps it). */
export interface FateTableRootUnknown {
  readonly resend: () => Promise<void>;
  readonly abandon: () => void;
}

/**
 * Rolls' `ExecuteRollOptions.deliver` for a Fate root roll: posts the built roll through the port
 * with what the roll was made with. Rejects (so the roll records nothing) on refusal or on an
 * audience the table cannot take. When the outcome stays unknown after the resends, it waits on
 * `onUnknown`'s resend (the same operation and payload, so the table replays it) or abandon.
 */
export function fateTableRootDelivery(
  port: FateTableRollPort,
  operationId: string,
  details: FateTableRootDetails,
  onPosted: (posted: FateTableRootPosted) => void,
  wait: FateTableWait = liveWait,
  onUnknown?: (pending: FateTableRootUnknown) => void,
): (roll: SimpleDiceRoll | SkillCheckRoll) => Promise<{ messageId: string }> {
  return async (roll) => {
    if (roll.visibility !== "all" && roll.visibility !== "gm") throw new FateTableRollError("audience");
    const audience = roll.visibility;
    const send = () => port.postRoot(FATE_TABLE_ROOT_RPC, { operationId, payload: { audience, diceData: roll, details } });
    let result = await withResend(send, wait);
    if (!result.ok && result.code === "unavailable" && onUnknown) {
      result = await new Promise<FateTableRollResult>((resolve) => {
        let settled = false;
        onUnknown({
          resend: async () => {
            if (settled) return;
            const next = await send();
            if (settled || (!next.ok && next.code === "unavailable")) return;
            settled = true;
            resolve(next);
          },
          abandon: () => {
            if (settled) return;
            settled = true;
            resolve({ ok: false, code: "unavailable" });
          },
        });
      });
      if (!result.ok && result.code === "unavailable") throw new FateTableRollError("abandoned");
    }
    if (!result.ok) throw new FateTableRollError(result.code);
    const value = result.value.result;
    const revision = value.rollRevision;
    onPosted({
      messageId: value.messageId,
      rollRevision: typeof revision === "number" ? revision : 1,
      sceneId: typeof value.sceneId === "string" ? value.sceneId : null,
    });
    return { messageId: value.messageId };
  };
}

/** The stable identity of an aspect, as the server keys a paid invoke once per root. */
export function fateTableAspectKey(aspect: FateAspectRef): string {
  return aspect.kind === "scene" ? `scene:${aspect.sceneAspectId}` : `character:${aspect.characterId}:${aspect.aspectId}`;
}

export type FateTableInvokeRequest =
  | {
    readonly effect: "plus2" | "reroll";
    readonly source: "grant";
    readonly grantId: string;
    readonly aspectKey: string;
    readonly isBoost: boolean;
    /** Shown on the tray (never sent): the aspect's text as the viewer sees it. */
    readonly label: string;
  }
  | {
    readonly effect: "plus2" | "reroll";
    readonly source: "wallet" | "pool";
    readonly aspect: FateAspectRef;
    readonly hostile: boolean;
    readonly aspectKey: string;
    readonly label: string;
  };

export interface FateTableInvoked {
  readonly messageId: string;
  readonly rollRevision: number;
  readonly faces: FateFaces;
  readonly total: number;
  readonly available: number | null;
}

function faces(value: unknown): FateFaces | null {
  return Array.isArray(value) && value.length === 4 && value.every((face) => face === -1 || face === 0 || face === 1)
    ? [value[0], value[1], value[2], value[3]] as FateFaces
    : null;
}

export type FateTableInvokeOutcome =
  | { readonly ok: true; readonly value: FateTableInvoked }
  | { readonly ok: false; readonly code: TableRulesErrorCode };

/**
 * Send one invoke on a table root. `diceData` carries only an ID and the chat label: the server
 * builds the follow-up from the faces it keeps (+2 on them, or four it draws for a reroll).
 */
export async function sendFateTableInvoke(input: {
  port: FateTableRollPort;
  root: { readonly messageId: string; readonly audience: FateTableAudience; readonly revision: number };
  request: FateTableInvokeRequest;
  operationId: string;
  label: string;
  wait?: FateTableWait;
}): Promise<FateTableInvokeOutcome> {
  const { port, root, request, operationId } = input;
  const details = request.source === "grant"
    ? { effect: request.effect, source: "grant", grantId: request.grantId, expectedRevision: root.revision }
    : {
      effect: request.effect, source: request.source, aspect: request.aspect, hostile: request.hostile,
      expectedRevision: root.revision,
    };
  const result = await withResend(
    () => port.publishFollowUp(FATE_TABLE_INVOKE_RPC, {
      operationId,
      payload: { audience: root.audience, diceData: { id: operationId, label: input.label }, details, followUpOf: root.messageId },
    }),
    input.wait ?? liveWait,
  );
  if (!result.ok) return result;
  const value = result.value.result;
  const rolled = faces(value.faces);
  if (!rolled || typeof value.total !== "number" || typeof value.rollRevision !== "number") return { ok: false, code: "invalid" };
  return {
    ok: true,
    value: {
      messageId: value.messageId,
      rollRevision: value.rollRevision,
      faces: rolled,
      total: value.total,
      available: typeof value.available === "number" ? value.available : null,
    },
  };
}
