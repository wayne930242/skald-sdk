// modules/rolls/domain/quick-dice.ts
//
// The quick dice chips and the default custom shortcuts. Shared by the dice panel
// (which fills its field) and the chat's quick bar (which rolls at once).

export const DICE_TYPES = [
  { sides: 4, label: "d4" },
  { sides: 6, label: "d6" },
  { sides: 8, label: "d8" },
  { sides: 10, label: "d10" },
  { sides: 12, label: "d12" },
  { sides: 20, label: "d20" },
  { sides: 100, label: "d%" },
] as const;

export const DEFAULT_SHORTCUT_EXPRESSIONS = ["2d6", "4dF"] as const;
