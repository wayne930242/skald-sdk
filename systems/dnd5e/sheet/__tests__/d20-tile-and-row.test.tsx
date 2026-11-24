// @vitest-environment jsdom
//
// B-022 (S3): a tile (`display: "tile"`) opens its roll rule's own options, as that rule's field
// button does. A D&D d20 Test on a tile opens the D&D dialog (advantage, a modifier), not CoC's
// bonus/penalty dice, and its choice reaches the d20 macro. A CoC tile keeps CoC's dialog.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import type { RollMacroRegistry } from "@skald/dice";
import { render } from "@skald/sheet-sdk/testing/intl-render";
import dndMacros from "@skald/system-dnd5e/data/dnd5e-2024/roll-macros.json";
import { StatTile, TileRollScope } from "@skald/sheet-sdk/modules/character/ui/renderer/stat-tile";
import { SystemPluginProvider } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import { buildSystemPluginRenderUiCatalog, extendSystemPluginUiCatalog } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";
import { dnd5ePluginRenderUi } from "@skald/system-dnd5e/plugin.render.ui";

const executeRoll = vi.fn();
let schemaData: Record<string, unknown> = {};
let system: unknown;

vi.mock("@skald/sheet-sdk/modules/rolls/ui/context/roll-context", () => ({
  useRollOptional: () => ({ executeRoll }),
}));
vi.mock("@skald/sheet-sdk/modules/character/ui/renderer/schema-context", () => ({
  useSchemaData: () => schemaData,
}));
vi.mock("@skald/sheet-sdk/components/providers/system-provider", () => ({
  useSystemOptional: () => system,
}));

const LAZY = { timeout: 5000 };
const dndRender = buildSystemPluginRenderUiCatalog([dnd5ePluginRenderUi]);

function WithDnd({ children }: { children: ReactNode }) {
  // As a SystemPluginGate does once the D&D plugin's render UI has loaded.
  return <SystemPluginProvider catalog={(parent) => extendSystemPluginUiCatalog(parent, dndRender, null)}>{children}</SystemPluginProvider>;
}

beforeAll(async () => {
  const options = await import("@skald/system-dnd5e/sheet/d20-roll-options");
  await options.loadHint("en");
});
beforeEach(() => {
  executeRoll.mockReset();
  window.localStorage.clear();
  schemaData = { athletics: 5, d20Penalty: 0 };
  system = { dsl: { rollMacros: dndMacros as unknown as RollMacroRegistry } };
});
afterEach(cleanup);

describe("a D&D d20 Test on a tile", () => {
  function renderTile() {
    render(
      <WithDnd>
        <TileRollScope roll="{{#d20[@athletics-@d20Penalty]}}" label="Athletics" rollKey="athletics">
          <StatTile label="Athletics" valueText="+5" fieldId="athletics" />
        </TileRollScope>
      </WithDnd>,
    );
    return screen.getByRole("button", { name: /Athletics/ });
  }

  it("rolls normal at once on a tap", async () => {
    const tile = renderTile();
    await act(async () => {
      fireEvent.click(tile);
    });
    expect(executeRoll).toHaveBeenCalledTimes(1);
    expect(executeRoll.mock.calls[0][3]).toEqual({ adv: 0 });
  });

  it("opens the D&D dialog, not CoC's bonus dice, and rolls its choice", async () => {
    const tile = renderTile();
    await act(async () => {
      fireEvent.keyDown(tile, { key: "Enter", shiftKey: true });
    });
    const dialog = await screen.findByRole("dialog", { name: "Athletics" }, LAZY);
    expect(dialog.querySelector("[data-d20-roll-options]")).not.toBeNull();
    expect(within(dialog).queryByRole("group", { name: "Bonus or penalty dice" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("radio", { name: "Advantage" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Plus 1" }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Roll" }));
    });
    expect(executeRoll).toHaveBeenCalledTimes(1);
    expect(executeRoll.mock.calls[0][0].expression).toBe("{{#d20[(@athletics-@d20Penalty)+1]}}");
    expect(executeRoll.mock.calls[0][3]).toEqual({ adv: 1 });
  });
});
