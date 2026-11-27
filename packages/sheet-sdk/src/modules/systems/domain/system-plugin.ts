import type { SystemConfig } from "@skald/types/system";
import type { BuiltinLocalSystemData } from "./builtin-local-system-data";
import type { CharacterWizard } from "@skald/types/wizard";
import type { TableSetupWizardSeed } from "./table-setup";

export type SystemMessages = Record<string, unknown>;

/** A catalog row of a table character that a book the table locked off prints, named in both locales. */
export interface LockedTableOption {
  readonly id: string;
  readonly name: { readonly en: string; readonly "zh-TW": string | null };
}

export interface SystemPresentation {
  readonly hue: number;
  readonly coverUrl?: string;
  readonly icon: "anchor" | "dices" | "glasses" | "wind";
}

interface BuiltinSystemRegistrationBase {
  readonly config: SystemConfig;
  readonly presentation: SystemPresentation;
  loadBuiltinData(): Promise<BuiltinLocalSystemData>;
  skillLabel?(locale: string, label: string): string;
  /**
   * Upgrades a wizard of this System's built-in template that was published before the
   * System's current game data, so it runs on that data. Seeding replaces the game data before
   * the new Template Version publishes; until it does, or when Publish fails, the current
   * version is the earlier one. `gameData` is the System game data the same run hands the
   * engine: after a deploy and before seeding it is still the earlier data, which the earlier
   * wizard reads as it is. Resolves to `wizard` itself when it needs nothing.
   */
  backfillWizard?(wizard: CharacterWizard, gameData: Readonly<Record<string, unknown>>): Promise<CharacterWizard>;
  /**
   * The catalog rows of `data`, a new character of a table's player, from options the table's
   * locked wizard variables (`locked`, variable → value) turn off, such as a rulebook the GM
   * disabled, or that its wizard seed (`setup`, every preset with its policy) does not offer, such
   * as a creation method; empty when it keeps to them. The server checks it before it creates the character.
   */
  lockedTableOptions?(
    locked: Readonly<Record<string, unknown>>,
    data: Readonly<Record<string, unknown>>,
    setup?: TableSetupWizardSeed,
  ): Promise<readonly LockedTableOption[]>;
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
