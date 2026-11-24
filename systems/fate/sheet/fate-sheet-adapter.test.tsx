import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import type { Schema } from "@skald/types/schema";
import type { LoadedSystem } from "@skald/types/system";
import schemaJson from "@skald/system-fate/data/fate-condensed/schema.json";
import defaultData from "@skald/system-fate/data/fate-condensed/default-data.json";
import { fatePluginRuntimeUi } from "../plugin.runtime.ui";
import { supportsFatePlayView, useFateSheetAdapter } from "./fate-sheet-adapter";

const v2 = schemaJson as unknown as Schema;
/** The 1.0.0 field set (b73c8f93): no fateV2 root, still the reset button. */
const v1 = (() => {
  const fields: Record<string, unknown> = { ...v2.fields, resetButton: { id: "resetButton", type: "fate-reset-button" } };
  delete fields.fateV2;
  return { ...v2, version: "1.0.0", fields } as unknown as Schema;
})();

type Runtime = LoadedSystem["runtime"];
const builtin: Runtime = { systemId: "s", templateVersionId: "v", builtinTemplate: true };
const system = (schema: Schema, runtime: Runtime, id = "fate-condensed") =>
  ({ config: { id, sheetComponent: "fate" }, schema, runtime, template: { pages: [] }, defaultData, mappings: {}, gameData: {} }) as unknown as LoadedSystem;

describe("Fate sheet adapter", () => {
  it("offers the B view for the built-in Fate template on the v1 and v2 field contracts", () => {
    expect(supportsFatePlayView(system(v2, builtin))).toBe(true);
    expect(supportsFatePlayView(system(v1, builtin))).toBe(true);
  });

  it("keeps the template for forks, user templates, other Systems and missing fields", () => {
    expect(supportsFatePlayView(system(v2, { ...builtin, builtinTemplate: false }))).toBe(false);
    expect(supportsFatePlayView(system(v2, { systemId: "s", templateVersionId: "v" }))).toBe(false);
    expect(supportsFatePlayView(system(v2, undefined))).toBe(false);
    expect(supportsFatePlayView(system(v2, builtin, "my-fate-hack"))).toBe(false);
    const fields = { ...v2.fields };
    delete fields.aspects;
    expect(supportsFatePlayView(system({ ...v2, fields } as Schema, builtin))).toBe(false);
  });

  it("returns the play view only where supported, with defaults and no dialogs of its own", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NextIntlClientProvider locale="zh-TW" messages={{}} timeZone="UTC">{children}</NextIntlClientProvider>
    );
    const yes = renderHook(() => useFateSheetAdapter({ system: system(v1, builtin) }), { wrapper }).result.current;
    expect(yes.playView).toBeTruthy();
    expect(yes.defaultData).toBe(defaultData);
    expect(yes.dialogs).toBeNull();
    // One layout for play and edit (W1 contract): edit mode unlocks setup controls in the same view.
    expect(yes.playViewModes).toBe("both");
    const no = renderHook(() => useFateSheetAdapter({ system: system(v2, { ...builtin, builtinTemplate: false }) }), { wrapper }).result.current;
    expect(no.playView).toBeUndefined();
    expect(no.playViewModes).toBeUndefined();
  });

  it("seeds the sheet with the host's data and falls back to the System's defaults", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NextIntlClientProvider locale="zh-TW" messages={{}} timeZone="UTC">{children}</NextIntlClientProvider>
    );
    const initialData = { name: "蘿絲" };
    const seeded = renderHook(() => useFateSheetAdapter({ system: system(v2, builtin), initialData }), { wrapper }).result.current;
    expect(seeded.defaultData).toBe(initialData);
    const empty = renderHook(() => useFateSheetAdapter({ system: system(v2, builtin), initialData: null }), { wrapper }).result.current;
    expect(empty.defaultData).toBe(defaultData);
  });

  it("is the runtime manifest's adapter for the fate sheet component (system.json sheetComponent)", () => {
    expect(fatePluginRuntimeUi.sheetAdapters?.fate?.useAdapter).toBe(useFateSheetAdapter);
  });
});
