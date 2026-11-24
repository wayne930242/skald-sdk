import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { anyZhWithheld } from "../../../__tests__/zh-withheld";
import { cleanup, screen } from "@testing-library/react";
import { loadDndHarness, mountDnd, normalizedBody, openTab, type DndHarness } from "./dnd-harness";

/**
 * B-023 build T0: the D&D play view's DOM before the shared edit interaction (base 4cbb8f93),
 * every tab, default data (no overrides, so no marks). Play mode stays byte-identical through
 * the build; edit mode may change only in T6–T8.
 */
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }) }));
vi.mock("@skald/sheet-sdk/modules/rolls/ui/context/roll-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRollOptional: () => ({ executeRoll: vi.fn(async () => null), nextModifier: 0 }),
}));
vi.setConfig({ testTimeout: 30_000 });

let harness: DndHarness;
beforeAll(async () => {
  harness = await loadDndHarness();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("D&D play view DOM pin", () => {
  // The pin is the zh-TW DOM: any withheld zh-TW file changes it, if only by the fallback notice.
  it.skipIf(anyZhWithheld).each([1440, 390])("play mode, every tab, at %i px", async (width) => {
    await mountDnd(harness, { mode: "play", width });
    const names = screen.getAllByRole("tab").map((tab) => tab.textContent ?? "");
    const pages: Record<string, string> = {};
    for (const name of names) {
      await openTab(name);
      pages[name] = normalizedBody();
    }
    expect(pages).toMatchSnapshot();
  });
});
