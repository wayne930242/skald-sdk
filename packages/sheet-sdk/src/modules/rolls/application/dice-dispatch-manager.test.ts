import { describe, it, expect, vi } from "vitest";
import type { DiceRoll } from "@skald/dice";
import { DiceDispatchManager } from "./dice-dispatch-manager";

describe("DiceDispatchManager", () => {
  const sampleRoll: DiceRoll = {
    id: "roll-1",
    timestamp: new Date("2026-02-14T00:00:00.000Z"),
    rollerId: "user-1",
    rollerName: "Tester",
    visibility: "all",
    type: "simple",
    notation: "1d6",
    rolls: [4],
    total: 4,
  };

  it("dispatches to first available handler", async () => {
    const manager = new DiceDispatchManager();
    const dispatch = vi.fn().mockResolvedValue(undefined);

    manager.registerHandler({
      id: "chat",
      name: "Chat",
      isAvailable: () => true,
      dispatch,
    });

    const result = await manager.dispatch(sampleRoll);

    expect(result.success).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(sampleRoll);
  });

  it("uses registration order among available handlers", async () => {
    const manager = new DiceDispatchManager();
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);

    manager.registerHandler({
      id: "first",
      name: "First",
      isAvailable: () => true,
      dispatch: first,
    });
    manager.registerHandler({
      id: "second",
      name: "Second",
      isAvailable: () => true,
      dispatch: second,
    });

    const result = await manager.dispatch(sampleRoll);

    expect(result.success).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("returns error when no handler is available", async () => {
    const manager = new DiceDispatchManager();

    manager.registerHandler({
      id: "chat",
      name: "Chat",
      isAvailable: () => false,
      dispatch: vi.fn(),
    });

    const result = await manager.dispatch(sampleRoll);

    expect(result.success).toBe(false);
    expect(result.error).toBe("No dice handler available");
  });

  it("removes handlers by id and dispatches to remaining available handler", async () => {
    const manager = new DiceDispatchManager();
    const removedDispatch = vi.fn().mockResolvedValue(undefined);
    const activeDispatch = vi.fn().mockResolvedValue(undefined);

    manager.registerHandler({
      id: "removed",
      name: "Removed",
      isAvailable: () => true,
      dispatch: removedDispatch,
    });
    manager.registerHandler({
      id: "active",
      name: "Active",
      isAvailable: () => true,
      dispatch: activeDispatch,
    });

    manager.removeHandler("removed");
    const result = await manager.dispatch(sampleRoll);

    expect(result.success).toBe(true);
    expect(removedDispatch).not.toHaveBeenCalled();
    expect(activeDispatch).toHaveBeenCalledWith(sampleRoll);
  });

  it("returns thrown error message when handler dispatch rejects with Error", async () => {
    const manager = new DiceDispatchManager();
    manager.registerHandler({
      id: "failing",
      name: "Failing",
      isAvailable: () => true,
      dispatch: vi.fn().mockRejectedValue(new Error("network down")),
    });

    const result = await manager.dispatch(sampleRoll);

    expect(result).toEqual({
      success: false,
      error: "network down",
    });
  });

  it("uses fallback error message when handler rejects non-Error value", async () => {
    const manager = new DiceDispatchManager();
    manager.registerHandler({
      id: "failing",
      name: "Failing",
      isAvailable: () => true,
      dispatch: vi.fn().mockRejectedValue("unknown failure"),
    });

    const result = await manager.dispatch(sampleRoll);

    expect(result).toEqual({
      success: false,
      error: "Dice dispatch failed",
    });
  });

  it("returns only currently available handler ids", () => {
    const manager = new DiceDispatchManager();
    manager.registerHandler({
      id: "available-1",
      name: "Available 1",
      isAvailable: () => true,
      dispatch: vi.fn(),
    });
    manager.registerHandler({
      id: "unavailable",
      name: "Unavailable",
      isAvailable: () => false,
      dispatch: vi.fn(),
    });
    manager.registerHandler({
      id: "available-2",
      name: "Available 2",
      isAvailable: () => true,
      dispatch: vi.fn(),
    });

    expect(manager.getAvailableHandlerIds()).toEqual([
      "available-1",
      "available-2",
    ]);
  });

  it("hands back the database error code, so a caller can tell a refused duplicate from an outage", async () => {
    const manager = new DiceDispatchManager();
    manager.registerHandler({
      id: "chat",
      name: "Chat",
      isAvailable: () => true,
      dispatch: vi.fn().mockRejectedValue(
        Object.assign(new Error("duplicate key value"), { code: "23505" }),
      ),
    });

    expect(await manager.dispatch(sampleRoll)).toEqual({
      success: false,
      error: "duplicate key value",
      code: "23505",
    });
  });
});

describe("DiceDispatchManager with a plain-object error", () => {
  it("keeps code, message and details of an error-shaped object", async () => {
    const manager = new DiceDispatchManager();
    manager.registerHandler({
      id: "chat",
      name: "Chat",
      isAvailable: () => true,
      dispatch: () => Promise.reject({ code: "23505", message: "duplicate key", details: "Key exists", hint: null }),
    });
    const result = await manager.dispatch({ id: "r" } as DiceRoll);
    expect(result).toEqual({ success: false, error: "duplicate key Key exists", code: "23505" });
  });
});
