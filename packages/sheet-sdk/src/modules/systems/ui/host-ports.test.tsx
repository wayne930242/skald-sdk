import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { DiceRoll } from "@skald/dice";
import { clearRollSession, sendDiceRoll, setRollSession } from "@skald/sheet-sdk/modules/rolls/ui/stores/roll-session-store";
import { RollSessionTransportBinding } from "@skald/sheet-sdk/modules/rolls/ui/stores/roll-session-transport";
import { bindHostPort, defineHostPort, HostPortsProvider, useHostPort } from "./host-ports";
import { corePorts } from "./core-ports";

const greeting = defineHostPort<(name: string) => string>("test.greeting");
const hello = bindHostPort(greeting, (name) => `hello ${name}`);
const hi = bindHostPort(greeting, (name) => `hi ${name}`);

const roll = {
  id: "roll-1", type: "simple", timestamp: new Date("2026-11-23T00:00:00Z"), rollerId: "user-1",
  rollerName: "Alice", notation: "1d6", rolls: [3], total: 3, visibility: "all",
} as DiceRoll;

afterEach(() => {
  cleanup();
  clearRollSession();
  vi.restoreAllMocks();
});

describe("host ports", () => {
  it("reads null for a port the host does not register", () => {
    const { result } = renderHook(() => useHostPort(greeting));
    expect(result.current).toBeNull();
  });

  it("reads the registered implementation, an inner provider overriding the outer one", () => {
    const outer = ({ children }: { children: ReactNode }) => <HostPortsProvider ports={[hello]}>{children}</HostPortsProvider>;
    expect(renderHook(() => useHostPort(greeting)?.("Elin"), { wrapper: outer }).result.current).toBe("hello Elin");

    const nested = ({ children }: { children: ReactNode }) => (
      <HostPortsProvider ports={[hello]}>
        <HostPortsProvider ports={[hi]}>{children}</HostPortsProvider>
      </HostPortsProvider>
    );
    expect(renderHook(() => useHostPort(greeting)?.("Elin"), { wrapper: nested }).result.current).toBe("hi Elin");
  });

  it("names each core port by its key", () => {
    for (const [key, port] of Object.entries(corePorts)) expect(port.id).toBe(key);
  });
});

describe("rollSessionSender port", () => {
  it("posts nothing to a bound session on a host without a transport", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<RollSessionTransportBinding />);
    setRollSession("table-1", "user-1", "Alice", undefined);
    expect(await sendDiceRoll(roll)).toBe(false);
    expect(warn).toHaveBeenCalledWith("[Chat] No roll session transport");
  });

  it("posts through the registered transport while it is mounted", async () => {
    const transport = vi.fn(async () => true);
    const ports = [bindHostPort(corePorts.rollSessionSender, transport)];
    const view = render(<HostPortsProvider ports={ports}><RollSessionTransportBinding /></HostPortsProvider>);
    setRollSession("table-1", "user-1", "Alice", "a.png");
    expect(await sendDiceRoll(roll)).toBe(true);
    expect(transport).toHaveBeenCalledWith(roll, {
      currentUserId: "user-1", currentUserName: "Alice", currentUserAvatarUrl: "a.png", currentTableId: "table-1",
    });

    vi.spyOn(console, "warn").mockImplementation(() => {});
    act(() => view.unmount());
    expect(await sendDiceRoll(roll)).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("keeps the outer transport bound when a nested provider's binding unmounts", async () => {
    const transport = vi.fn(async () => true);
    const ports = [bindHostPort(corePorts.rollSessionSender, transport)];
    function Tree({ inner }: { inner: boolean }) {
      return (
        <HostPortsProvider ports={ports}>
          <RollSessionTransportBinding />
          {inner && <HostPortsProvider ports={ports}><RollSessionTransportBinding /></HostPortsProvider>}
        </HostPortsProvider>
      );
    }
    const view = render(<Tree inner />);
    view.rerender(<Tree inner={false} />);
    setRollSession("table-1", "user-1", "Alice", undefined);
    expect(await sendDiceRoll(roll)).toBe(true);
  });
});
