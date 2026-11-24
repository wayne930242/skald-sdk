import { describe, expect, it } from "vitest";
import type { ResourceField } from "@skald/types/schema";
import {
  advanceFollow,
  followStep,
  initialResourceValue,
  snapshotResources,
  type FollowCause,
  type FollowState,
} from "./follow-resource";

const synced = (value: number): FollowState => ({
  current: value,
  followed: value,
  inSync: true,
});
const playerSet = (current: number, followed: number): FollowState => ({
  current,
  followed,
  inSync: false,
});

describe("followStep 判定表", () => {
  it("沒有上一輪（掛載）：只量，不寫；目前值等於跟隨值才算同步", () => {
    for (const cause of ["local", "remote", "derived", "replace"] as FollowCause[]) {
      expect(
        followStep({ follow: "max", previous: undefined, current: 11, next: { max: 11 }, cause }),
      ).toEqual({ state: synced(11), write: undefined });
      expect(
        followStep({ follow: "max", previous: undefined, current: 9, next: { max: 11 }, cause }),
      ).toEqual({ state: playerSet(9, 11), write: undefined });
    }
  });

  it("整份取代：重新量，即使上一輪同步也不寫", () => {
    expect(
      followStep({
        follow: "max",
        previous: synced(11),
        current: 11,
        next: { max: 14 },
        cause: "replace",
      }),
    ).toEqual({ state: playerSet(11, 14), write: undefined });
    expect(
      followStep({
        follow: "max",
        previous: playerSet(9, 11),
        current: 14,
        next: { max: 14 },
        cause: "replace",
      }),
    ).toEqual({ state: synced(14), write: undefined });
  });

  it("同步中，本地編輯讓 max 從 11 變 14 → 寫 14，仍同步", () => {
    expect(
      followStep({
        follow: "max",
        previous: synced(11),
        current: 11,
        next: { max: 14 },
        cause: "local",
      }),
    ).toEqual({ state: synced(14), write: 14 });
  });

  it("同步中，max 變小 → 跟著降", () => {
    expect(
      followStep({
        follow: "max",
        previous: synced(14),
        current: 14,
        next: { max: 9 },
        cause: "local",
      }),
    ).toEqual({ state: synced(9), write: 9 });
  });

  it("不同步（玩家設過）→ 不寫，跟隨值經過目前值也維持不同步", () => {
    const first = followStep({
      follow: "max",
      previous: playerSet(9, 11),
      current: 9,
      next: { max: 9 },
      cause: "local",
    });
    expect(first).toEqual({ state: playerSet(9, 9), write: undefined });
    expect(
      followStep({
        follow: "max",
        previous: first.state,
        current: 9,
        next: { max: 14 },
        cause: "local",
      }),
    ).toEqual({ state: playerSet(9, 14), write: undefined });
  });

  it("目前值變了：重新量。設成別的值 → 不同步；打回跟隨值 → 同步", () => {
    for (const cause of ["local", "remote"] as FollowCause[]) {
      expect(
        followStep({ follow: "max", previous: synced(11), current: 7, next: { max: 11 }, cause }),
      ).toEqual({ state: playerSet(7, 11), write: undefined });
      expect(
        followStep({
          follow: "max",
          previous: playerSet(7, 11),
          current: 11,
          next: { max: 11 },
          cause,
        }),
      ).toEqual({ state: synced(11), write: undefined });
    }
  });

  it("目前值與跟隨值同一輪都變：照新的兩個值量，不寫", () => {
    expect(
      followStep({
        follow: "max",
        previous: synced(11),
        current: 12,
        next: { max: 14 },
        cause: "local",
      }),
    ).toEqual({ state: playerSet(12, 14), write: undefined });
    expect(
      followStep({
        follow: "max",
        previous: playerSet(9, 11),
        current: 14,
        next: { max: 14 },
        cause: "local",
      }),
    ).toEqual({ state: synced(14), write: undefined });
  });

  it("遠端移動跟隨值：不寫，先當作不同步；編輯端的寫入到了再量回同步", () => {
    const moved = followStep({
      follow: "max",
      previous: synced(11),
      current: 11,
      next: { max: 14 },
      cause: "remote",
    });
    expect(moved).toEqual({ state: playerSet(11, 14), write: undefined });
    expect(
      followStep({
        follow: "max",
        previous: moved.state,
        current: 14,
        next: { max: 14 },
        cause: "remote",
      }),
    ).toEqual({ state: synced(14), write: undefined });
  });

  it("遠端的跟隨值經過玩家設的目前值：不會變成同步", () => {
    expect(
      followStep({
        follow: "max",
        previous: playerSet(9, 11),
        current: 9,
        next: { max: 9 },
        cause: "remote",
      }),
    ).toEqual({ state: playerSet(9, 9), write: undefined });
  });

  it("資料沒變、衍生值變了（覆寫、範本）：不寫，同步狀態不變", () => {
    const overridden = followStep({
      follow: "max",
      previous: synced(11),
      current: 11,
      next: { max: 15 },
      cause: "derived",
    });
    expect(overridden).toEqual({
      state: { current: 11, followed: 15, inSync: true },
      write: undefined,
    });
    // 之後本地編輯移動跟隨值，沒被設過的目前值跟上
    expect(
      followStep({
        follow: "max",
        previous: overridden.state,
        current: 11,
        next: { max: 13 },
        cause: "local",
      }),
    ).toEqual({ state: synced(13), write: 13 });
    // 覆寫把跟隨值放到玩家設的目前值上，不算同步
    expect(
      followStep({
        follow: "max",
        previous: playerSet(9, 11),
        current: 9,
        next: { max: 9 },
        cause: "derived",
      }),
    ).toEqual({ state: playerSet(9, 9), write: undefined });
  });

  it("資料沒變的那一輪沿用記下的目前值（剛寫出去的跟隨值還沒回到資料裡）", () => {
    expect(
      followStep({
        follow: "max",
        previous: synced(14),
        current: 11, // 資料裡還是寫入前的值
        next: { max: 14 },
        cause: "derived",
      }),
    ).toEqual({ state: synced(14), write: undefined });
  });

  it("自己的寫入和下一個按鍵一起回來：目前值等於記下的值，不算被設定，繼續跟", () => {
    const first = followStep({
      follow: "max",
      previous: synced(10),
      current: 10,
      next: { max: 13 },
      cause: "local",
    });
    expect(first.write).toBe(13);
    expect(
      followStep({
        follow: "max",
        previous: first.state,
        current: 13,
        next: { max: 5 },
        cause: "local",
      }),
    ).toEqual({ state: synced(5), write: 5 });
  });

  it("同步中而新的跟隨值不是有限數字：先不寫，狀態留著，回來後再寫", () => {
    for (const max of [undefined, Number.NaN]) {
      const cleared = followStep({
        follow: "max",
        previous: synced(11),
        current: 11,
        next: { max },
        cause: "local",
      });
      expect(cleared).toEqual({
        state: { current: 11, followed: undefined, inSync: true },
        write: undefined,
      });
      expect(
        followStep({
          follow: "max",
          previous: cleared.state,
          current: 11,
          next: { max: 14 },
          cause: "local",
        }),
      ).toEqual({ state: synced(14), write: 14 });
    }
  });

  it("目前值從未設定 → 不同步，不寫（交給初始化）", () => {
    const mounted = followStep({
      follow: "max",
      previous: undefined,
      current: undefined,
      next: { max: 11 },
      cause: "remote",
    });
    expect(mounted.state.inSync).toBe(false);
    expect(
      followStep({
        follow: "max",
        previous: mounted.state,
        current: undefined,
        next: { max: 14 },
        cause: "local",
      }).write,
    ).toBeUndefined();
  });

  it("follow: start 追 start，不理 max 的變動", () => {
    const base = { follow: "start" as const, previous: synced(60), current: 60 };
    expect(
      followStep({ ...base, next: { start: 65, max: 99 }, cause: "local" }),
    ).toEqual({ state: synced(65), write: 65 });
    expect(
      followStep({ ...base, next: { start: 60, max: 90 }, cause: "local" }),
    ).toEqual({ state: synced(60), write: undefined });
  });

  it("follow: max 不理 start 的變動", () => {
    expect(
      followStep({
        follow: "max",
        previous: synced(99),
        current: 99,
        next: { start: 65, max: 99 },
        cause: "local",
      }),
    ).toEqual({ state: synced(99), write: undefined });
  });

  it("新值超過新 max 時限制在 max（follow: start），之後仍跟著 start 走", () => {
    const clamped = followStep({
      follow: "start",
      previous: synced(60),
      current: 60,
      next: { start: 70, max: 65 },
      cause: "local",
    });
    expect(clamped).toEqual({
      state: { current: 65, followed: 70, inSync: true },
      write: 65,
    });
    expect(
      followStep({
        follow: "start",
        previous: clamped.state,
        current: 65,
        next: { start: 50, max: 65 },
        cause: "local",
      }),
    ).toEqual({ state: synced(50), write: 50 });
  });

  it("沒有 follow → 不同步，不寫", () => {
    expect(
      followStep({
        follow: undefined,
        previous: undefined,
        current: 11,
        next: { max: 11 },
        cause: "local",
      }),
    ).toEqual({
      state: { current: 11, followed: undefined, inSync: false },
      write: undefined,
    });
  });

  it("冪等：寫入後以同一組值再走一步，不再產出更新", () => {
    const first = followStep({
      follow: "max",
      previous: synced(11),
      current: 11,
      next: { max: 14 },
      cause: "local",
    });
    expect(first.write).toBe(14);
    for (const cause of ["local", "remote", "derived"] as FollowCause[]) {
      expect(
        followStep({
          follow: "max",
          previous: first.state,
          current: 14,
          next: { max: 14 },
          cause,
        }),
      ).toEqual({ state: synced(14), write: undefined });
    }
  });
});

describe("initialResourceValue", () => {
  it("有 start 取 start，否則取 max，都沒有則 undefined", () => {
    expect(initialResourceValue({ start: 60, max: 99 })).toBe(60);
    expect(initialResourceValue({ max: 11 })).toBe(11);
    expect(initialResourceValue({})).toBeUndefined();
  });

  it("起始值超過上限時限制在上限", () => {
    expect(initialResourceValue({ start: 20, max: 11 })).toBe(11);
  });
});

const hp = {
  id: "hp",
  type: "resource",
  max: { from: "hp_max" },
  follow: "max",
} as ResourceField;
const san = {
  id: "san",
  type: "resource",
  current: "sanity.now",
  max: 99,
  start: { from: "pow" },
  follow: "start",
} as ResourceField;
const plain = { id: "fate", type: "resource" } as ResourceField;

describe("snapshotResources / advanceFollow", () => {
  const derived = (values: Record<string, unknown>) => (id: string) => values[id];
  /** 掛載時量出的狀態 */
  const mount = (
    fields: ResourceField[],
    values: Record<string, unknown>,
    data: Record<string, unknown>,
  ) =>
    advanceFollow({
      fields,
      previous: undefined,
      next: snapshotResources(fields, derived(values)),
      data,
      cause: "remote",
    });

  it("固定數字與衍生值來源都能解析，取不到的為 undefined", () => {
    expect(
      snapshotResources([hp, san, plain], derived({ hp_max: 11, pow: 60 })),
    ).toEqual({
      hp: { max: 11, start: undefined },
      san: { max: 99, start: 60 },
      fate: { max: undefined, start: undefined },
    });
    expect(snapshotResources([hp], derived({ hp_max: "x" })).hp.max).toBeUndefined();
  });

  it("依各資源的 follow 與資料路徑產出更新，沒宣告 follow 的資源不帶狀態", () => {
    const fields = [hp, san, plain];
    const data = { hp: { current: 11 }, sanity: { now: 60 } };
    const mounted = mount(fields, { hp_max: 11, pow: 60 }, data);
    expect(Object.keys(mounted.states)).toEqual(["hp", "san"]);

    const next = snapshotResources(fields, derived({ hp_max: 14, pow: 65 }));
    expect(
      advanceFollow({ fields, previous: mounted.states, next, data, cause: "local" }).updates,
    ).toEqual([
      { fieldId: "hp", path: "hp.current", value: 14 },
      { fieldId: "san", path: "sanity.now", value: 65 },
    ]);
  });

  it("手動改過的資源不被帶走，其餘照跟", () => {
    const fields = [hp, san];
    const data = { hp: { current: 8 }, sanity: { now: 60 } };
    const mounted = mount(fields, { hp_max: 11, pow: 60 }, data);
    const next = snapshotResources(fields, derived({ hp_max: 14, pow: 65 }));

    expect(
      advanceFollow({ fields, previous: mounted.states, next, data, cause: "local" }).updates,
    ).toEqual([{ fieldId: "san", path: "sanity.now", value: 65 }]);
  });

  it("第一次評估（沒有上一輪）不產出更新", () => {
    expect(mount([hp], { hp_max: 14 }, { hp: { current: 11 } })).toEqual({
      states: { hp: { current: 11, followed: 14, inSync: false } },
      updates: [],
    });
  });
});
