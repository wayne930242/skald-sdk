// B-023: in edit mode a sheet roll's gesture edits instead (the contract on `InteractionMode`):
// a tap, Enter, Space, Shift+Enter and the context-menu key call `onEdit`; a long-press does
// nothing; a right-click is the browser's; no dialog, hint or preload. Without `onEdit`, and in
// play mode, the gesture keeps rolling (the existing gesture tests pin that behavior).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { toast } from "sonner";
import en from "@skald/sheet-sdk/messages/en.json";
import { InteractionModeContext, type InteractionMode } from "@skald/sheet-sdk/modules/rolls/ui/context/interaction-mode";
import {
  useRollGesture,
  type CustomRollOptionsModule,
  type RollControlPayload,
} from "@skald/sheet-sdk/modules/rolls/ui/dice/use-roll-gesture";

vi.mock("sonner", () => ({ toast: vi.fn() }));

const loadModule = vi.fn((): Promise<CustomRollOptionsModule> =>
  Promise.resolve({ default: () => <div role="dialog" />, loadHint: () => Promise.resolve("hint") }));
const load = () => loadModule();

const last: { gesture?: ReturnType<typeof useRollGesture> } = {};

function Harness({ onRoll, onEdit, custom }: { onRoll: (payload: RollControlPayload) => void; onEdit?: () => void; custom?: boolean }) {
  const gesture = useRollGesture({
    onRoll,
    onEdit,
    rollName: "Athletics",
    controls: custom ? undefined : { cocBonusDice: true },
    customOptions: custom ? { load } : undefined,
  });
  useEffect(() => {
    last.gesture = gesture;
  });
  return (
    <>
      <button type="button" aria-label="Athletics" {...gesture.buttonProps} />
      {gesture.dialog}
    </>
  );
}

function mount(mode: InteractionMode, options: { onEdit?: boolean; custom?: boolean } = {}) {
  const onRoll = vi.fn();
  const onEdit = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <InteractionModeContext.Provider value={mode}>
        <Harness onRoll={onRoll} onEdit={options.onEdit === false ? undefined : onEdit} custom={options.custom} />
      </InteractionModeContext.Provider>
    </NextIntlClientProvider>,
  );
  return { onRoll, onEdit, button: screen.getByRole("button", { name: "Athletics" }) };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(toast).mockClear();
  loadModule.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useRollGesture in edit mode with onEdit", () => {
  it("a tap, Enter, Space, Shift+Enter and the menu key edit and never roll", async () => {
    const { onRoll, onEdit, button } = mount("edit");
    await act(async () => fireEvent.click(button));
    await act(async () => fireEvent.keyDown(button, { key: "Enter" }));
    await act(async () => fireEvent.keyDown(button, { key: " " }));
    await act(async () => fireEvent.keyDown(button, { key: "Enter", shiftKey: true }));
    await act(async () => fireEvent.keyDown(button, { key: "ContextMenu" }));
    expect(onEdit).toHaveBeenCalledTimes(5);
    expect(onRoll).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  it("a 600 ms long-press neither rolls nor edits", async () => {
    vi.useFakeTimers();
    const { onRoll, onEdit, button } = mount("edit");
    fireEvent.pointerDown(button, { button: 0, clientX: 1, clientY: 1 });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.pointerUp(button);
    expect(onRoll).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves the right-click to the browser", () => {
    const { onRoll, onEdit, button } = mount("edit");
    const event = createEvent.contextMenu(button);
    fireEvent(button, event);
    expect(event.defaultPrevented).toBe(false);
    expect(onRoll).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("preloads nothing on a press and renders no dialog", () => {
    const { button } = mount("edit", { custom: true });
    fireEvent.pointerDown(button, { button: 0 });
    expect(loadModule).not.toHaveBeenCalled();
    expect(last.gesture?.dialog).toBeNull();
  });

  it("reports editing, no options and no popup attributes", () => {
    const { button } = mount("edit");
    expect(last.gesture?.editing).toBe(true);
    expect(last.gesture?.hasOptions).toBe(false);
    expect(button).not.toHaveAttribute("aria-haspopup");
    expect(button).not.toHaveAttribute("aria-keyshortcuts");
  });
});

describe("useRollGesture keeps rolling", () => {
  it("in edit mode without onEdit", async () => {
    const { onRoll, button } = mount("edit", { onEdit: false });
    expect(last.gesture?.editing).toBe(false);
    await act(async () => fireEvent.click(button));
    expect(onRoll).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("in play mode with onEdit", async () => {
    const { onRoll, onEdit, button } = mount("play");
    expect(last.gesture?.editing).toBe(false);
    await act(async () => fireEvent.click(button));
    expect(onRoll).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });
});
