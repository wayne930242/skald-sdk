"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import type { TableRulesCharacterScope, TableRulesErrorCode, TableRulesScope } from "../domain/contracts";
import { tableRulesTransport } from "./transport";

export interface TableRulesViewOptions<View> {
  /** The plugin's view RPC; it receives `p_table_id` plus `args` and must authorize the caller itself. */
  readonly rpc: string;
  readonly args?: Readonly<Record<string, unknown>>;
  /** Narrow the RPC's JSON to the view; throw to report `invalid`. */
  readonly parse?: (raw: unknown) => View;
  readonly enabled?: boolean;
}

export type TableRulesViewState<View> =
  | { readonly status: "loading"; readonly view?: undefined }
  | { readonly status: "ready"; readonly view: View }
  /** `unavailable` keeps the last view (stale); any other code clears it. */
  | { readonly status: "error"; readonly code: TableRulesErrorCode; readonly detail?: string; readonly view?: View };

/** Everything that changes what the viewer may see. A change drops the cached view. */
export function tableRulesViewScopeKey(scope: TableRulesScope | TableRulesCharacterScope): string {
  const { viewer } = scope;
  return JSON.stringify([
    scope.tableId, scope.systemSlug, scope.userId,
    viewer.isOwner, viewer.isGmRunner, viewer.canManageSettings, viewer.isSpectator, [...viewer.controlledCharacterIds].sort(),
    [...scope.readableCharacterIds].sort(),
    "characterId" in scope ? [scope.characterId, scope.canControl] : null,
  ]);
}

const NO_TRANSPORT: TableRulesViewState<never> = Object.freeze({ status: "error", code: "unavailable" });

/**
 * Subscribe to the viewer's invalidation channel first, read once it is joined (and on every rejoin),
 * and reread on each invalidation. Later reads win; a read from an old scope is dropped. Without the
 * host's `tableRulesTransport` the view is `unavailable` and nothing is read.
 */
export function useTableRulesView<View>(
  scope: TableRulesScope | TableRulesCharacterScope,
  options: TableRulesViewOptions<View>,
): TableRulesViewState<View> & { readonly stale: boolean; readonly refresh: () => void } {
  const transport = useHostPort(tableRulesTransport);
  const { rpc, enabled = true } = options;
  const scopeKey = tableRulesViewScopeKey(scope);
  const argsKey = JSON.stringify(options.args ?? {});
  const latest = useRef(options);
  const [state, setState] = useState<{ key: string; value: TableRulesViewState<View> }>(
    () => ({ key: scopeKey, value: { status: "loading" } }),
  );
  const { tableId, userId } = scope;
  const key = `${scopeKey}|${rpc}|${argsKey}|${enabled}`;
  const currentKey = useRef(key);
  // Before any passive effect of this commit reads them.
  useLayoutEffect(() => {
    latest.current = options;
    currentKey.current = key;
  });
  const sequence = useRef(0);
  const joined = useRef(false);

  const read = useCallback(async () => {
    if (!transport) return;
    const readKey = currentKey.current;
    const mine = ++sequence.current;
    const { rpc: name, args, parse } = latest.current;
    const result = await transport.call(name, { ...args, p_table_id: tableId });
    // A newer read, a scope change or an unmount since: drop this result.
    if (mine !== sequence.current || readKey !== currentKey.current) return;
    let next: TableRulesViewState<View>;
    if (result.ok) {
      try {
        next = { status: "ready", view: parse ? parse(result.value) : (result.value as View) };
      } catch {
        next = { status: "error", code: "invalid" };
      }
    } else {
      next = { status: "error", code: result.code, ...(result.detail === undefined ? {} : { detail: result.detail }) };
    }
    setState((previous) => {
      if (next.status === "error" && next.code === "unavailable" && previous.key === readKey && previous.value.view !== undefined) {
        return { key: readKey, value: { ...next, view: previous.value.view } };
      }
      return { key: readKey, value: next };
    });
  }, [tableId, transport]);

  // The channel depends only on the table and user, so a scope change on it keeps the join.
  useEffect(() => {
    if (!enabled || !transport) return;
    joined.current = false;
    const reads = sequence;
    const unsubscribe = transport.subscribeInvalidation({ tableId, userId }, {
      onReady: () => { joined.current = true; void read(); },
      onInvalidate: () => { if (joined.current) void read(); },
      onError: () => {
        joined.current = false;
        sequence.current++;
        const errorKey = currentKey.current;
        setState((previous) => ({
          key: errorKey,
          value: { status: "error", code: "unavailable", view: previous.key === errorKey ? previous.value.view : undefined },
        }));
      },
    });
    return () => {
      joined.current = false;
      reads.current++;
      unsubscribe();
    };
  }, [tableId, userId, enabled, read, transport]);

  // Any other scope change drops the cached view and rereads on the joined channel.
  const firstKey = useRef(true);
  useEffect(() => {
    if (firstKey.current) { firstKey.current = false; return; }
    // The render already shows `loading` for a key without its own state; drop older reads.
    sequence.current++;
    if (enabled && joined.current) void read();
  }, [key, enabled, read]);

  const refresh = useCallback(() => { if (joined.current) void read(); }, [read]);
  // A render between a scope change and its effect must not show the previous scope's view.
  const value: TableRulesViewState<View> = !transport ? NO_TRANSPORT : state.key === key ? state.value : { status: "loading" };
  return { ...value, stale: value.status === "error" && value.view !== undefined, refresh };
}
