"use client";

import { useLocale, useTranslations } from "next-intl";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { fieldRoll, useOpenDndEditor, usePlay } from "./play-context";
import { PlayRollButton } from "./play-roll-button";
import { OverrideMark } from "@skald/sheet-sdk/modules/character/ui/derived/override-mark";
import { ABILITIES, num, signed, SKILLS, text } from "./play-model";

/** The proficiency mark: open (none), filled (proficient), ringed (expertise). */
function ProficiencyDot({ level }: { level: "none" | "proficient" | "expertise" }) {
  return (
    <span
      aria-hidden="true"
      data-prof={level}
      className={cn(
        "inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border-2",
        level === "none" ? "border-muted-foreground/60" : "border-foreground",
        level === "proficient" && "bg-foreground",
      )}
    >
      {level === "expertise" && <span className="size-1.5 rounded-full bg-foreground" />}
    </span>
  );
}

function profLevel(value: unknown): "none" | "proficient" | "expertise" {
  return value === "expertise" ? "expertise" : value === "proficient" || value === true ? "proficient" : "none";
}

/** The six ability blocks: score, a big modifier (check) and the saving throw. */
export function AbilityGrid() {
  const t = useTranslations("play");
  const tAbility = useTranslations("ability");
  const { values, schema } = usePlay();
  const open = useOpenDndEditor();
  return (
    <div className="grid grid-cols-3 gap-2" data-play-abilities>
      {ABILITIES.map((ability) => {
        const name = tAbility(ability);
        const mod = num(values[`${ability}Mod`]);
        const save = num(values[`${ability}Save`]);
        const saveProf = values[`${ability}SaveProf`] === true;
        return (
          <section key={ability} className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-2" aria-label={name}>
            <div className="flex items-baseline justify-between px-1 text-xs text-muted-foreground">
              <span>{name}</span>
              <span className="tabular-nums" data-play-score>{num(values[ability], 10)}</span>
            </div>
            <PlayRollButton
              onEdit={() => open(`ability:${ability}`)}
              roll={fieldRoll(schema, `${ability}Mod`)}
              data={values}
              label={t("abilities.check", { ability: name })}
              icon={false}
              aria-label={`${t("abilities.check", { ability: name })} ${signed(mod)}`}
              className="min-h-12 border-transparent bg-transparent text-3xl font-semibold hover:bg-muted/60"
            >
              {signed(mod)}
            </PlayRollButton>
            <PlayRollButton
              onEdit={() => open(`ability:${ability}`)}
              roll={fieldRoll(schema, `${ability}Save`)}
              data={values}
              label={t("abilities.saveRoll", { ability: name })}
              icon={false}
              aria-label={`${t("abilities.saveRoll", { ability: name })} ${signed(save)}${saveProf ? ` · ${t("abilities.proficient")}` : ""}`}
              className={cn("min-h-11 justify-between px-2.5 text-sm font-normal sm:min-h-9", saveProf ? "border-foreground/30 bg-muted" : "border-transparent bg-muted/50")}
            >
              <span className="flex items-center gap-1.5">
                <ProficiencyDot level={saveProf ? "proficient" : "none"} />
                <span className="text-muted-foreground">{t("abilities.save")}</span>
              </span>
              <span className="font-semibold">
                {signed(save)}
                <OverrideMark fieldId={`${ability}Save`} />
              </span>
            </PlayRollButton>
          </section>
        );
      })}
    </div>
  );
}

/** The skill list with its proficiency marks; each row is one tap target that rolls. */
export function SkillList() {
  const t = useTranslations("play");
  const tSkill = useTranslations("skill");
  const tAbility = useTranslations("ability");
  const locale = useLocale();
  const { values, schema } = usePlay();
  const open = useOpenDndEditor();
  const short = (ability: string) => (locale.startsWith("zh") ? tAbility(ability).slice(0, 1) : ability.toUpperCase());
  return (
    <section className="rounded-xl border border-border bg-card p-3" aria-label={t("skills.title")} data-play-skills>
      <header className="mb-1 flex items-baseline justify-between px-1">
        <h3 className="text-base font-semibold">{t("skills.title")}</h3>
        <span className="text-xs text-muted-foreground">
          {t("skills.passive", { value: num(values.passivePerception) })}
          <OverrideMark fieldId="passivePerception" />
        </span>
      </header>
      <ul>
        {SKILLS.map((skill) => {
          const name = tSkill(skill.id);
          const value = num(values[skill.id]);
          const level = profLevel(text(values[`${skill.id}Prof`]));
          // Worn armor with Stealth disadvantage (SRD 5.2.1 p.92): a chip, the roll is the player's.
          const chip = skill.id === "stealth" && values.armorStealth === true ? t("armorStealth") : null;
          return (
            <li key={skill.id}>
              <PlayRollButton
                onEdit={() => open(`skill:${skill.id}`)}
                roll={fieldRoll(schema, skill.id)}
                data={values}
                label={name}
                icon={false}
                aria-label={`${name} ${signed(value)}${level !== "none" ? ` · ${t(`abilities.${level}`)}` : ""}${chip ? ` · ${chip}` : ""}`}
                data-play-skill={skill.id}
                className="grid min-h-11 w-full grid-cols-[1rem_minmax(0,1fr)_2.5rem_2.75rem] items-center gap-2 rounded-md border-transparent bg-transparent px-1.5 text-left text-sm font-normal hover:bg-muted/60 sm:min-h-8"
              >
                <ProficiencyDot level={level} />
                <span className="truncate">
                  {name}
                  {chip && <span className="ml-1 text-2xs text-destructive">{chip}</span>}
                </span>
                <span className="text-xs text-muted-foreground">{short(skill.ability)}</span>
                <span className="text-right font-semibold">
                  {signed(value)}
                  <OverrideMark fieldId={skill.id} />
                </span>
              </PlayRollButton>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
