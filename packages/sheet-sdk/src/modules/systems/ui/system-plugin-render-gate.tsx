"use client";

import type { ReactNode } from "react";
import { useSystemPluginUi } from "./system-plugin-provider";
import { SystemPluginLoad, type PreloadSystemMessages, type SystemPluginGateSystem } from "./system-plugin-load";

/**
 * `SystemPluginGate` for hosts that render a System's fields but run no sheet (the character
 * wizard, the template editor): it loads the System's on-demand field renderers, and its
 * on-demand messages when the host passes their loader, before `children` render. It reads only
 * the render provider, so those hosts need no sheet runtime provider.
 */
export function SystemPluginRenderGate({
  system,
  preloadMessages,
  fallback = null,
  children,
}: {
  system: SystemPluginGateSystem;
  preloadMessages?: PreloadSystemMessages;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { lazyRenderUi } = useSystemPluginUi();
  return (
    <SystemPluginLoad
      system={system}
      lazyRenderUi={lazyRenderUi}
      preloadMessages={preloadMessages}
      fallback={fallback}
      failedMessage="pluginFieldsLoadFailed"
    >
      {children}
    </SystemPluginLoad>
  );
}
