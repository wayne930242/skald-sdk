import type { Schema } from "@skald/types/schema";

/** Display capabilities only. An authorized server read or command must recheck them. */
export interface TableRulesViewer {
  readonly isOwner: boolean;
  readonly isGmRunner: boolean;
  readonly canManageSettings: boolean;
  readonly controlledCharacterIds: readonly string[];
  readonly isSpectator: boolean;
}

export interface TableRulesScope {
  readonly tableId: string;
  readonly systemSlug: string;
  readonly userId: string;
  readonly locale: string;
  readonly viewer: TableRulesViewer;
  readonly readableCharacterIds: readonly string[];
}

export interface TableRulesCharacterScope extends TableRulesScope {
  readonly characterId: string;
  readonly canControl: boolean;
}

/** Derived from the viewer's own membership and its visible links, never sheet edit access. */
export function tableRulesViewer(
  isOwner: boolean,
  member?: { readonly status: string; readonly role: string; readonly characterIds: readonly string[] },
): TableRulesViewer | null {
  const approved = member?.status === "approved";
  if (!isOwner && !approved) return null;
  const isSpectator = !isOwner && member?.role === "spectator";
  return {
    isOwner,
    isGmRunner: isOwner || (approved && member?.role === "gm_assistant"),
    canManageSettings: isOwner,
    controlledCharacterIds: approved && !isSpectator ? member.characterIds : [],
    isSpectator,
  };
}

/** An authorized server projection, not client-side redaction. Omit private IDs and existence too. */
export interface SecretProjection<Public, Private> {
  readonly public: readonly Public[];
  readonly gmOnly?: readonly Private[];
}

/** Only visible resources are returned; unavailable and unauthorized are not interchangeable. */
export interface TableResource<Value = number> {
  readonly id: string;
  readonly unit: string;
  readonly canView: true;
  readonly canOperate: boolean;
  readonly revision: number;
  readonly value: Value;
}

export interface TableRulesCommand<Payload> {
  /** Reuse this ID on uncertain delivery, with the original payload. */
  readonly operationId: string;
  readonly payload: Payload;
}

/**
 * Unique by (tableId, actorId, operationId). Same command returns this committed receipt;
 * changed payload conflicts. Commit side effects and the receipt together, and reauthorize replay.
 */
export interface TableRulesReceipt<Result> {
  readonly tableId: string;
  readonly actorId: string;
  readonly operationId: string;
  readonly result: Result;
}

export type TableRulesErrorCode = "forbidden" | "not_found" | "conflict" | "invalid" | "unavailable";
export type TableRulesResult<Value, Code extends string = TableRulesErrorCode> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly code: Code; readonly detail?: string };

/** What a subscriber to a viewer's invalidation channel hears. */
export interface TableRulesInvalidationHandlers {
  /** Joined or rejoined: read now, since invalidations sent while away are lost. */
  onReady(): void;
  onInvalidate(): void;
  onError?(): void;
}

/** A command sent and not yet confirmed: resent with the same operation ID and arguments. */
export interface PendingTableRulesCommand {
  readonly operationId: string;
  readonly args: Record<string, unknown>;
  inFlight?: Promise<TableRulesResult<unknown>>;
}

/** The unconfirmed commands of the signed-in user, and the call that delivers them. */
export interface TableRulesCommandStore {
  readonly pending: Map<string, PendingTableRulesCommand>;
  call(rpc: string, args: Record<string, unknown>): Promise<TableRulesResult<unknown>>;
}

/**
 * How table rules code reaches its table: a plugin's named RPCs, called as the signed-in user (the
 * server derives the actor and authorizes the call), and the viewer's invalidation channel.
 */
export interface TableRulesTransport {
  /** Calls a plugin's RPC; a failure maps to a contract code (`unavailable` when the outcome is unknown). */
  call(rpc: string, args: Record<string, unknown>): Promise<TableRulesResult<unknown>>;
  /** Joins the viewer's invalidation channel for the table; returns the leave. */
  subscribeInvalidation(
    channel: { readonly tableId: string; readonly userId: string },
    handlers: TableRulesInvalidationHandlers,
  ): () => void;
  /**
   * The unconfirmed commands of `userId`. One user is signed in at a time: asking for another
   * drops the previous user's commands.
   */
  commandStore(userId: string): TableRulesCommandStore;
}

export interface TableOfferTarget {
  readonly userId: string;
  readonly characterId: string;
}

export type TableOfferTerminal = "accepted" | "refused" | "withdrawn" | "expired";

export type TableOffer<Details> = {
  readonly id: string;
  readonly target: TableOfferTarget;
  readonly revision: number;
  readonly details: Details;
} & (
  | { readonly status: "pending" }
  | { readonly status: TableOfferTerminal; readonly terminalOperationId: string }
);

/** Pure transition; a server implementation must check audience, lock the row and commit atomically. */
export function settleTableOffer<Details>(
  offer: TableOffer<Details>,
  terminal: TableOfferTerminal,
  operationId: string,
): TableRulesResult<TableOffer<Details>, "conflict"> {
  if (offer.status !== "pending") return { ok: false, code: "conflict" };
  return {
    ok: true,
    value: { ...offer, status: terminal, revision: offer.revision + 1, terminalOperationId: operationId },
  };
}

export interface TableScene {
  readonly id: string;
  /** In-play session ID, not the scheduling event ID. */
  readonly playSessionId: string;
  readonly status: "open" | "closed";
  readonly revision: number;
}

export interface TableRulesPreview<Details> {
  readonly token: string;
  readonly details: Details;
}

/** The server rechecks the opaque preview token, version and any plugin-specific choices. */
export interface TableRulesConfirmation {
  readonly previewToken: string;
}

export type TableSceneChange =
  | { readonly kind: "open"; readonly playSessionId: string }
  | { readonly kind: "close"; readonly sceneId: string };

export interface TableSceneSettlementPort<
  Preview,
  Result,
  Change extends TableSceneChange = TableSceneChange,
  Confirmation extends TableRulesConfirmation = TableRulesConfirmation,
> {
  preview(change: Change): Promise<TableRulesResult<TableRulesPreview<Preview>>>;
  confirm(command: TableRulesCommand<Confirmation>): Promise<TableRulesResult<TableRulesReceipt<Result>>>;
}

export type TableRulesActivation =
  | { readonly status: "inactive"; readonly revision: number }
  | { readonly status: "active"; readonly revision: number; readonly protocolVersion: number };

/** The server reauthorizes the table owner for all operations, including retries. Initial seeding runs once between scenes. */
export interface TableRulesActivationPort<Preview, Confirmation extends TableRulesConfirmation = TableRulesConfirmation> {
  previewActivation(): Promise<TableRulesResult<TableRulesPreview<Preview>>>;
  confirmActivation(command: TableRulesCommand<Confirmation>): Promise<TableRulesResult<TableRulesReceipt<TableRulesActivation>>>;
  deactivate(command: TableRulesCommand<TableRulesDeactivation>): Promise<TableRulesResult<TableRulesReceipt<TableRulesActivation>>>;
}

export interface TableRulesDeactivation {
  /** Reject a stale command rather than disabling a newer activation. */
  readonly expectedRevision: number;
}

/** Reconciliation input for Character, authorized for the card owner. Any snapshot comes from the authoritative settled view. */
export type CarryOut<SettledSnapshot> = {
  readonly characterId: string;
  readonly expectedCharacterRevision: number;
} & (
  | { readonly choice: "keep-vault-value" }
  | { readonly choice: "include-settled"; readonly snapshot: SettledSnapshot }
);

export interface TablePartySummaryRow {
  /** Stable within a character. */
  readonly id: string;
  /** Resolve this key against the table-rules registration's locale catalog, not the character's template. */
  readonly labelKey: string;
  readonly value: string | number;
  readonly max?: number;
  /** Optional emphasis for a status row; absent means neutral. The renderer maps it to its own styles. */
  readonly tone?: "warn" | "risk";
}

/** Pure selector; the caller supplies only authorized character data with its own schema version. */
export type TablePartySummary = (
  characterData: Readonly<Record<string, unknown>>,
  schema: Readonly<Schema>,
) => readonly TablePartySummaryRow[];

/**
 * Port bound server-side to an authenticated actor and table. Every method rechecks current access;
 * resolve the system from the persisted table, not from browser scope. Secret storage stays separate;
 * reveal is a single command/transaction, and invalidation never carries private content or IDs.
 */
export interface TableRulesPort<View, Command, Result, Code extends string = TableRulesErrorCode> {
  readView(): Promise<TableRulesResult<View, Code>>;
  subscribeInvalidation(onInvalidate: () => void): () => void;
  execute(command: TableRulesCommand<Command>): Promise<TableRulesResult<TableRulesReceipt<Result>, Code>>;
}
