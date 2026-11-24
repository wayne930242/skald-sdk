import { describe, expect, it, vi } from "vitest";
import { cachedUntilRejected } from "../play-messages";

describe("cachedUntilRejected (rev12-F005)", () => {
  it("returns the same promise while the load is pending or fulfilled", async () => {
    const cache = new Map<string, Promise<number>>();
    const load = vi.fn(async () => 1);
    const first = cachedUntilRejected(cache, "en", load);
    expect(cachedUntilRejected(cache, "en", load)).toBe(first);
    await first;
    expect(cachedUntilRejected(cache, "en", load)).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("forgets a failed load so the next mount imports again", async () => {
    const cache = new Map<string, Promise<string>>();
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("ChunkLoadError"))
      .mockResolvedValueOnce("ok");
    await expect(cachedUntilRejected(cache, "zh-TW", load)).rejects.toThrow("ChunkLoadError");
    await expect(cachedUntilRejected(cache, "zh-TW", load)).resolves.toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
