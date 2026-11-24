// packages/dice/src/handlers/types.ts
import type { RollExpressionResult } from "../roll-expression/types";

/**
 * Context for a roll execution
 */
export interface RollContext {
  /** Roller's user ID */
  rollerId: string;
  /** Roller's display name */
  rollerName: string;
  /** Character ID (if rolling for a character) */
  characterId?: string;
  /** Character name */
  characterName?: string;
  /** Visibility setting */
  visibility?: "all" | "gm" | "self";
}

/**
 * Options for roll execution
 */
export interface RollOptions {
  /** Label to display (e.g., skill name) */
  label?: string;
  /** Bonus/penalty dice count */
  bonusDice?: number;
  /** Show 3D dice animation */
  animate?: boolean;
  /** Additional context variables */
  context?: Record<string, number>;
}

/**
 * Roll handler result
 */
export interface RollHandlerResult {
  /** Whether the roll was handled successfully */
  success: boolean;
  /** The roll result */
  result?: RollExpressionResult;
  /** Error message if failed */
  error?: string;
  /** Handler-specific payload (e.g., Discord message ID) */
  payload?: unknown;
}

/**
 * Unified roll handler interface
 *
 * All roll destinations (chat, toast, discord) implement this interface
 */
export interface RollHandler {
  /** Handler identifier */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /**
   * Execute a roll and handle the result
   *
   * @param expression - Roll expression (e.g., "coc7:1d100<={{@dex}}")
   * @param context - Roll context (who is rolling)
   * @param options - Additional options
   * @returns Handler result
   */
  handle(
    expression: string,
    context: RollContext,
    options?: RollOptions,
  ): Promise<RollHandlerResult>;

  /**
   * Check if this handler is available/ready
   */
  isAvailable(): boolean;
}

/**
 * Handler that supports 3D dice animation
 */
export interface AnimatedRollHandler extends RollHandler {
  /** Whether animation is currently enabled */
  isAnimationEnabled(): boolean;

  /** Set animation enabled state */
  setAnimationEnabled(enabled: boolean): void;
}

/**
 * Handler that sends to a remote destination (chat, discord)
 */
export interface RemoteRollHandler extends RollHandler {
  /** Whether currently connected to remote */
  isConnected(): boolean;
}
