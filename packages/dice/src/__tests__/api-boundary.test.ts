import { describe, it, expect } from "vitest";
import * as diceModule from "../index";

describe("API Boundary", () => {
  describe("public API exports", () => {
    it("should export executeRollExpression", () => {
      expect(diceModule.executeRollExpression).toBeDefined();
      expect(typeof diceModule.executeRollExpression).toBe("function");
    });

    it("should export rollDiceExpression", () => {
      expect(diceModule.rollDiceExpression).toBeDefined();
      expect(typeof diceModule.rollDiceExpression).toBe("function");
    });

    it("should export rollCoC7eSkillCheck", () => {
      expect(diceModule.rollCoC7eSkillCheck).toBeDefined();
      expect(typeof diceModule.rollCoC7eSkillCheck).toBe("function");
    });

    it("should export rollDice", () => {
      expect(diceModule.rollDice).toBeDefined();
      expect(typeof diceModule.rollDice).toBe("function");
    });

    it("should export calculateSuccessLevel", () => {
      expect(diceModule.calculateSuccessLevel).toBeDefined();
      expect(typeof diceModule.calculateSuccessLevel).toBe("function");
    });

    it("should export MacroResolver", () => {
      expect(diceModule.MacroResolver).toBeDefined();
    });

    it("should export createRollEvaluator", () => {
      expect(diceModule.createRollEvaluator).toBeDefined();
      expect(typeof diceModule.createRollEvaluator).toBe("function");
    });
  });

  describe("private functions should NOT be exported", () => {
    it("should NOT export rollSingleDie", () => {
      expect(
        (diceModule as Record<string, unknown>).rollSingleDie
      ).toBeUndefined();
    });

    it("should NOT export shouldExplode", () => {
      expect(
        (diceModule as Record<string, unknown>).shouldExplode
      ).toBeUndefined();
    });

    it("should NOT export rollTensDie", () => {
      expect(
        (diceModule as Record<string, unknown>).rollTensDie
      ).toBeUndefined();
    });

    it("should NOT export rollUnitsDie", () => {
      expect(
        (diceModule as Record<string, unknown>).rollUnitsDie
      ).toBeUndefined();
    });
  });

});
