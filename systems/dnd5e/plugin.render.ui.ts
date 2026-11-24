import type { SystemPluginRenderUi } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";
import { AdvantageRollControl } from "./sheet/advantage-roll-control";
import { loadD20RollOptions, loadDamageRollOptions } from "./sheet/d20-roll-gesture";

/** Keyed by the dice rule (`dsl-roll-rules.json` / roll-macros `defaultSystem`), not by slug. */
export const dnd5ePluginRenderUi: SystemPluginRenderUi = {
  rollControls: { dnd5e: AdvantageRollControl },
  // A tile or a stat-list row opens the same dialog as the field's button: a d20 Test's, or damage's.
  rollOptions: { dnd5e: { withBonusDice: loadD20RollOptions, otherRolls: loadDamageRollOptions } },
};
