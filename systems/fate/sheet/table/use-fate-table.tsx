"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { useRollOptional } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import type { FateWallet } from "../../table-rules/domain/view";
import { fateTableReadsPort, type FateCarryOutRead, type FateCopyActivation, type FateTableReads } from "./table-reads-port";
import { useFateTableLink, type FateTableLink } from "./table-bridge";

/**
 * How the sheet treats what the table owns (fate points, invokes):
 *   `v2`       the sheet's own behaviour (outside a session, a vault card, an inactive table).
 *              `checking`: in a session, the copy's activation is still being read for the first
 *              time; the sheet's controls stay as they are, and a roll waits for the answer.
 *   `table`    the table runs it: rolls and invokes through the port, the wallet is the balance;
 *   `readOnly` a running table holds this copy but the sheet cannot reach it (a floating card,
 *              the slot not loaded, the read failed): show, never write.
 */
export type FateTableMode =
  | { readonly kind: "v2"; readonly checking?: Promise<FateCopyActivation> }
  | { readonly kind: "table"; readonly link: FateTableLink & { readonly view: NonNullable<FateTableLink["view"]> }; readonly wallet?: FateWallet }
  | { readonly kind: "readOnly"; readonly reason: "unavailable" | "elsewhere" };

const V2: FateTableMode = Object.freeze({ kind: "v2" });

/**
 * One read per character for the whole page (every sheet of it, every remount), kept until the
 * session's link for it changes (a failed read too: it is read again then, not on each render).
 */
const activations = new Map<string, { readonly key: string; readonly promise: Promise<FateCopyActivation>; value?: FateCopyActivation }>();

function readActivation(reads: FateTableReads, characterId: string, key: string) {
  const cached = activations.get(characterId);
  if (cached && cached.key === key) return cached;
  const entry: { key: string; promise: Promise<FateCopyActivation>; value?: FateCopyActivation } = {
    key,
    promise: reads.readCopyActivation(characterId).then((value) => {
      entry.value = value;
      return value;
    }),
  };
  activations.set(characterId, entry);
  return entry;
}

/** Test seam: forget every cached activation. */
export function resetFateCopyActivations() {
  activations.clear();
}

/**
 * Whether a running table holds this copy, read only inside a table session (where a copy can be
 * at a table at all), once per character and again when the session's link for it changes.
 */
function useCopyActivation(reads: FateTableReads | null, characterId: string | undefined, linkStatus: string | undefined) {
  const key = linkStatus ?? "";
  const entry = reads && characterId ? readActivation(reads, characterId, key) : null;
  const [, setSettled] = useState(0);
  useEffect(() => {
    if (!entry || entry.value) return;
    let live = true;
    void entry.promise.then(() => { if (live) setSettled((value) => value + 1); });
    return () => { live = false; };
  }, [entry]);
  return entry;
}

function useFateTableModeValue(): FateTableMode {
  const roll = useRollOptional();
  // A host without tables (no port): no copy can be at a table, so the sheet keeps its own behaviour.
  const reads = useHostPort(fateTableReadsPort);
  const inSession = !!roll?.isInSession && !!roll.characterId && !!reads;
  const characterId = inSession ? roll?.characterId : undefined;
  const link = useFateTableLink(characterId);
  const copy = useCopyActivation(reads, characterId, link ? `${link.status}:${link.view?.activation.status}:${link.view?.activation.revision}` : undefined);
  if (!characterId || !copy) return V2;
  // The session's link is the fresher read (it hears the table's invalidations).
  if (link?.view && (link.status === "ready" || link.status === "error")) {
    if (link.view.activation.status !== "active") return link.status === "ready" ? V2 : { kind: "readOnly", reason: "unavailable" };
    if (link.status === "error") return { kind: "readOnly", reason: "unavailable" };
    const wallet = link.view.wallets.find((row) => row.characterId === characterId);
    return { kind: "table", link: link as FateTableLink & { view: NonNullable<FateTableLink["view"]> }, ...(wallet ? { wallet } : {}) };
  }
  const value = copy.value;
  // Not known yet (or the session's link is still loading): as before, and a roll waits.
  if (!value || (value.status === "active" && link)) return { kind: "v2", checking: copy.promise };
  if (value.status === "free") return V2;
  if (value.status === "error") return { kind: "readOnly", reason: "unavailable" };
  // Active, and no link: this copy is shown outside the session's sheet slot.
  return { kind: "readOnly", reason: "elsewhere" };
}

const FateTableModeContext = createContext<FateTableMode>(V2);

/** Reads the mode once for the whole sheet (one activation read), for every part below. DOM-less. */
export function FateTableModeProvider({ children }: { children: ReactNode }) {
  const mode = useFateTableModeValue();
  const link = mode.kind === "table" ? mode.link : undefined;
  const wallet = mode.kind === "table" ? mode.wallet : undefined;
  const reason = mode.kind === "readOnly" ? mode.reason : undefined;
  const checking = mode.kind === "v2" ? mode.checking : undefined;
  const value = useMemo<FateTableMode>(() => mode, [mode.kind, link, wallet, reason, checking]); // eslint-disable-line react-hooks/exhaustive-deps
  return <FateTableModeContext.Provider value={value}>{children}</FateTableModeContext.Provider>;
}

/** The sheet's table mode; `v2` without the provider (a field-only host, a test of one part). */
export function useFateTableMode(): FateTableMode {
  return useContext(FateTableModeContext);
}

/** True while the sheet must not write fate points or record an invoke on its own. */
export const fateTableOwnsPoints = (mode: FateTableMode) => mode.kind !== "v2";

/**
 * A roll asked for while the copy's activation is still out: the answer decides the mode. With
 * no session link a running table means the sheet cannot reach it (read-only).
 */
export async function settleFateTableMode(mode: FateTableMode): Promise<"v2" | "readOnly" | "unavailable"> {
  if (mode.kind !== "v2" || !mode.checking) return mode.kind === "readOnly" ? "readOnly" : "v2";
  const value = await mode.checking;
  return value.status === "free" ? "v2" : value.status === "error" ? "unavailable" : "readOnly";
}

/**
 * The card owner's booked balance. Refresh when the session changes whether the wallet is
 * settled, or when a settled wallet changes. The snapshot RPC still decides eligibility.
 */
export function useFateCarryOut(characterId: string | undefined, enabled: boolean) {
  const [state, setState] = useState<{ key: string; value: FateCarryOutRead } | null>(null);
  const [version, setVersion] = useState(0);
  const link = useFateTableLink(enabled ? characterId : undefined);
  const view = link?.status === "ready" ? link.view : undefined;
  const sceneId = view?.scene?.id;
  const settledRevision = view && !sceneId ? view.revision : undefined;
  const key = `${characterId ?? ""}:${link?.tableId ?? ""}:${view?.activation.revision ?? ""}:${sceneId ?? ""}:${settledRevision ?? ""}:${version}`;
  const reads = useHostPort(fateTableReadsPort);
  const asks = enabled && !!characterId && !!reads;
  useEffect(() => {
    if (!asks || !characterId || !reads) return;
    let live = true;
    void reads.readCarryOut(characterId).then((value) => {
      if (live) setState({ key, value });
    });
    return () => { live = false; };
  }, [characterId, asks, key, reads]);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  const value: FateCarryOutRead | "loading" | null = !asks ? null : state?.key === key ? state.value : "loading";
  return { read: value, refresh };
}
