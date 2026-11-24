"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { SystemConfig } from "@skald/types/system";
import type { SystemMessages, SystemPresentation } from "../domain/system-plugin";
import type { SystemPluginUiCatalog } from "./system-plugin-ui";

export interface SystemPluginUiContext extends SystemPluginUiCatalog {
  readonly presentations: ReadonlyMap<string, SystemPresentation>;
  getBuiltinSystemConfig(slug: string): SystemConfig | null;
  getClientSystemMessages(slug: string, locale: string): SystemMessages;
  /**
   * The one load of a System's messages that load on demand (started on first call; it settles
   * once `getClientSystemMessages` has them), or null when its messages are static. `retry`
   * replaces a load that failed.
   */
  preloadClientSystemMessages(slug: string, locale: string, options?: { retry?: boolean }): Promise<unknown> | null;
  getSystemSkillLabel(slug: string | undefined, locale: string, label: string): string;
}

const SystemPluginsContext = createContext<SystemPluginUiContext>({
  presentations: new Map(),
  getBuiltinSystemConfig: () => null,
  getClientSystemMessages: () => ({}),
  preloadClientSystemMessages: () => null,
  getSystemSkillLabel: (_slug, _locale, label) => label,
  sheetAdapters: new Map(),
  fieldRenderers: new Map(),
  rowSelectors: new Map(),
  rollControls: new Map(),
  rollOptions: new Map(),
  legacySheet: undefined,
  lazyRenderUi: [],
  lazyRuntimeUi: [],
});

/**
 * Overrides the given capabilities and inherits the rest from the enclosing provider, so the
 * root layout can inject light presentation data while only sheet routes load plugin UI.
 */
export function SystemPluginProvider({
  catalog,
  children,
}: {
  /** Capabilities to override, or a function of the enclosing ones (to extend their maps). */
  catalog: Partial<SystemPluginUiContext> | ((parent: SystemPluginUiContext) => Partial<SystemPluginUiContext>);
  children: ReactNode;
}) {
  const parent = useContext(SystemPluginsContext);
  const value = useMemo(
    () => ({ ...parent, ...(typeof catalog === "function" ? catalog(parent) : catalog) }),
    [parent, catalog],
  );
  return <SystemPluginsContext.Provider value={value}>{children}</SystemPluginsContext.Provider>;
}

export function useSystemPluginUi() {
  return useContext(SystemPluginsContext);
}
