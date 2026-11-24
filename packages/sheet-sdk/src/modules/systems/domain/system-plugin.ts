import type { SystemConfig } from "@skald/types/system";
import type { BuiltinLocalSystemData } from "./builtin-local-system-data";

export type SystemMessages = Record<string, unknown>;

export interface SystemPresentation {
  readonly hue: number;
  readonly icon: "anchor" | "dices" | "glasses" | "wind";
}

interface BuiltinSystemRegistrationBase {
  readonly config: SystemConfig;
  readonly presentation: SystemPresentation;
  loadBuiltinData(): Promise<BuiltinLocalSystemData>;
  skillLabel?(locale: string, label: string): string;
}

/**
 * A System's client message catalog: bundled with the registry (`messages`), or loaded on demand
 * (`loadMessages`) when it is too large to ride every sheet and session first load.
 */
export type BuiltinSystemRegistration = BuiltinSystemRegistrationBase &
  (
    | { messages(locale: string): SystemMessages; loadMessages?: never }
    | { loadMessages(locale: string): Promise<SystemMessages>; messages?: never }
  );

/** One plugin can own several slugs, each with independent data and presentation. */
export interface SystemPlugin {
  readonly systems: Readonly<Record<string, BuiltinSystemRegistration>>;
}
