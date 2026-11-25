/** The helper's rules, kept in one place (boss defaults, CLASS-IMPL §4 and §6). */
export const LEVEL_UP_RULES = {
  maxLevel: 20,
  /** One level per run; the dialog offers 「繼續升級」 after apply. */
  levelsPerRun: 1,
  /** Multiclass (CLASS-IMPL §7.4): advance any sheet class or add one; `level` stays the total. */
  multiclass: true,
  /** An ability score improvement never raises a score above this. */
  abilityCap: 20,
  /** Points of an ability score improvement: +2 to one or +1 to two. */
  asiPoints: 2,
  /** A rolled hit point result is stored as its difference from the average here (open question 2). */
  hpRollField: "hpMaxMisc",
  asiFeatRef: "feat:ability-score-improvement",
} as const;
