"use client";

import { useTranslations } from "next-intl";
import { useFatePlay } from "./play-context";
import type { FatePlaySkill } from "./play-model";

/** Player name, system translation, preset-list label, then schema name or ID. */
export function useSkillName() {
  const t = useTranslations("skill");
  const { schema, skillLabels } = useFatePlay();
  const field = schema.fields.skills;
  const stock = field?.type === "fate-skill-pyramid" ? field.defaultSkills ?? [] : [];
  return ({ id, customName }: Pick<FatePlaySkill, "id" | "customName">) =>
    customName ?? (t.has(id) ? t(id) : skillLabels?.[id] ?? stock.find((entry) => entry.id === id)?.name ?? id);
}
