/**
 * The previewer's plugin registry: the two public systems, wired the way the Skald app wires its
 * built-in systems, from their public manifests only. Each system's UI, data and messages load
 * on demand, when its sheet opens.
 */
import type { LoadedSystem } from "@skald/types/system";
import type { BuiltinLocalSystemData, BuiltinSystemRegistration, SystemMessages, SystemPlugin } from "@skald/sheet-sdk/modules/systems";
import {
  buildSystemPluginRenderUiCatalog,
  buildSystemPluginRuntimeUiCatalog,
  type LazySystemPluginUi,
  type SystemPluginRenderUi,
  type SystemPluginRuntimeUi,
} from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";
import type { SystemPrint } from "@skald/sheet-sdk/modules/systems/ui/system-print";
import { normalizeSchema, normalizeTemplate } from "@skald/sheet-sdk/modules/sheet-schema";
import { fatePlugin } from "@skald/system-fate/plugin";
import { dnd5ePlugin } from "@skald/system-dnd5e/plugin";

export const LOCALES = ["en", "zh-TW"] as const;
export type Locale = (typeof LOCALES)[number];
export const isLocale = (value: string): value is Locale => (LOCALES as readonly string[]).includes(value);

export const MODES = ["play", "edit", "print"] as const;
export type PreviewMode = (typeof MODES)[number];
export const isMode = (value: string | null): value is PreviewMode => !!value && (MODES as readonly string[]).includes(value);

const PLUGINS: readonly SystemPlugin[] = [fatePlugin, dnd5ePlugin];

const registrations = new Map<string, BuiltinSystemRegistration>(
  PLUGINS.flatMap((plugin) => Object.entries(plugin.systems)),
);

/** Every system slug the previewer serves, in menu order. */
export const SYSTEM_SLUGS: readonly string[] = [...registrations.keys()];

export const isSystemSlug = (slug: string) => registrations.has(slug);

export function getSystemConfig(slug: string) {
  return registrations.get(slug)?.config ?? null;
}

/**
 * The system as a sheet host holds it (normalized schema and template, defaults and dice
 * rules), with the built-in data it came from, which the template compiler reads.
 */
export async function loadSystem(slug: string): Promise<{ system: LoadedSystem; data: BuiltinLocalSystemData }> {
  const registration = registrations.get(slug);
  if (!registration) throw new Error(`Unknown system: ${slug}`);
  const data = await registration.loadBuiltinData();
  const system: LoadedSystem = {
    config: registration.config,
    schema: normalizeSchema(data.schema),
    template: normalizeTemplate(data.template),
    defaultData: data.defaultData,
    mappings: data.mappings ?? { eraMappings: {}, categoryMappings: {} },
    gameData: data.gameData ?? {},
    dsl: data.dsl,
    // The system's own built-in template, as Skald serves it: its play view applies.
    runtime: { systemId: slug, templateVersionId: `preview:${slug}`, builtinTemplate: true },
  };
  return { system, data };
}

// ---------------------------------------------------------------------------
// Messages: bundled ones at once, on-demand ones after their load (as the app does).
// ---------------------------------------------------------------------------

const EMPTY: SystemMessages = {};
const messageLocale = (locale: string) => (locale === "zh-TW" ? "zh-TW" : "en");
const loadedMessages = new Map<string, SystemMessages>();
const messageLoads = new Map<string, Promise<SystemMessages>>();

export function getSystemMessages(slug: string, locale: string): SystemMessages {
  const registration = registrations.get(slug);
  if (!registration) return EMPTY;
  if (registration.messages) return registration.messages(locale);
  return loadedMessages.get(`${slug}:${messageLocale(locale)}`) ?? EMPTY;
}

export function loadSystemMessages(slug: string, locale: string, options?: { retry?: boolean }): Promise<SystemMessages> | null {
  const registration = registrations.get(slug);
  if (!registration?.loadMessages) return null;
  const key = `${slug}:${messageLocale(locale)}`;
  let load = messageLoads.get(key);
  if (load && options?.retry) load = undefined;
  if (!load) {
    load = registration.loadMessages(messageLocale(locale)).then((messages) => {
      loadedMessages.set(key, messages);
      return messages;
    });
    messageLoads.set(key, load);
  }
  return load;
}

export function getSystemSkillLabel(slug: string | undefined, locale: string, label: string): string {
  return (slug ? registrations.get(slug)?.skillLabel?.(locale, label) : undefined) ?? label;
}

// ---------------------------------------------------------------------------
// Plugin UI: field renderers, roll controls and sheet adapters, loaded with a system's sheet.
// ---------------------------------------------------------------------------

const LAZY_RENDER_UI: readonly LazySystemPluginUi<SystemPluginRenderUi>[] = [
  {
    systems: ["fate-condensed"],
    sheetComponents: ["fate"],
    load: () => import("@skald/system-fate/plugin.render.ui").then((module) => module.fatePluginRenderUi),
  },
  {
    systems: ["dnd5e-2024"],
    rollRules: ["dnd5e"],
    load: () => import("@skald/system-dnd5e/plugin.render.ui").then((module) => module.dnd5ePluginRenderUi),
  },
];

const LAZY_RUNTIME_UI: readonly LazySystemPluginUi<SystemPluginRuntimeUi>[] = [
  {
    systems: ["fate-condensed"],
    sheetComponents: ["fate"],
    load: () => import("@skald/system-fate/plugin.runtime.ui").then((module) => module.fatePluginRuntimeUi),
  },
  {
    systems: ["dnd5e-2024"],
    sheetComponents: ["dnd5e"],
    load: () => import("@skald/system-dnd5e/plugin.runtime.ui").then((module) => module.dnd5ePluginRuntimeUi),
  },
];

/** The catalog the previewer's SystemPluginProvider holds; module-level, so it stays stable. */
export const PLUGIN_UI_CATALOG = {
  ...buildSystemPluginRenderUiCatalog([], LAZY_RENDER_UI),
  ...buildSystemPluginRuntimeUiCatalog([], LAZY_RUNTIME_UI),
};

/** A system's own print document, or null for the generic print of its template pages. */
export function loadSystemPrint(system: Pick<LoadedSystem, "config">): Promise<SystemPrint | null> {
  switch (system.config.id) {
    case "fate-condensed":
      return import("@skald/system-fate/print/entry").then((module) => module.fatePrint);
    case "dnd5e-2024":
      return import("@skald/system-dnd5e/print/entry").then((module) => module.dnd5ePrint);
    default:
      return Promise.resolve(null);
  }
}
