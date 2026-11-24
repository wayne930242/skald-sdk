"use client";

import { Component, Suspense, use, useCallback, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import type { LoadedSystem } from "@skald/types/system";
import { SystemPluginProvider, type SystemPluginUiContext } from "./system-plugin-provider";
import {
  buildSystemPluginRenderUiCatalog,
  buildSystemPluginRuntimeUiCatalog,
  extendSystemPluginUiCatalog,
  type LazySystemPluginUi,
  type SystemPluginRenderUi,
  type SystemPluginRuntimeUi,
} from "./system-plugin-ui";

/**
 * One load per lazy entry for the app's lifetime; React reads a settled promise synchronously.
 * A failed load stays (so a render does not loop on it) until a retry replaces it.
 */
const lazyLoads = new WeakMap<LazySystemPluginUi<unknown>, Promise<unknown>>();
const failedLoads = new WeakSet<Promise<unknown>>();

function loadLazy<T>(entry: LazySystemPluginUi<T>, retry = false): Promise<T> {
  let promise = lazyLoads.get(entry) as Promise<T> | undefined;
  if (promise && retry && failedLoads.has(promise)) promise = undefined;
  if (!promise) {
    const load = entry.load();
    load.catch(() => failedLoads.add(load));
    lazyLoads.set(entry, load);
    promise = load;
  }
  return promise;
}

/**
 * What a gate reads of a System: its slug, sheet component, dice rules and the roll systems its
 * fields name. Hosts that render fields without a loaded System (the wizard, the template editor)
 * pass what they know.
 */
export interface SystemPluginGateSystem {
  readonly config: Pick<LoadedSystem["config"], "id" | "sheetComponent">;
  readonly dsl?: LoadedSystem["dsl"];
  readonly schema?: Pick<LoadedSystem["schema"], "fields">;
}

interface RollingField {
  readonly roll?: unknown;
  readonly rowTemplate?: { readonly children?: readonly RollingField[] };
}

/** The roll systems (`roll.system`) a schema's fields and list row fields name. */
function fieldRollSystems(fields: Readonly<Record<string, RollingField>> | undefined): string[] {
  const systems: string[] = [];
  const visit = (field: RollingField) => {
    const system = (field.roll as { system?: unknown } | undefined)?.system;
    if (typeof system === "string") systems.push(system);
    field.rowTemplate?.children?.forEach(visit);
  };
  Object.values(fields ?? {}).forEach(visit);
  return systems;
}

function matches(entry: LazySystemPluginUi<unknown>, { config, dsl }: SystemPluginGateSystem, rollSystems: readonly string[]): boolean {
  if (entry.systems?.includes(config.id)) return true;
  if (config.sheetComponent && entry.sheetComponents?.includes(config.sheetComponent)) return true;
  const rules = [dsl?.rollRules?.default, ...Object.keys(dsl?.rollRules?.rules ?? {}), dsl?.rollMacros?.defaultSystem, ...rollSystems];
  return rules.some((rule) => !!rule && (entry.rollRules?.includes(rule) ?? false));
}

export type SystemPluginLoadFailedMessage = "pluginLoadFailed" | "pluginFieldsLoadFailed";

/** Starts (or, with `retry`, restarts) the load of a System's on-demand messages; null when it has none. */
export type PreloadSystemMessages = (slug: string, locale: string, options?: { retry?: boolean }) => Promise<unknown> | null;

const NO_LAZY_UI: readonly LazySystemPluginUi<never>[] = [];

/**
 * Renders `children` once the given on-demand plugin UI and messages that match `system` are in,
 * with them added to the catalog below. It reads no plugin capability itself: `SystemPluginGate`
 * and `SystemPluginRenderGate` pass what their host's providers supply.
 */
export function SystemPluginLoad({
  system,
  lazyRenderUi = NO_LAZY_UI,
  lazyRuntimeUi = NO_LAZY_UI,
  preloadMessages,
  fallback = null,
  failedMessage = "pluginLoadFailed",
  children,
}: {
  system: SystemPluginGateSystem;
  lazyRenderUi?: readonly LazySystemPluginUi<SystemPluginRenderUi>[];
  lazyRuntimeUi?: readonly LazySystemPluginUi<SystemPluginRuntimeUi>[];
  preloadMessages?: PreloadSystemMessages;
  fallback?: ReactNode;
  /** The `sheetUi` message a failed load shows: the sheet's, or the fields' for field-only hosts. */
  failedMessage?: SystemPluginLoadFailedMessage;
  children: ReactNode;
}) {
  const locale = useLocale();
  const rollSystems = useMemo(() => fieldRollSystems(system.schema?.fields as Record<string, RollingField> | undefined), [system]);
  const render = useMemo(() => lazyRenderUi.filter((entry) => matches(entry, system, rollSystems)), [lazyRenderUi, system, rollSystems]);
  const runtime = useMemo(() => lazyRuntimeUi.filter((entry) => matches(entry, system, rollSystems)), [lazyRuntimeUi, system, rollSystems]);
  const hasMessages = preloadMessages?.(system.config.id, locale) != null;
  const [attempt, setAttempt] = useState(0);

  if (render.length === 0 && runtime.length === 0 && !hasMessages) return <>{children}</>;
  return (
    <SystemPluginLoadBoundary
      key={`${system.config.id}:${attempt}`}
      failedMessage={failedMessage}
      onRetry={() => {
        // Start the failed loads again here, in the event, so a render only reads them.
        for (const entry of [...render, ...runtime] as LazySystemPluginUi<unknown>[]) void loadLazy(entry, true).catch(() => {});
        void preloadMessages?.(system.config.id, locale, { retry: true })?.catch(() => {});
        setAttempt((value) => value + 1);
      }}
    >
      <Suspense fallback={fallback}>
        <LoadedSystemPlugins render={render} runtime={runtime} preloadMessages={preloadMessages} slug={system.config.id} locale={locale}>
          {children}
        </LoadedSystemPlugins>
      </Suspense>
    </SystemPluginLoadBoundary>
  );
}

/**
 * Keeps a failed chunk load inside the gate (the sheet panel, not the whole session) and offers
 * a retry, which imports the failed chunks again.
 */
class SystemPluginLoadBoundary extends Component<
  { onRetry: () => void; failedMessage: SystemPluginLoadFailedMessage; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (
      <SystemPluginLoadError message={this.props.failedMessage} onRetry={this.props.onRetry} />
    ) : (
      this.props.children
    );
  }
}

function SystemPluginLoadError({ message, onRetry }: { message: SystemPluginLoadFailedMessage; onRetry: () => void }) {
  const t = useTranslations("sheetUi");
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
      <p>{t(message)}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        {t("pluginLoadRetry")}
      </Button>
    </div>
  );
}

function LoadedSystemPlugins({
  render,
  runtime,
  preloadMessages,
  slug,
  locale,
  children,
}: {
  render: readonly LazySystemPluginUi<SystemPluginRenderUi>[];
  runtime: readonly LazySystemPluginUi<SystemPluginRuntimeUi>[];
  preloadMessages: PreloadSystemMessages | undefined;
  slug: string;
  locale: string;
  children: ReactNode;
}) {
  // Each load is cached for the app's lifetime, so a settled one reads synchronously.
  const renderUi = render.map((entry) => use(loadLazy(entry)));
  const runtimeUi = runtime.map((entry) => use(loadLazy(entry)));
  const messages = preloadMessages?.(slug, locale) ?? null;
  if (messages) use(messages);
  const extend = useCallback(
    (parent: SystemPluginUiContext) =>
      extendSystemPluginUiCatalog(
        parent,
        renderUi.length > 0 ? buildSystemPluginRenderUiCatalog(renderUi) : null,
        runtimeUi.length > 0 ? buildSystemPluginRuntimeUiCatalog(runtimeUi) : null,
      ),
    // The loaded values follow from `render` and `runtime`, which the gate memoizes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [render, runtime],
  );
  return <SystemPluginProvider catalog={extend}>{children}</SystemPluginProvider>;
}
