"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import type {
  PendingTableRulesCommand,
  TableRulesCommandStore,
  TableRulesErrorCode,
  TableRulesReceipt,
  TableRulesResult,
  TableRulesScope,
} from "../domain/contracts";
import { tableRulesTransport } from "./transport";

export interface TableRulesCommandOptions<Payload, Result> {
  /** The plugin's command RPC; it receives `p_table_id`, `p_operation_id` and `args(payload)`. */
  readonly rpc: string;
  readonly args: (payload: Payload) => Readonly<Record<string, unknown>>;
  readonly parse?: (raw: unknown) => Result;
  /** Stable intent within this table, actor and RPC. Omit for a command tied to this mount. */
  readonly intentKey?: string;
  /** Disallow delivery and replay while the caller's authoritative view is unavailable. */
  readonly enabled?: boolean;
  /** Automatic resends before waiting for `retry()`, reconnect or remount. */
  readonly maxAutoRetries?: number;
  readonly retryDelayMs?: number;
}

export type TableRulesCommandStatus =
  | { readonly status: "idle" }
  | { readonly status: "confirming"; readonly operationId: string }
  | { readonly status: "failed"; readonly code: Exclude<TableRulesErrorCode, "unavailable">; readonly detail?: string };

export type TableRulesCommandState<Payload, Result> = TableRulesCommandStatus & {
  /** Offline, disabled, or an earlier command is unconfirmed. */
  readonly readOnly: boolean;
  run(payload: Payload): Promise<TableRulesResult<TableRulesReceipt<Result>>>;
  /** Resend the unconfirmed command with its original operation ID and arguments. */
  retry(): Promise<TableRulesResult<TableRulesReceipt<Result>>> | undefined;
};

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

interface Binding {
  readonly key: string;
  readonly tableId: string;
  readonly userId: string;
  readonly store: TableRulesCommandStore;
  active: boolean;
}

/**
 * The store holds frozen RPC arguments, never a component's callback or props. Without the host's
 * `tableRulesTransport` the command is read-only and `run` answers `unavailable`.
 */
export function useTableRulesCommand<Payload, Result>(
  scope: TableRulesScope,
  options: TableRulesCommandOptions<Payload, Result>,
): TableRulesCommandState<Payload, Result> {
  const mountId = useId();
  const transport = useHostPort(tableRulesTransport);
  const { rpc, intentKey, enabled = true } = options;
  const { tableId, userId } = scope;
  const key = JSON.stringify([tableId, userId, rpc, intentKey ?? null, intentKey === undefined ? mountId : null]);
  const binding = useRef<Binding | undefined>(undefined);
  const latest = useRef({ scope, options });
  const [snapshot, setSnapshot] = useState<{ binding: Binding; value: TableRulesCommandStatus }>();
  const [online, setOnline] = useState(isOnline);

  useLayoutEffect(() => { latest.current = { scope, options }; });
  useLayoutEffect(() => {
    const previous = binding.current;
    if (!transport) {
      binding.current = undefined;
      return;
    }
    const store = transport.commandStore(userId);
    if (previous && (previous.tableId !== tableId || previous.userId !== userId)) previous.store.pending.delete(previous.key);
    const current: Binding = { key, tableId, userId, store, active: true };
    binding.current = current;
    // A change in readable IDs or capabilities must not allow a second spend. The server
    // reauthorizes the original command and its receipt when the new view enables retry.
    const retained = store.pending.get(key);
    setSnapshot({ binding: current, value: retained ? { status: "confirming", operationId: retained.operationId } : { status: "idle" } });
    return () => {
      current.active = false;
      if (intentKey === undefined) store.pending.delete(key);
    };
  }, [key, tableId, intentKey, userId, transport]);

  const send = useCallback(async (current: Binding, command: PendingTableRulesCommand): Promise<TableRulesResult<TableRulesReceipt<Result>>> => {
    const { scope: { tableId, userId }, options: { rpc, parse, maxAutoRetries = 3, retryDelayMs = 1500 } } = latest.current;
    const stillPending = () => current.store.pending.get(current.key) === command;
    const canSend = () => current.active && stillPending() && isOnline() && latest.current.options.enabled !== false;
    if (!canSend()) return { ok: false, code: "unavailable" };

    const deliver = () => {
      if (command.inFlight) return command.inFlight;
      // Even unmounted, settle a completed in-flight send; only an unknown outcome is retained.
      const delivery = current.store.call(rpc, command.args).then((result) => {
        command.inFlight = undefined;
        if ((result.ok || result.code !== "unavailable") && stillPending()) current.store.pending.delete(current.key);
        return result;
      });
      command.inFlight = delivery;
      return delivery;
    };
    let raw = await deliver();
    for (let tries = 0; !raw.ok && raw.code === "unavailable" && tries < maxAutoRetries && canSend(); tries++) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * 2 ** tries));
      if (!canSend()) break;
      raw = await deliver();
    }
    let result: TableRulesResult<TableRulesReceipt<Result>>;
    if (!raw.ok) result = raw;
    else {
      try {
        const value = parse ? parse(raw.value) : raw.value as Result;
        result = { ok: true, value: { tableId, actorId: userId, operationId: command.operationId, result: value } };
      } catch { result = { ok: false, code: "invalid" }; }
    }
    if (current.active) {
      const pending = current.store.pending.get(current.key);
      const value: TableRulesCommandStatus = pending
        ? { status: "confirming", operationId: pending.operationId }
        : result.ok || result.code === "unavailable" ? { status: "idle" }
          : { status: "failed", code: result.code, ...(result.detail === undefined ? {} : { detail: result.detail }) };
      setSnapshot({ binding: current, value });
    }
    return result;
  }, []);

  const run = useCallback(async (payload: Payload): Promise<TableRulesResult<TableRulesReceipt<Result>>> => {
    const current = binding.current;
    const { scope: { tableId }, options: { enabled, args } } = latest.current;
    if (!current?.active || !isOnline() || enabled === false) return { ok: false, code: "unavailable" };
    if (current.store.pending.has(current.key)) return { ok: false, code: "conflict" };
    const operationId = globalThis.crypto.randomUUID();
    const command = {
      operationId,
      args: { ...args(payload), p_table_id: tableId, p_operation_id: operationId },
    };
    current.store.pending.set(current.key, command);
    setSnapshot({ binding: current, value: { status: "confirming", operationId } });
    return send(current, command);
  }, [send]);

  const retry = useCallback(() => {
    const current = binding.current;
    const command = current?.store.pending.get(current.key);
    if (current?.active && command && latest.current.options.enabled !== false && isOnline()) return send(current, command);
  }, [send]);

  useEffect(() => {
    const update = () => setOnline(isOnline());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (online && enabled) void retry();
  }, [key, online, enabled, retry]);

  const status = snapshot?.binding.key === key ? snapshot.value : { status: "idle" } as const;
  return { ...status, readOnly: !transport || !enabled || !online || status.status === "confirming", run, retry };
}
