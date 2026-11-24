import type { SimpleDiceRoll, SkillCheckRoll } from "@skald/dice";
import type {
  TableRulesCharacterScope,
  TableRulesCommand,
  TableRulesErrorCode,
  TableRulesReceipt,
  TableRulesResult,
  TableRulesTransport,
} from "../domain/contracts";

/** Who sees a table roll. A follow-up always has its root's audience (the server enforces it). */
export type TableRollAudience = "all" | "gm";

/** The chat row a roll RPC wrote (`table_rules_post_message`), the durable root of its follow-ups. */
export interface TableRollPosted {
  readonly messageId: string;
}

/** A root roll for a plugin's roll RPC. */
export interface TableRollRoot<Details> {
  readonly audience: TableRollAudience;
  /** The built roll; the server overwrites who rolled, as whom and for whom. */
  readonly diceData: SimpleDiceRoll | SkillCheckRoll;
  /** The plugin's own part of the command (what it spends, what it invokes), sent as `p_payload`. */
  readonly details: Details;
}

export interface TableRollFollowUp<Details> extends TableRollRoot<Details> {
  /** The root's `messageId`. */
  readonly followUpOf: string;
}

/** A roll RPC's committed result: at least the chat row, plus whatever the plugin returns with it. */
export type TableRollResult = TableRollPosted & Readonly<Record<string, unknown>>;

/**
 * Rolls for one character at one table, through the plugin's own SECURITY DEFINER RPC. Every roll
 * RPC takes `(p_table_id, p_character_id, p_operation_id, p_audience, p_dice_data, p_follow_up_of,
 * p_payload)`, posts through `table_rules_post_message` and commits its effects and receipt in the
 * same transaction. Resend an uncertain command with the same `operationId` and payload.
 */
export interface TableRollPort {
  readonly scope: TableRulesCharacterScope;
  postRoot<Details>(
    rpc: string,
    command: TableRulesCommand<TableRollRoot<Details>>,
  ): Promise<TableRulesResult<TableRulesReceipt<TableRollResult>>>;
  publishFollowUp<Details>(
    rpc: string,
    command: TableRulesCommand<TableRollFollowUp<Details>>,
  ): Promise<TableRulesResult<TableRulesReceipt<TableRollResult>>>;
}

/** A refused table command, thrown where the caller's API is a promise (a roll's `deliver`). */
export class TableRulesError extends Error {
  constructor(readonly code: TableRulesErrorCode) {
    super(`table_rules:${code}`);
    this.name = "TableRulesError";
  }
}

const audiences = new Set<string>(["all", "gm"]);

function isRollResult(value: unknown): value is TableRollResult {
  return typeof value === "object" && value !== null
    && typeof (value as { messageId?: unknown }).messageId === "string"
    && (value as { messageId: string }).messageId !== "";
}

/**
 * The roll port for `scope` over the host's transport (`tableRulesTransport`). Without one every
 * roll is refused as `unavailable`, so it never reaches chat another way.
 */
export function createTableRollPort(scope: TableRulesCharacterScope, transport: Pick<TableRulesTransport, "call"> | null): TableRollPort {
  const send = async <Details>(
    rpc: string,
    command: TableRulesCommand<TableRollRoot<Details>>,
    followUpOf: string | null,
  ): Promise<TableRulesResult<TableRulesReceipt<TableRollResult>>> => {
    const { operationId, payload } = command;
    if (!audiences.has(payload.audience)) return { ok: false, code: "invalid" };
    if (!transport) return { ok: false, code: "unavailable" };
    const result = await transport.call(rpc, {
      p_table_id: scope.tableId,
      p_character_id: scope.characterId,
      p_operation_id: operationId,
      p_audience: payload.audience,
      p_dice_data: payload.diceData,
      p_follow_up_of: followUpOf,
      p_payload: payload.details ?? null,
    });
    if (!result.ok) return result;
    if (!isRollResult(result.value)) return { ok: false, code: "invalid" };
    return {
      ok: true,
      value: { tableId: scope.tableId, actorId: scope.userId, operationId, result: result.value },
    };
  };
  return {
    scope,
    postRoot: (rpc, command) => send(rpc, command, null),
    publishFollowUp: (rpc, command) => send(rpc, command, command.payload.followUpOf),
  };
}

/** What `tableRollDelivery` posts besides the roll. */
export interface TableRollDeliveryCommand<Details> {
  readonly rpc: string;
  readonly operationId: string;
  readonly details: Details;
  /** Present for a follow-up: the root's `messageId`. */
  readonly followUpOf?: string;
}

/**
 * A roll `deliver` (Rolls' `ExecuteRollOptions.deliver`) that posts the built roll through this
 * port, to the roll's own audience. A refusal throws `TableRulesError`, so the roll rejects instead
 * of reaching chat another way; `unavailable` means the outcome is unknown and the same command
 * may be resent.
 */
export function tableRollDelivery<Details>(
  port: TableRollPort,
  command: TableRollDeliveryCommand<Details>,
  onPosted?: (result: TableRollResult) => void,
): (roll: SimpleDiceRoll | SkillCheckRoll) => Promise<TableRollPosted> {
  return async (roll) => {
    if (!audiences.has(roll.visibility)) throw new TableRulesError("invalid");
    const payload = { audience: roll.visibility as TableRollAudience, diceData: roll, details: command.details };
    const posted = command.followUpOf === undefined
      ? await port.postRoot(command.rpc, { operationId: command.operationId, payload })
      : await port.publishFollowUp(command.rpc, {
          operationId: command.operationId,
          payload: { ...payload, followUpOf: command.followUpOf },
        });
    if (!posted.ok) throw new TableRulesError(posted.code);
    onPosted?.(posted.value.result);
    return { messageId: posted.value.result.messageId };
  };
}
