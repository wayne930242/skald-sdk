// modules/character/ui/renderer/utils/fate-default-skills.ts
//
// 欄位沒有宣告 `defaultSkills` 時，Fate 技能金字塔與 `stat-list` 的 Fate 列來源共用的預設 19 個技能。
import type { FateDefaultSkill } from "@skald/types/schema";

export const DEFAULT_FATE_SKILLS: readonly FateDefaultSkill[] = [
  { id: "academics", name: "Academics" },
  { id: "athletics", name: "Athletics" },
  { id: "burglary", name: "Burglary" },
  { id: "contacts", name: "Contacts" },
  { id: "crafts", name: "Crafts" },
  { id: "deceive", name: "Deceive" },
  { id: "drive", name: "Drive" },
  { id: "empathy", name: "Empathy" },
  { id: "fight", name: "Fight" },
  { id: "investigate", name: "Investigate" },
  { id: "lore", name: "Lore" },
  { id: "notice", name: "Notice" },
  { id: "physique", name: "Physique" },
  { id: "provoke", name: "Provoke" },
  { id: "rapport", name: "Rapport" },
  { id: "resources", name: "Resources" },
  { id: "shoot", name: "Shoot" },
  { id: "stealth", name: "Stealth" },
  { id: "will", name: "Will" },
];
