// B-021: a D&D d20 roll rolls at once on a tap, as CoC's sheet rolls do. A long-press, a
// right-click, Shift+Enter or the context-menu key opens a dialog for this one roll: advantage,
// normal or disadvantage, a modifier, and extra dice (Bless +1d4, Bane −1d4). Nothing is sticky.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { zhWithheld } from "../../__tests__/zh-withheld";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { toast } from "sonner";
import type { LoadedSystem } from "@skald/types/system";
import { executeExpressionWithMacros, type RollMacroRegistry } from "@skald/dice";
import appZh from "@skald/sheet-sdk/messages/zh-TW.json";
import appEn from "@skald/sheet-sdk/messages/en.json";
import systemZh from "@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json";
import systemEn from "@skald/system-dnd5e/data/dnd5e-2024/messages/en.json";
import macros from "@skald/system-dnd5e/data/dnd5e-2024/roll-macros.json";
import { SystemProvider } from "@skald/sheet-sdk/components/providers/system-provider";
import schemaJson from "@skald/system-dnd5e/data/dnd5e-2024/schema.json";
import templateJson from "@skald/system-dnd5e/data/dnd5e-2024/template.json";
import { SystemPluginProvider } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-provider";
import { AdvantageRollControl } from "../advantage-roll-control";
import { d20ExtraDiceArgs, d20ModifierApplies, withCriticalDice, withD20Modifier } from "../d20-roll-args";
import D20RollOptions from "../d20-roll-options";
import { PlayRollButton } from "../play/play-roll-button";
import { PlayContext, type PlayContextValue } from "../play/play-context";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
const executeRoll = vi.hoisted(() => vi.fn());
vi.mock("@skald/sheet-sdk/modules/rolls/ui/context/roll-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRollOptional: () => ({ executeRoll }),
}));

/** The dialog and its labels load on first use; a cold import can take a while under load. */
const LAZY = { timeout: 5000 };

/** The built-in system as a sheet loads it: what these rolls read is its d20 macro. */
const system = {
  config: { id: "dnd5e-2024", sheetComponent: "dnd5e" },
  schema: schemaJson,
  template: templateJson,
  defaultData: {},
  mappings: {},
  gameData: {},
  dsl: { rollMacros: macros as unknown as RollMacroRegistry },
} as unknown as LoadedSystem;

beforeAll(async () => {
  // As a press on a d20 button does: the dialog then opens without waiting for its chunk.
  const [options, damage] = await Promise.all([import("../d20-roll-options"), import("../damage-roll-options")]);
  await Promise.all([options.loadHint("zh-TW"), options.loadHint("en"), damage.loadHint("zh-TW"), damage.loadHint("en")]);
});
beforeEach(() => {
  window.localStorage.clear();
  executeRoll.mockReset();
  vi.mocked(toast).mockClear();
});
afterEach(cleanup);

function Providers({ children, locale = "zh-TW", loaded = system }: { children: ReactNode; locale?: "zh-TW" | "en"; loaded?: LoadedSystem }) {
  const messages = locale === "en" ? { ...appEn, ...systemEn } : { ...appZh, ...systemZh };
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <SystemProvider system={loaded}>
        <SystemPluginProvider catalog={(parent) => ({ rollControls: new Map([...parent.rollControls, ["dnd5e", AdvantageRollControl]]) })}>
          {children}
        </SystemPluginProvider>
      </SystemProvider>
    </NextIntlClientProvider>
  );
}

/** The system as a sheet saved before the extra-dice parameters were seeded still has it. */
function withOldD20(loaded: LoadedSystem): LoadedSystem {
  const registry = loaded.dsl!.rollMacros!;
  const d20 = registry.macros.d20;
  return {
    ...loaded,
    dsl: { ...loaded.dsl, rollMacros: { ...registry, macros: { ...registry.macros, d20: { ...d20, params: d20.params!.slice(0, 2) } } } },
  };
}

describe("the d20 call's arguments", () => {
  const registry = macros as unknown as RollMacroRegistry;
  const run = (expression: string, overrides: Record<string, number>) =>
    executeExpressionWithMacros(expression, registry, { athletics: 5, d20Penalty: 2 }, { random: () => 0 }, overrides)?.result;

  it("adds a modifier to the call's first argument and keeps the rest", () => {
    expect(withD20Modifier("{{#d20[@athletics-@d20Penalty]}}", 2)).toBe("{{#d20[(@athletics-@d20Penalty)+2]}}");
    expect(withD20Modifier("{{#d20[@athletics-@d20Penalty, 1]}}", -3)).toBe("{{#d20[(@athletics-@d20Penalty)-3, 1]}}");
    expect(withD20Modifier("{{#d20[@athletics-@d20Penalty]}}", 0)).toBe("{{#d20[@athletics-@d20Penalty]}}");
    expect(run(withD20Modifier("{{#d20[@athletics-@d20Penalty]}}", 2), { adv: 0 })).toMatchObject({ resolvedDiceExpr: "1d20+5" });
    expect(run(withD20Modifier("{{#d20[@athletics-@d20Penalty]}}", -4), { adv: 0 })).toMatchObject({ resolvedDiceExpr: "1d20-1" });
  });

  // BUAT-F002: the engine reads a macro call as the whole roll (`{{#d20[@x]}}+1` drops the +1), so a
  // modifier can join only a whole d20 call's first argument, or follow a plain dice expression.
  // Any other roll (another macro, a call with text after it) offers no modifier at all.
  it("adds a modifier to a plain dice expression, and offers none on another macro call", () => {
    expect(withD20Modifier("1d20+{{@athletics}}", 2)).toBe("1d20+{{@athletics}}+2");
    expect(d20ModifierApplies("{{#d20[@athletics]}}")).toBe(true);
    expect(d20ModifierApplies("1d20+{{@athletics}}")).toBe(true);
    expect(d20ModifierApplies("{{#check[@athletics]}}")).toBe(false);
    expect(d20ModifierApplies("{{#d20[@athletics]}}+1")).toBe(false);
    expect(() => withD20Modifier("{{#check[@athletics]}}", 2)).toThrow();
  });

  it("turns the extra dice into the macro's signed count and size", () => {
    expect(d20ExtraDiceArgs("1d4")).toEqual({ xn: 1, xd: 4 });
    expect(d20ExtraDiceArgs("-1d4")).toEqual({ xn: -1, xd: 4 });
    expect(d20ExtraDiceArgs("+1d8")).toEqual({ xn: 1, xd: 8 });
    expect(d20ExtraDiceArgs("")).toBeUndefined();
    expect(() => d20ExtraDiceArgs("1d4+2")).toThrow();
    expect(run("{{#d20[@athletics-@d20Penalty]}}", { adv: 1, ...d20ExtraDiceArgs("-1d4") })).toMatchObject({ resolvedDiceExpr: "2d20kh1+3-1d4" });
  });
});

describe("the edit-mode d20 button", () => {
  async function mount(props: { showBonusDice?: boolean; loaded?: LoadedSystem; expression?: string } = {}) {
    const onRoll = vi.fn();
    render(
      <Providers loaded={props.loaded}>
        <AdvantageRollControl ariaLabel="擲運動" rollName="運動" onRoll={onRoll} showBonusDice={props.showBonusDice ?? true} expression={props.expression} />
      </Providers>,
    );
    // The system provider shows its children once its formula engine is ready.
    return { onRoll, button: await screen.findByRole("button", { name: "擲運動" }) };
  }

  it.skipIf(zhWithheld("messages/roll/zh-TW.json"))("rolls normal at once on a tap, with no menu, and hints once about the dialog", async () => {
    const { onRoll, button } = await mount();
    await act(async () => fireEvent.click(button));
    expect(onRoll).toHaveBeenCalledWith(0, "regular");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    // The hint's text loads with the dialog's labels: not with the sheet, and not from the System's catalog.
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith("長按或按右鍵，選優劣勢、加減值與額外骰", expect.anything()));
    expect(systemZh).not.toHaveProperty("rollControl");
  });

  it.skipIf(zhWithheld("messages/roll/zh-TW.json"))("opens the roll's dialog on a right-click and rolls advantage, +2 and +1d4 on Enter", async () => {
    const { onRoll, button } = await mount();
    await act(async () => {
      fireEvent.contextMenu(button);
    });
    const dialog = await screen.findByRole("dialog", { name: "運動" }, LAZY);
    expect(onRoll).not.toHaveBeenCalled();
    const mode = within(dialog).getByRole("group", { name: "優勢／劣勢" });
    expect(within(mode).getAllByRole("radio").map((item) => item.textContent)).toEqual(["劣勢", "一般", "優勢"]);
    expect(within(mode).getByRole("radio", { name: "一般" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(mode).getByRole("radio", { name: "優勢" }));
    const modifier = within(dialog).getByRole("spinbutton", { name: "加減值" });
    fireEvent.click(within(dialog).getByRole("button", { name: "加 1" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "加 1" }));
    expect(modifier).toHaveValue(2);
    const extra = within(dialog).getByRole("group", { name: "額外骰" });
    expect(within(extra).getAllByRole("radio").map((item) => item.textContent)).toEqual(["無", "+1d4", "−1d4", "+1d6", "+1d8", "+1d10", "+1d12"]);
    fireEvent.click(within(extra).getByRole("radio", { name: "+1d4" }));
    await act(async () => fireEvent.keyDown(modifier, { key: "Enter" }));
    expect(onRoll).toHaveBeenCalledTimes(1);
    const [adv, difficulty, transform, extraArgs] = onRoll.mock.calls[0];
    expect([adv, difficulty, extraArgs]).toEqual([1, "regular", { xn: 1, xd: 4 }]);
    expect(transform("{{#d20[@athletics-@d20Penalty]}}")).toBe("{{#d20[(@athletics-@d20Penalty)+2]}}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.skipIf(zhWithheld("messages/roll/zh-TW.json"))("opens on Shift+Enter, starts from normal every time, and rolls disadvantage with Bane", async () => {
    const { onRoll, button } = await mount();
    await act(async () => {
      fireEvent.keyDown(button, { key: "Enter", shiftKey: true });
    });
    let dialog = await screen.findByRole("dialog", undefined, LAZY);
    fireEvent.click(within(dialog).getByRole("radio", { name: "劣勢" }));
    fireEvent.click(within(dialog).getByRole("radio", { name: "−1d4" }));
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "擲骰" })));
    expect(onRoll).toHaveBeenLastCalledWith(-1, "regular", undefined, { xn: -1, xd: 4 });
    await act(async () => {
      fireEvent.contextMenu(button);
    });
    dialog = await screen.findByRole("dialog", undefined, LAZY);
    expect(within(dialog).getByRole("radio", { name: "一般" })).toHaveAttribute("aria-checked", "true");
    expect(within(dialog).getByRole("radio", { name: "無" })).toHaveAttribute("aria-checked", "true");
    expect(within(dialog).getByRole("spinbutton", { name: "加減值" })).toHaveValue(0);
  });

  it("hides the modifier on a field roll that is not a whole d20 call", async () => {
    const { button } = await mount({ expression: "{{#check[@athletics]}}" });
    await act(async () => {
      fireEvent.contextMenu(button);
    });
    const dialog = await screen.findByRole("dialog", undefined, LAZY);
    expect(within(dialog).queryByRole("spinbutton", { name: "加減值" })).toBeNull();
  });

  it.skipIf(zhWithheld("messages/roll/zh-TW.json"))("offers no extra dice on a system whose d20 macro predates them", async () => {
    const { button } = await mount({ loaded: withOldD20(system) });
    await act(async () => {
      fireEvent.contextMenu(button);
    });
    const dialog = await screen.findByRole("dialog", undefined, LAZY);
    expect(within(dialog).queryByRole("group", { name: "額外骰" })).toBeNull();
    expect(within(dialog).getByRole("group", { name: "優勢／劣勢" })).toBeInTheDocument();
  });

  it.skipIf(zhWithheld("messages/roll/zh-TW.json")).each([
    ["shows", "{{#d20[@athletics-@d20Penalty]}}", 1],
    ["hides", "{{#check[@athletics]}}", 0],
  ])("%s the modifier for the roll %s", async (_, expression, count) => {
    render(
      <Providers>
        <D20RollOptions open onOpenChange={() => {}} onRoll={() => {}} name="運動" data={{ expression }} />
      </Providers>,
    );
    const dialog = await screen.findByRole("dialog", undefined, LAZY);
    expect(within(dialog).queryAllByRole("spinbutton", { name: "加減值" })).toHaveLength(count);
    expect(within(dialog).getByRole("group", { name: "優勢／劣勢" })).toBeInTheDocument();
  });

  // B-022 (D3): a damage roll takes a Critical Hit (its dice doubled) and a modifier on a long-press.
  it.skipIf(zhWithheld("messages/roll/zh-TW.json"))("rolls damage at once on a tap, and opens Critical and a modifier on a right-click", async () => {
    const { onRoll, button } = await mount({ showBonusDice: false });
    await act(async () => fireEvent.click(button));
    expect(onRoll).toHaveBeenCalledWith(0, "regular");
    onRoll.mockClear();
    await act(async () => {
      fireEvent.contextMenu(button);
    });
    const dialog = await screen.findByRole("dialog", { name: "運動" }, LAZY);
    expect(dialog.querySelector("[data-d20-roll-options]")).toBeNull();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "重擊" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "加 1" }));
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "擲骰" })));
    const [adv, difficulty, transform] = onRoll.mock.calls[0];
    expect([adv, difficulty]).toEqual([0, "regular"]);
    expect(transform("1d8+{{@damageMod}}")).toBe("2d8+{{@damageMod}}+1");
  });
});

describe("a Critical Hit's dice", () => {
  it("doubles every die count and leaves modifiers and placeholders alone", () => {
    expect(withCriticalDice("1d8+{{@damageMod}}")).toBe("2d8+{{@damageMod}}");
    expect(withCriticalDice("2d6+1d4+3")).toBe("4d6+2d4+3");
    expect(withCriticalDice("d6")).toBe("2d6");
    expect(withCriticalDice("{{@damageDice}}+{{@damageMod}}")).toBe("{{@damageDice}}+{{@damageMod}}");
  });
});

describe("the play view's roll buttons", () => {
  async function mount(values: Record<string, unknown>, roll: { expression: string; system?: string }, locale: "zh-TW" | "en" = "zh-TW", damage = false) {
    const context = { values, system } as unknown as PlayContextValue;
    render(
      <Providers locale={locale}>
        <PlayContext.Provider value={context}>
          <PlayRollButton onEdit={() => {}} roll={roll as never} data={values} label="Athletics" aria-label="Roll Athletics" damage={damage}>
            +5
          </PlayRollButton>
        </PlayContext.Provider>
      </Providers>,
    );
    return screen.findByRole("button", { name: "Roll Athletics" });
  }

  it("rolls a d20 test at once on a tap, normal, with Exhaustion counted", async () => {
    const button = await mount({ athletics: 5, exhaustion: 1, conditions: ["exhaustion"] }, { expression: "{{#d20[@athletics-@d20Penalty]}}" });
    await act(async () => fireEvent.click(button));
    expect(executeRoll).toHaveBeenCalledTimes(1);
    const [config, context, label, overrides] = executeRoll.mock.calls[0];
    expect(config).toMatchObject({ expression: "{{#d20[@athletics-@d20Penalty]}}" });
    expect(context).toMatchObject({ athletics: 5, d20Penalty: 2 });
    expect(label).toBe("Athletics");
    expect(overrides).toEqual({ adv: 0 });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the dialog on a right-click, names the Exhaustion already counted, and rolls its choice", async () => {
    const button = await mount({ athletics: 5, exhaustion: 2, conditions: ["exhaustion"] }, { expression: "{{#d20[@athletics-@d20Penalty]}}" }, "en");
    await act(async () => {
      fireEvent.contextMenu(button);
    });
    const dialog = await screen.findByRole("dialog", { name: "Athletics" }, LAZY);
    expect(dialog).toHaveTextContent("Exhaustion −4 already counted");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Advantage" }));
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: "Modifier" }), { target: { value: "-1" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "+1d6" }));
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Roll" })));
    const [config, context, , overrides] = executeRoll.mock.calls[0];
    expect(config).toMatchObject({ expression: "{{#d20[(@athletics-@d20Penalty)-1]}}" });
    expect(context).toMatchObject({ d20Penalty: 4 });
    expect(overrides).toEqual({ adv: 1, xn: 1, xd: 6 });
  });

  it("rolls a damage button's dice on a tap; its dialog doubles them on a Critical Hit and adds a modifier", async () => {
    const button = await mount({ dice: "1d8" }, { expression: "{{@dice}}", system: "dnd5e" }, "en", true);
    await act(async () => fireEvent.click(button));
    expect(executeRoll.mock.calls[0][0]).toMatchObject({ expression: "1d8" });
    executeRoll.mockClear();
    await act(async () => {
      fireEvent.contextMenu(button);
    });
    const dialog = await screen.findByRole("dialog", { name: "Athletics" }, LAZY);
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Critical Hit" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Minus 1" }));
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Roll" })));
    expect(executeRoll.mock.calls[0][0]).toMatchObject({ expression: "2d8-1" });
  });

  it("keeps a feature's or a heal's dice a plain button: a right-click opens nothing", async () => {
    const button = await mount({ dice: "1d8" }, { expression: "{{@dice}}", system: "dnd5e" });
    await act(async () => {
      fireEvent.contextMenu(button);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => fireEvent.click(button));
    expect(executeRoll).toHaveBeenCalledTimes(1);
  });
});
