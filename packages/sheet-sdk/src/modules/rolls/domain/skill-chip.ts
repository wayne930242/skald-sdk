export interface SkillChip {
  name: string;
  /** The target value on the card now; none when the card does not show one */
  value?: number;
  roll: () => void;
}
