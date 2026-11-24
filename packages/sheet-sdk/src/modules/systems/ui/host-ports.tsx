"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * A capability the host app lends to sheet code: a backend write, a route, a licensed engine.
 * Sheet code (the renderer, rolls, print, plugins) names what it needs with a port and reads it
 * with `useHostPort`; the app registers the implementations once (`HostPortsProvider`). A host
 * that lacks one (the local previewer, a test) leaves it out, and its consumer shows that the
 * feature is unavailable instead of reaching a backend it does not have.
 */
export interface HostPort<T> {
  readonly id: string;
  /** Carries `T` for type inference only; never set. */
  readonly __value?: T;
}

export function defineHostPort<T>(id: string): HostPort<T> {
  return { id };
}

/** One registration: the port and the host's implementation of it. */
export interface HostPortBinding {
  readonly id: string;
  readonly value: unknown;
}

export function bindHostPort<T>(port: HostPort<T>, value: T): HostPortBinding {
  return { id: port.id, value };
}

const HostPortsContext = createContext<ReadonlyMap<string, unknown>>(new Map());

/**
 * Registers `ports` for the tree below, on top of the enclosing provider's (an inner binding of
 * the same port wins). Pass a stable array (a module constant): a new array re-renders every
 * consumer.
 */
export function HostPortsProvider({ ports, children }: { ports: readonly HostPortBinding[]; children: ReactNode }) {
  const parent = useContext(HostPortsContext);
  const value = useMemo(() => {
    const merged = new Map(parent);
    for (const binding of ports) merged.set(binding.id, binding.value);
    return merged;
  }, [parent, ports]);
  return <HostPortsContext.Provider value={value}>{children}</HostPortsContext.Provider>;
}

const reportedMissing = new Set<string>();

/**
 * The host's implementation of `port`, or null when this host registers none. The consumer must
 * then show the feature as unavailable. In development an unregistered read is logged once per
 * port, so a host that forgot a registration finds out.
 */
export function useHostPort<T>(port: HostPort<T>): T | null {
  const ports = useContext(HostPortsContext);
  if (!ports.has(port.id)) {
    if (process.env.NODE_ENV === "development" && !reportedMissing.has(port.id)) {
      reportedMissing.add(port.id);
      console.error(`[host-ports] "${port.id}" is not registered; its feature shows as unavailable.`);
    }
    return null;
  }
  return ports.get(port.id) as T;
}
