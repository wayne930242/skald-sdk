"use client";

import { createElement, Fragment, Suspense, use, useCallback, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { LoadedSystem } from "@skald/types/system";
import type { FormulaValue } from "@skald/formula";
import { ClientSystemIntlProvider, SystemProvider } from "@skald/sheet-sdk/components/providers";
import { QuillLoader } from "@skald/sheet-sdk/components/skeletons";
import { TemplateRenderer } from "@skald/sheet-sdk/modules/character/ui/renderer";
import { PrintPreview } from "@skald/sheet-sdk/modules/character/ui/print/print-preview";
import { InteractionModeContext } from "@skald/sheet-sdk/modules/rolls/ui/context/interaction-mode";
import { RollProvider } from "@skald/sheet-sdk/modules/rolls/ui/context/roll-context";
import { readCharacterFormulaRuntime, type CharacterFormulaRuntime, type EditorHandlers } from "@skald/sheet-sdk/modules/sheet-schema";
import { SystemPluginGate } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-gate";
import { useSystemPluginUi } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import type { SheetAdapter } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";
import { compileBuiltinFixtureArtifact } from "@skald/sheet-sdk/modules/templates/sheet-artifact";
import { getSystemMessages, loadSystem, loadSystemPrint, type PreviewMode } from "./systems";
import { RollLog } from "./roll-log";
import { CharacterBar, type CharacterSource } from "./character-bar";
import { initialCharacter, readStoredCharacter, storeCharacter } from "./characters";
import { packsKey, usePreviewPacks } from "./content-packs";
import { PackBar } from "./pack-bar";

/** Systems whose sheet reads content packs (docs/content-packs.md). */
const PACK_SYSTEMS: ReadonlySet<string> = new Set(["dnd5e-2024"]);

type CharacterData = Record<string, unknown>;

interface PreviewSystem {
  system: LoadedSystem;
  formulaRuntime: CharacterFormulaRuntime | undefined;
}

/** One load per system for the page's lifetime: React reads a settled promise synchronously. */
const systemLoads = new Map<string, Promise<PreviewSystem>>();

function loadPreviewSystem(slug: string): Promise<PreviewSystem> {
  let load = systemLoads.get(slug);
  if (!load) {
    load = (async () => {
      const { system, data } = await loadSystem(slug);
      // The template's formulas, compiled by the SDK's template compiler as Skald publishes them.
      const { compiledArtifact } = compileBuiltinFixtureArtifact(slug, data);
      const formulaRuntime = readCharacterFormulaRuntime({ templateVersionId: `preview:${slug}`, compiledArtifact, derivedOverrides: {} }) ?? undefined;
      return { system, formulaRuntime };
    })();
    systemLoads.set(slug, load);
  }
  return load;
}

const NO_HANDLERS: EditorHandlers = {};
const GENERIC_ADAPTER: SheetAdapter = {
  useAdapter: ({ system, initialData }) => ({ handlers: NO_HANDLERS, defaultData: initialData || system.defaultData, dialogs: null }),
};

function getByPath(source: CharacterData, path: string): unknown {
  let node: unknown = source;
  for (const key of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as CharacterData)[key];
  }
  return node;
}

function setByPath(source: CharacterData, path: string, value: unknown): CharacterData {
  const parts = path.split(".");
  const root = { ...source };
  let node = root;
  for (const key of parts.slice(0, -1)) {
    const child = node[key];
    node[key] = child && typeof child === "object" && !Array.isArray(child) ? { ...(child as CharacterData) } : {};
    node = node[key] as CharacterData;
  }
  node[parts[parts.length - 1]] = value;
  return root;
}

const characterName = (data: CharacterData) =>
  (typeof data.name === "string" && data.name) || ((data.character as { name?: string } | undefined)?.name ?? "");

/**
 * One character on the sheet: the system adapter's handlers and dialogs over a character kept
 * in React state and in localStorage. Remounted (by key) when another character is loaded, so
 * the adapter's hooks start over with it.
 */
export function SheetBody({
  preview,
  slug,
  mode,
  initialData,
  onClosePrint,
}: {
  preview: PreviewSystem;
  slug: string;
  mode: PreviewMode;
  initialData: CharacterData;
  onClosePrint: () => void;
}) {
  const { system, formulaRuntime } = preview;
  const { sheetAdapters } = useSystemPluginUi();
  const adapter = (system.config.sheetComponent && sheetAdapters.get(system.config.sheetComponent)) || GENERIC_ADAPTER;
  const { handlers, optionSources, defaultData, dialogs, playView = null, playViewModes = "play" } = adapter.useAdapter({
    system,
    initialData,
    ownsCharacter: true,
  });

  const [data, setDataState] = useState<CharacterData>(defaultData);
  const dataRef = useRef(data);
  const setData = useCallback((updater: CharacterData | ((prev: CharacterData) => CharacterData)) => {
    const next = typeof updater === "function" ? updater(dataRef.current) : updater;
    dataRef.current = next;
    setDataState(next);
    if (system.runtime?.builtinTemplate) storeCharacter(slug, next);
  }, [slug, system]);
  const setField = useCallback(
    (path: string, value: unknown) =>
      setData((prev) => setByPath(prev, path, typeof value === "function" ? (value as (current: unknown) => unknown)(getByPath(prev, path)) : value)),
    [setData],
  );

  const [derivedOverrides, setDerivedOverrides] = useState<Record<string, FormulaValue>>({});
  const runtime = useMemo(
    () => (formulaRuntime ? { ...formulaRuntime, derivedOverrides } : undefined),
    [formulaRuntime, derivedOverrides],
  );
  const setOverride = useCallback((fieldId: string, value: FormulaValue) => {
    setDerivedOverrides((current) => ({ ...current, [fieldId]: value }));
  }, []);
  const refreshOverride = useCallback((fieldId: string) => {
    setDerivedOverrides(({ [fieldId]: _removed, ...rest }) => rest);
  }, []);

  const sheetMode = mode === "edit" ? "edit" : "play";
  return (
    <RollProvider characterId={`preview-${slug}`} characterName={characterName(data)}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0" data-preview-sheet={slug} data-preview-mode={mode}>
          <TemplateRenderer
            schema={system.schema}
            template={system.template}
            data={data}
            onChange={setField}
            setData={setData}
            handlers={handlers}
            optionSources={optionSources}
            editable
            setupMode={sheetMode === "edit"}
            mode={sheetMode}
            viewMode="web"
            characterId={`preview-${slug}`}
            characterName={characterName(data)}
            formulaRuntime={runtime}
            onSetDerivedOverride={setOverride}
            onRefreshDerivedOverride={refreshOverride}
            playView={playView}
            playViewModes={playViewModes}
          />
        </div>
        <RollLog />
      </div>
      {createElement(InteractionModeContext.Provider, { value: sheetMode }, createElement(Fragment, null, dialogs))}
      {mode === "print" && (
        <PrintPreview
          system={system}
          data={data}
          formulaRuntime={runtime}
          editable
          setupMode={false}
          handlers={handlers}
          optionSources={optionSources}
          onClose={onClosePrint}
          loadSystemPrint={loadSystemPrint}
        />
      )}
    </RollProvider>
  );
}

function LoadedPreview({
  load,
  slug,
  locale,
  mode,
  onClosePrint,
}: {
  load: Promise<PreviewSystem>;
  slug: string;
  locale: string;
  mode: PreviewMode;
  onClosePrint: () => void;
}) {
  const preview = use(load);
  const { system } = preview;
  const [character, setCharacter] = useState(() => initialCharacter(slug, system.defaultData));
  const packs = usePreviewPacks();
  const readsPacks = PACK_SYSTEMS.has(slug);
  const replace = useCallback((source: CharacterSource, data: CharacterData) => {
    storeCharacter(slug, data);
    setCharacter((current) => ({ key: current.key + 1, source, data }));
  }, [slug]);

  return (
    <SystemProvider system={system}>
      <SystemPluginGate system={system} fallback={<SheetLoader />}>
        <SystemMessagesProvider slug={slug} locale={locale}>
          <CharacterBar
            slug={slug}
            source={character.source}
            defaultData={system.defaultData}
            onReplace={replace}
            currentData={() => readStoredCharacter(slug) ?? character.data}
          />
          {readsPacks && <PackBar />}
          <SheetBody
            key={readsPacks ? `${character.key}:${packsKey(packs)}` : character.key}
            preview={preview}
            slug={slug}
            mode={mode}
            initialData={character.data}
            onClosePrint={onClosePrint}
          />
        </SystemMessagesProvider>
      </SystemPluginGate>
    </SystemProvider>
  );
}

/**
 * The system's messages over the app's. Rendered inside the gate, which waits for messages that
 * load on demand, so it reads them loaded.
 */
function SystemMessagesProvider({ slug, locale, children }: { slug: string; locale: string; children: ReactNode }) {
  return <ClientSystemIntlProvider systemMessages={getSystemMessages(slug, locale)}>{children}</ClientSystemIntlProvider>;
}

function SheetLoader() {
  const t = useTranslations("previewer");
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-20 text-sm text-muted-foreground">
      <QuillLoader size="lg" />
      {t("loading")}
    </div>
  );
}

const subscribeNothing = () => () => {};

/** A system's sheet in one mode, client-side only: the character lives in this browser. */
export function PreviewerSheet({
  slug,
  locale,
  mode,
  onClosePrint,
}: {
  slug: string;
  locale: string;
  mode: PreviewMode;
  onClosePrint: () => void;
}): ReactNode {
  // Client only: the sheet reads localStorage, which the server render does not have.
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  if (!mounted) return <SheetLoader />;
  const load = loadPreviewSystem(slug);
  return (
    <Suspense fallback={<SheetLoader />}>
      <LoadedPreview load={load} slug={slug} locale={locale} mode={mode} onClosePrint={onClosePrint} />
    </Suspense>
  );
}
