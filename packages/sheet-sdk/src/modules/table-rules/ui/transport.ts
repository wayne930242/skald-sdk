import { defineHostPort } from "@skald/sheet-sdk/modules/systems/ui/host-ports";
import type { TableRulesTransport } from "../domain/contracts";

/**
 * The table a session's rules run at. The session's table rules host registers it for the slots
 * it mounts; without it (a host with no tables) views read as `unavailable` and commands stay
 * read-only.
 */
export const tableRulesTransport = defineHostPort<TableRulesTransport>("tableRulesTransport");
