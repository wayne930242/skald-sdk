import type { DiceRoll } from "@skald/dice";

export interface DiceDispatchResult {
  success: boolean;
  error?: string;
  /** The database error code (Postgres SQLSTATE) when the send was refused by the database */
  code?: string;
}

export interface DiceDispatchHandler {
  id: string;
  name: string;
  isAvailable: () => boolean;
  dispatch: (roll: DiceRoll) => Promise<void>;
}

/**
 * Central dice dispatch manager.
 * Owns dice delivery flow and routes to the first available handler.
 */
export class DiceDispatchManager {
  private handlers: DiceDispatchHandler[] = [];

  registerHandler(handler: DiceDispatchHandler): void {
    this.handlers.push(handler);
  }

  removeHandler(id: string): void {
    this.handlers = this.handlers.filter((handler) => handler.id !== id);
  }

  async dispatch(roll: DiceRoll): Promise<DiceDispatchResult> {
    const handler = this.handlers.find((candidate) => candidate.isAvailable());
    if (!handler) {
      return {
        success: false,
        error: "No dice handler available",
      };
    }

    try {
      await handler.dispatch(roll);
      return { success: true };
    } catch (error) {
      // postgrest-js hands back `{ code, message, details, hint }` as a plain object, not an Error
      const fields = (typeof error === "object" && error !== null ? error : {}) as Record<string, unknown>;
      const text = ["message", "details"]
        .map((key) => fields[key])
        .filter((value): value is string => typeof value === "string" && value !== "")
        .join(" ");
      return {
        success: false,
        error: text || "Dice dispatch failed",
        ...(typeof fields.code === "string" && { code: fields.code }),
      };
    }
  }

  getAvailableHandlerIds(): string[] {
    return this.handlers.filter((handler) => handler.isAvailable()).map((handler) => handler.id);
  }
}

export const diceDispatchManager = new DiceDispatchManager();
