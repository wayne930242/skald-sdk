import { act, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { LoadedSystem } from "@skald/types/system";
import type { SheetAdapterOutput } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";
import { PLAY_VIEW_FIELDS } from "../play/play-model";
import type { ReferenceRequest } from "../reference-dialog";

/**
 * T2b-F F005: every way the sheet opens a reference carries the character's level, so a class's
 * progression table highlights it: a row's action (template sheet), a play view row, a compendium
 * preview and the compendium's book reader, as the browser already did.
 */

const seen: { request: ReferenceRequest | null; compendium: { characterLevel?: number; onPreview: (ref: string) => void } | null } = {
  request: null,
  compendium: null,
};
vi.mock("../reference-dialog", () => ({
  ReferenceDialog: (props: { request: ReferenceRequest }) => {
    seen.request = props.request;
    return null;
  },
}));
vi.mock("../compendium-dialog", () => ({
  CompendiumDialog: (props: { characterLevel?: number; onPreview: (ref: string) => void }) => {
    seen.compendium = props;
    return null;
  },
}));
vi.mock("../use-reference-context", () => ({ useReferenceContext: () => ({}) }));
vi.mock("../play/play-messages", () => ({ loadPlayMessages: async () => ({}) }));

const { useDnd5eSheetAdapter } = await import("../dnd-sheet-adapter");

const system = {
  config: { id: "dnd5e-2024" },
  schema: { fields: Object.fromEntries(PLAY_VIEW_FIELDS.map((id) => [id, { id, type: "text" }])) },
  runtime: { builtinTemplate: true },
} as unknown as LoadedSystem;

const host: { adapter?: SheetAdapterOutput } = {};
function Host() {
  const output = useDnd5eSheetAdapter({ system });
  useEffect(() => {
    host.adapter = output;
  });
  return <>{output.dialogs}</>;
}
const adapter = () => host.adapter!;

async function mount() {
  seen.request = null;
  seen.compendium = null;
  await act(async () => {
    render(
      <NextIntlClientProvider locale="en" messages={{}} timeZone="UTC">
        <Host />
      </NextIntlClientProvider>,
    );
  });
}

const row = { name: "Arcane Recovery", ref: "classFeature:wizard/arcane-recovery-l1", origin: "srd", text: "" };
const noop = () => {};

describe("D&D sheet adapter: the character level on reference requests", () => {
  it("gives a list row's action (row = data, character = context) the character's level", async () => {
    await mount();
    await act(async () => {
      void adapter().handlers.openReference(row, noop, { character: { level: 5 } });
    });
    await waitFor(() => expect(seen.request).toMatchObject({ mode: "row", row: { ref: row.ref }, level: 5 }));
  });

  it("keeps a row request without a level when the call has no character", async () => {
    await mount();
    await act(async () => {
      void adapter().handlers.openReference(row, noop);
    });
    await waitFor(() => expect(seen.request).toMatchObject({ mode: "row" }));
    expect(seen.request).not.toHaveProperty("level");
  });

  it("gives a play view row the character's level", async () => {
    await mount();
    const play = (adapter().playView as ReactElement<{ openReference: (row: Record<string, unknown>, character?: Record<string, unknown>) => void }>).props;
    await act(async () => play.openReference(row, { level: 3 }));
    await waitFor(() => expect(seen.request).toMatchObject({ mode: "row", level: 3 }));
  });

  it("gives the compendium (its book reader) and its previews the character's level", async () => {
    await mount();
    await act(async () => {
      void adapter().handlers.openCompendium({ level: 7 }, noop);
    });
    await waitFor(() => expect(seen.compendium).toMatchObject({ characterLevel: 7 }));
    await act(async () => seen.compendium!.onPreview("class:wizard"));
    await waitFor(() => expect(seen.request).toEqual({ mode: "ref", ref: "class:wizard", level: 7 }));
  });

  it("gives the play view's compendium the character's level", async () => {
    await mount();
    const play = (adapter().playView as ReactElement<{ openCompendium: (update: unknown, character?: Record<string, unknown>) => void }>).props;
    await act(async () => play.openCompendium(noop, { level: 4 }));
    await waitFor(() => expect(seen.compendium).toMatchObject({ characterLevel: 4 }));
  });
});

describe("D&D sheet adapter: one layout for play and edit (plan-uat2 §3.1)", () => {
  it("serves its play view in both modes when the built-in template has the field contract", async () => {
    await mount();
    expect(adapter().playView).toBeDefined();
    expect(adapter().playViewModes).toBe("both");
  });

  it("leaves a fork or user template on its template form in both modes", () => {
    const fork = { ...system, runtime: { builtinTemplate: false } } as unknown as LoadedSystem;
    const seen: { output?: SheetAdapterOutput } = {};
    function ForkHost() {
      const output = useDnd5eSheetAdapter({ system: fork });
      useEffect(() => {
        seen.output = output;
      });
      return null;
    }
    render(
      <NextIntlClientProvider locale="en" messages={{}} timeZone="UTC">
        <ForkHost />
      </NextIntlClientProvider>,
    );
    expect(seen.output?.playView).toBeUndefined();
    expect(seen.output?.playViewModes).toBeUndefined();
  });
});
