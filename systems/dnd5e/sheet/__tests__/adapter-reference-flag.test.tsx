import { act, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { LoadedSystem } from "@skald/types/system";

/** Coordinator 1: reference views pass `reference: true`, so overlays and lazy names reach them; the sheet mount does not. */

const calls: Array<{ english?: boolean; reference?: boolean }> = [];
vi.mock("../use-reference-context", () => ({
  useReferenceContext: (_system: unknown, _pack: unknown, options: { english?: boolean; reference?: boolean } = {}) => {
    calls.push(options);
    return {};
  },
}));
vi.mock("../play/play-messages", () => ({ loadPlayMessages: async () => ({}) }));

const { useDnd5eSheetAdapter } = await import("../dnd-sheet-adapter");

const system = { config: { id: "dnd5e-2024" }, schema: { fields: {} }, runtime: {} } as unknown as LoadedSystem;
const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={{}} timeZone="UTC">{children}</NextIntlClientProvider>
);

describe("D&D sheet adapter reference flag", () => {
  it("stays on tier A at mount and loads the reference names once a reference view opens", async () => {
    const { result } = renderHook(() => useDnd5eSheetAdapter({ system } as never), { wrapper });
    expect(calls.at(-1)).toMatchObject({ reference: false });
    await act(async () => {
      result.current.handlers.openReferenceBrowser?.({ level: 3 } as never, (() => {}) as never);
    });
    expect(calls.at(-1)).toMatchObject({ english: true, reference: true });
  });
});
