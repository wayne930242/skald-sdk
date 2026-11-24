import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { LoadedSystem } from "@skald/types/system";

/** The host's stored copy (initialData) seeds the sheet, as in the CoC and Avatar adapters; the system default is only the fallback. */

vi.mock("../use-reference-context", () => ({ useReferenceContext: () => ({}) }));
vi.mock("../play/play-messages", () => ({ loadPlayMessages: async () => ({}) }));

const { useDnd5eSheetAdapter } = await import("../dnd-sheet-adapter");

const defaults = { name: "" };
const system = { config: { id: "dnd5e-2024" }, schema: { fields: {} }, runtime: {}, defaultData: defaults } as unknown as LoadedSystem;
const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={{}} timeZone="UTC">{children}</NextIntlClientProvider>
);

describe("D&D sheet adapter default data", () => {
  it("uses the host's initial data when present", () => {
    const stored = { name: "Testa Brindle" };
    const { result } = renderHook(() => useDnd5eSheetAdapter({ system, initialData: stored } as never), { wrapper });
    expect(result.current.defaultData).toBe(stored);
  });

  it("falls back to the system default without initial data", () => {
    const { result } = renderHook(() => useDnd5eSheetAdapter({ system } as never), { wrapper });
    expect(result.current.defaultData).toBe(defaults);
  });
});
