import { useEffect, useState, type ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { vi } from "vitest";
import { readCompiledFormulaArtifact, type CompiledFormulaArtifact } from "@skald/formula";
import type { Schema, Template } from "@skald/types/schema";
import type { LoadedSystem } from "@skald/types/system";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import systemZh from "@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json";
import { compileBuiltinFixtureArtifact } from "@skald/sheet-sdk/modules/templates/sheet-artifact";
import { loadDnd5e2024Data } from "../../../data-access/builtin-local-data";
import { TemplateRenderer } from "@skald/sheet-sdk/modules/character/ui/renderer/template-renderer";
import { SystemPluginProvider } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import type { BuiltinLocalSystemData } from "@skald/sheet-sdk/modules/systems";
import { useReferenceContext } from "../../use-reference-context";
import { DndPlayView } from "../play-view";
import { preloadPlayTabs } from "../lazy-tabs";
import { loadEditMessages } from "../edit-messages";
import { loadEconomyMessages } from "../../economy/economy-intl";

/**
 * The D&D play view inside the real TemplateRenderer (B-023 build): schema, formulas, overrides
 * kept in the host like `runtime.setOverride`/`refreshOverride`, and `onChange` applied like
 * `runtime.setField`. Tests mock the roll context themselves.
 */
export interface DndHarness {
  local: BuiltinLocalSystemData;
  artifact: CompiledFormulaArtifact;
  system: LoadedSystem;
}

let loaded: DndHarness | null = null;

export async function loadDndHarness(): Promise<DndHarness> {
  if (loaded) return loaded;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  const local = await loadDnd5e2024Data();
  const { compiledArtifact } = compileBuiltinFixtureArtifact("dnd5e-2024", local);
  const artifact = readCompiledFormulaArtifact((compiledArtifact as { formulas: unknown }).formulas);
  if (!artifact) throw new Error("compiled artifact carries no formulas");
  const system = {
    config: { id: "dnd5e-2024", sheetComponent: "dnd5e" },
    schema: local.schema,
    template: local.template,
    defaultData: local.defaultData,
    mappings: {},
    gameData: local.gameData,
    runtime: { builtinTemplate: true },
  } as unknown as LoadedSystem;
  await Promise.all([preloadPlayTabs(), loadEditMessages("zh-TW"), loadEconomyMessages("zh-TW"), import("../edit-layer")]);
  loaded = { local, artifact, system };
  return loaded;
}

export interface MountOptions {
  mode?: "play" | "edit";
  extra?: Record<string, unknown>;
  editable?: boolean;
  overrides?: Record<string, unknown>;
  /** Default 1440 (wide layout). */
  width?: number;
}

export interface DndMounted {
  data: () => Record<string, unknown>;
  overrides: () => Record<string, unknown>;
  setOverride: ReturnType<typeof vi.fn>;
  refreshOverride: ReturnType<typeof vi.fn>;
  setMode: (mode: "play" | "edit") => Promise<void>;
  /** A change that arrives from elsewhere (another tab, the table), not through the view. */
  setRemote: (patch: Record<string, unknown>) => Promise<void>;
}

export function baseCharacter(harness: DndHarness, extra: Record<string, unknown> = {}) {
  return { ...structuredClone(harness.local.defaultData), name: "布蘭", level: 1, classId: "fighter", className: "戰士", species: "人類", ...extra };
}

export async function mountDnd(harness: DndHarness, options: MountOptions = {}): Promise<DndMounted> {
  const width = options.width ?? 1440;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ width, height: 800, top: 0, left: 0, right: width, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
  );
  window.scrollBy = vi.fn();
  const saved: { data: Record<string, unknown>; overrides: Record<string, unknown> } = { data: {}, overrides: {} };
  const setOverride = vi.fn();
  const refreshOverride = vi.fn();
  const control: { setMode?: (mode: "play" | "edit") => void; patch?: (patch: Record<string, unknown>) => void } = {};
  function Sheet() {
    const [data, setData] = useState<Record<string, unknown>>(() => baseCharacter(harness, options.extra));
    const [overrides, setOverrides] = useState<Record<string, unknown>>(() => ({ ...options.overrides }));
    const [mode, setMode] = useState(options.mode ?? "play");
    useEffect(() => {
      control.setMode = setMode;
      control.patch = (patch) => setData((previous) => ({ ...previous, ...patch }));
    }, []);
    useEffect(() => {
      saved.data = data;
      saved.overrides = overrides;
    });
    const reference = useReferenceContext(harness.system);
    const editable = options.editable ?? true;
    return (
      <TemplateRenderer
        template={harness.local.template as Template}
        schema={harness.local.schema as Schema}
        data={data}
        viewMode="web"
        mode={editable ? mode : "play"}
        editable={editable}
        setupMode={editable && mode === "edit"}
        onChange={(path, value) =>
          setData((previous) => ({
            ...previous,
            [path]: typeof value === "function" ? (value as (current: unknown) => unknown)(previous[path]) : value,
          }))
        }
        setData={setData}
        characterId="c-bran"
        formulaRuntime={{ templateVersionId: "v", artifact: harness.artifact, derivedOverrides: overrides as never }}
        onSetDerivedOverride={editable ? (fieldId, value) => {
          setOverride(fieldId, value);
          setOverrides((previous) => ({ ...previous, [fieldId]: value }));
        } : undefined}
        onRefreshDerivedOverride={editable ? (fieldId) => {
          refreshOverride(fieldId);
          setOverrides((previous) => {
            const next = { ...previous };
            delete next[fieldId];
            return next;
          });
        } : undefined}
        playView={<DndPlayView system={harness.system} reference={reference} openReference={vi.fn()} openCompendium={vi.fn()} />}
        playViewModes="both"
      />
    );
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale="zh-TW" messages={{ ...appZh, ...(systemZh as object) }} timeZone="UTC">
      <SystemPluginProvider catalog={{}}>{children}</SystemPluginProvider>
    </NextIntlClientProvider>
  );
  await act(async () => {
    render(<Sheet />, { wrapper });
  });
  await screen.findByRole("tab", { name: "戰鬥" });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return {
    data: () => saved.data,
    overrides: () => saved.overrides,
    setOverride,
    refreshOverride,
    setMode: async (mode) => {
      await act(async () => {
        control.setMode?.(mode);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
    setRemote: async (patch) => {
      await act(async () => {
        control.patch?.(patch);
      });
    },
  };
}

export async function openTab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }));
  await act(async () => {
    fireEvent.click(screen.getByRole("tab", { name }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

export function normalizedBody(): string {
  return document.body.innerHTML.replace(/radix-[^"\s]+|«[^»]+»|:r[0-9a-z]+:|_r_[0-9a-z]+_/g, "<id>");
}
