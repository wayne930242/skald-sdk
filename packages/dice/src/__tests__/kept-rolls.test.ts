import { describe, expect, it } from "vitest";
import { keptRollFlags, rollDiceExpression } from "../index";

describe("keptRollFlags", () => {
  it("marks the higher face of a keep-lowest roll as dropped", () => {
    expect(keptRollFlags([20, 14], "2d20kl1+5")).toEqual([false, true]);
  });

  it("marks the lower face of a keep-highest roll as dropped", () => {
    expect(keptRollFlags([7, 18], "2d20kh1+3")).toEqual([false, true]);
    expect(keptRollFlags([7, 18], "2d20k1")).toEqual([false, true]);
  });

  it("drops the lowest of 4d6dl1, one face only on a tie", () => {
    expect(keptRollFlags([3, 1, 6, 1], "4d6dl1")).toEqual([true, true, true, false]);
  });

  it("reads each group's faces in order and ignores a system prefix and a comparison", () => {
    expect(keptRollFlags([2, 9, 4], "dnd:2d20kh1+1d4>=15")).toEqual([false, true, true]);
  });

  it("keeps every face when nothing is dropped or the faces do not match the notation", () => {
    expect(keptRollFlags([4, 5], "2d6+3")).toEqual([true, true]);
    expect(keptRollFlags([1, 0, -1, 1], "4dF+2")).toEqual([true, true, true, true]);
    expect(keptRollFlags([20, 14, 3], "2d20kl1")).toEqual([true, true, true]);
    expect(keptRollFlags([6, 6, 2], "2d6!kh1")).toEqual([true, true, true]);
    expect(keptRollFlags([20, 14], undefined)).toEqual([true, true]);
    expect(keptRollFlags([20, 14], "not dice")).toEqual([true, true]);
  });

  it("agrees with the roller on which faces it kept", () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (const notation of ["2d20kl1+5", "2d20kh1", "4d6dl1", "5d10dh2", "3d8kl2+1d4"]) {
      for (let i = 0; i < 50; i++) {
        const result = rollDiceExpression(notation, random)!;
        const faces = result.dice.flatMap((die) => die.rolls);
        const kept = result.dice.flatMap((die) => die.detailedRolls!.map((roll) => roll.kept));
        expect(keptRollFlags(faces, notation)).toEqual(kept);
      }
    }
  });

  it("reads a 10 KB hostile notation in linear time", () => {
    for (const notation of ["<".repeat(10_000) + "\n", "=".repeat(5_000) + "\n".repeat(5_000), "2d20kh1" + " ".repeat(10_000) + "x"]) {
      const start = performance.now();
      expect(keptRollFlags([7, 18], notation)).toEqual([true, true]);
      expect(performance.now() - start).toBeLessThan(50);
    }
  });

  it("still cuts the comparator and prefix off normal notations", () => {
    expect(keptRollFlags([20, 14], "dnd5e:2d20kl1+5>=15")).toEqual([false, true]);
    expect(keptRollFlags([20, 14], "2d20kh1<=10")).toEqual([true, false]);
  });
});
