import { describe, expect, it } from "bun:test";
import { parseDiceExpression, validateDiceExpression } from "../parser";
import { rollDice, rollDiceExpression } from "../roller";

describe("擲骰輸入邊界", () => {
  for (const input of ["1d1/0", "1d1junk", "1d1++1", "1d1x1d1", "(1d1", "1d1)", "1d1kh1kh1"]) {
    it(`拒絕不完整語法 ${input}`, () => {
      expect(parseDiceExpression(input)).toBeNull();
      expect(validateDiceExpression(input).valid).toBe(false);
      expect(rollDiceExpression(input)).toBeNull();
    });
  }
  it("保留全部骰子仍是有效語法", () => {
    expect(validateDiceExpression("4d6kh4").valid).toBe(true);
  });
  it("解析時限制總骰數與輸入長度", () => {
    for (const input of ["1000000000d6", "600d6+600d6", "9".repeat(400) + "d6", " ".repeat(4097) + "d6"]) {
      expect(parseDiceExpression(input)).toBeNull();
    }
  });
  it("直接執行器也拒絕非有限或過量骰子", () => {
    // Infinity 不能直接交給舊版無界迴圈；先用 count=0 驗證邊界存在。
    expect(() => rollDice({count: 0, sides: 6})).toThrow();
    expect(() => rollDice({count: Infinity, sides: 6})).toThrow();
    expect(() => rollDice({count: 1001, sides: 6})).toThrow();
  });
});
