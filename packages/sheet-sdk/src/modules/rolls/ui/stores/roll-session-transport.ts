import { useEffect } from "react";
import { useHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import { corePorts, type RollSessionTransport } from "@skald/sheet-sdk/modules/systems/ui/core-ports";

/** The host's transports, innermost last (`RollSessionTransportBinding`); the last one posts. */
const transports: RollSessionTransport[] = [];

/** The transport the session's rolls go through now, or null when the host binds none. */
export function currentRollSessionTransport(): RollSessionTransport | null {
  return transports.at(-1) ?? null;
}

/**
 * Makes `transport` post the session's rolls until the returned function unbinds it. The roll
 * session store is read outside React (a plugin's sheet writes), so the host port is bound here.
 */
export function bindRollSessionTransport(transport: RollSessionTransport): () => void {
  transports.push(transport);
  return () => {
    const index = transports.lastIndexOf(transport);
    if (index !== -1) transports.splice(index, 1);
  };
}

/** Binds the host's `rollSessionSender` port while mounted; renders nothing. */
export function RollSessionTransportBinding(): null {
  const transport = useHostPort(corePorts.rollSessionSender);
  useEffect(() => (transport ? bindRollSessionTransport(transport) : undefined), [transport]);
  return null;
}
