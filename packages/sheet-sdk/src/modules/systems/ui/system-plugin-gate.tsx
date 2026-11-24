"use client";

import type { ReactNode } from "react";
import { useSystemPluginUi } from "./system-plugin-provider";
import { SystemPluginLoad, type SystemPluginGateSystem } from "./system-plugin-load";

export type { SystemPluginGateSystem } from "./system-plugin-load";

/**
 * Renders `children` once the plugin UI and messages of `system` that load on demand are in,
 * with them added to the catalog below. Mount it around anything that runs a character of a
 * System (sheet runtime, session panel, floating sheet, render preview): an adapter is a hook,
 * so it has to be present on the first render. Systems whose plugin UI is static pass through.
 * Hosts that only render fields mount `SystemPluginRenderGate`. Kept apart from the provider
 * module, which the root layout loads.
 */
export function SystemPluginGate({
  system,
  fallback = null,
  children,
}: {
  system: SystemPluginGateSystem;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { lazyRenderUi, lazyRuntimeUi, preloadClientSystemMessages } = useSystemPluginUi();
  return (
    <SystemPluginLoad
      system={system}
      lazyRenderUi={lazyRenderUi}
      lazyRuntimeUi={lazyRuntimeUi}
      preloadMessages={preloadClientSystemMessages}
      fallback={fallback}
    >
      {children}
    </SystemPluginLoad>
  );
}
