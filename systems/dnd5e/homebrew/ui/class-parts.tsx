import { useLocale, useTranslations } from "next-intl";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { CLASS_LIMITS, HIT_DICE, type ClassForm, type ClassMulticlassForm, type Progression } from "../domain/class";
import type { ClassCatalog } from "./class-context";
import { TextBox } from "./subclass-parts";
import { ColumnsEditor } from "./class-columns";
import { ItemPicker, RefLists, ToolChips } from "./ref-picker";

type Parts = { form: ClassForm; set(patch: Partial<ClassForm>): void; catalog: ClassCatalog };
type Option = { value: string; label: string };
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
const select = "block w-full rounded border bg-background p-2";

function Checks({ legend, options, value, change }: { legend: string; options: Option[]; value: readonly string[]; change(v: string[]): void }) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={value.includes(o.value)}
              onChange={(e) => change(e.target.checked ? [...value, o.value] : value.filter((v) => v !== o.value))}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Pick({ label, value, options, change }: { label: string; value: string; options: Option[]; change(v: string): void }) {
  return (
    <label className="block min-w-0 space-y-1 text-sm">
      <span>{label}</span>
      <select className={select} value={value} onChange={(e) => change(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Num({ label, value, change, min = 0, max }: { label: string; value: number; change(v: number): void; min?: number; max?: number }) {
  return (
    <label className="block min-w-0 space-y-1 text-sm">
      <span>{label}</span>
      <Input type="number" min={min} max={max} value={value} onChange={(e) => change(Number(e.target.value))} />
    </label>
  );
}

function useNames(catalog: ClassCatalog) {
  const zh = useLocale() === "zh-TW";
  const l = zh ? "zh" : "en";
  return {
    ability: (a: string) => catalog.abilityNames[a]?.[l] ?? a,
    skill: (s: string) => catalog.skillNames[s]?.[l] ?? s,
    cls: (c: string) => catalog.context.classNames[c]?.[l] ?? c,
  };
}

export function ChassisStep({ form, set, catalog }: Parts) {
  const t = useTranslations("homebrew.class");
  const names = useNames(catalog);
  const abilities = ABILITIES.map((a) => ({ value: a, label: names.ability(a) }));
  const skills = Object.keys(catalog.skillNames).map((s) => ({ value: s, label: names.skill(s) }));
  const from = form.skillChoice.from;
  const choice = form.toolChoice;
  return (
    <div className="space-y-4" data-class-step="chassis">
      <div className="grid gap-3 sm:grid-cols-2">
        <Pick label={t("hitDie")} value={String(form.hitDie)} options={HIT_DICE.map((d) => ({ value: String(d), label: `d${d}` }))}
          change={(v) => set({ hitDie: Number(v) as ClassForm["hitDie"] })} />
        <Pick label={t("unarmoredDefense")} value={form.unarmoredDefense}
          options={["none", "barbarian", "monk"].map((v) => ({ value: v, label: t(`unarmoredOption.${v}`) }))}
          change={(v) => set({ unarmoredDefense: v as ClassForm["unarmoredDefense"] })} />
      </div>
      <Checks legend={t("primaryAbility")} options={abilities} value={form.primaryAbility} change={(v) => set({ primaryAbility: v as ClassForm["primaryAbility"] })} />
      <Checks legend={t("saves")} options={abilities} value={form.saves} change={(v) => set({ saves: v as ClassForm["saves"] })} />
      <Checks legend={t("armor")} options={["light", "medium", "heavy", "shield"].map((v) => ({ value: v, label: t(`armorOption.${v}`) }))}
        value={form.armor} change={(v) => set({ armor: v as ClassForm["armor"] })} />
      <Checks legend={t("weapons")} options={["simple", "martial"].map((v) => ({ value: v, label: t(`weaponOption.${v}`) }))}
        value={form.weapons} change={(v) => set({ weapons: v as ClassForm["weapons"] })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Num label={t("skillCount")} value={form.skillChoice.count} max={4} change={(count) => set({ skillChoice: { ...form.skillChoice, count } })} />
        <label className="flex items-center gap-2 self-end text-sm">
          <input type="checkbox" checked={from === "any"} onChange={(e) => set({ skillChoice: { ...form.skillChoice, from: e.target.checked ? "any" : [] } })} />
          {t("skillAny")}
        </label>
      </div>
      {from !== "any" && <Checks legend={t("skillList")} options={skills} value={from} change={(v) => set({ skillChoice: { ...form.skillChoice, from: v } })} />}
      <RefLists catalog={catalog} />
      <ToolChips label={t("toolGrants")} catalog={catalog} value={form.toolGrants} change={(toolGrants) => set({ toolGrants })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextBox label={t("toolCategory")} value={choice?.category ?? ""} change={(category) => set({ toolChoice: category ? { category, count: choice?.count ?? 1 } : null })} />
        {choice && <Num label={t("toolCount")} value={choice.count} min={1} change={(count) => set({ toolChoice: { ...choice, count } })} />}
      </div>
      <Equipment form={form} set={set} catalog={catalog} />
      <Multiclass form={form} set={set} catalog={catalog} />
    </div>
  );
}

function Equipment({ form, set, catalog }: Parts) {
  const t = useTranslations("homebrew.class");
  const tb = useTranslations("homebrew");
  const options = form.startingEquipment;
  const put = (i: number, next: ClassForm["startingEquipment"][number] | null) =>
    set({ startingEquipment: next ? options.map((o, j) => (j === i ? next : o)) : options.filter((_, j) => j !== i) });
  return (
    <fieldset className="space-y-2 rounded border p-3">
      <legend className="font-medium">{t("equipment")}</legend>
      {options.map((o, i) => (
        <div key={i} className="space-y-2 border-l-2 pl-3">
          <div className="flex items-end gap-2">
            <strong className="text-sm">{t("equipmentOption", { letter: "ABC"[i] })}</strong>
            <Num label={t("gp")} value={o.gp} change={(gp) => put(i, { ...o, gp })} />
            <Button type="button" size="sm" variant="ghost" onClick={() => put(i, null)}>{tb("remove")}</Button>
          </div>
          {o.items.map((item, k) => (
            <div key={k} className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto]">
              <ItemPicker label={t("itemRef")} catalog={catalog} value={item.ref} custom={item.displayName}
                change={(next) => put(i, { ...o, items: o.items.map((x, j) => (j === k ? { ...x, ...next } : x)) })} />
              <TextBox label={t("itemName")} value={item.displayName}
                change={(displayName) => put(i, { ...o, items: o.items.map((x, j) => (j === k ? { ...x, displayName } : x)) })} />
              <Num label={t("qty")} value={item.qty} min={1} change={(qty) => put(i, { ...o, items: o.items.map((x, j) => (j === k ? { ...x, qty } : x)) })} />
              <Button type="button" size="sm" variant="ghost" className="self-end" onClick={() => put(i, { ...o, items: o.items.filter((_, j) => j !== k) })}>
                {tb("remove")}
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => put(i, { ...o, items: [...o.items, { ref: "", displayName: "", qty: 1 }] })}>
            {t("addItem")}
          </Button>
        </div>
      ))}
      {options.length < CLASS_LIMITS.equipmentOptions && (
        <Button type="button" size="sm" variant="outline" onClick={() => set({ startingEquipment: [...options, { gp: 0, items: [] }] })}>
          {t("addOption")}
        </Button>
      )}
    </fieldset>
  );
}

function Multiclass({ form, set, catalog }: Parts) {
  const t = useTranslations("homebrew.class");
  const names = useNames(catalog);
  const m = form.multiclass;
  const put = (patch: Partial<ClassMulticlassForm["gains"]>, requires = m.requires) => set({ multiclass: { requires, gains: { ...m.gains, ...patch } } });
  const skills = m.gains.skills;
  const tools = m.gains.tools;
  const putTools = (next: NonNullable<ClassMulticlassForm["gains"]["tools"]>) => put({ tools: next.grant?.length || next.choice ? next : null });
  const own = form.skillChoice.from;
  return (
    <fieldset className="space-y-3 rounded border p-3" data-class-multiclass>
      <legend className="font-medium">{t("multiclass")}</legend>
      <Checks legend={t("mcRequires")} options={ABILITIES.map((a) => ({ value: a, label: names.ability(a) }))} value={m.requires.abilities}
        change={(v) => put({}, { ...m.requires, abilities: v as ClassMulticlassForm["requires"]["abilities"] })} />
      <p className="text-xs text-muted-foreground">{t("mcRequiresNote")}</p>
      <Pick label={t("mcMode")} value={m.requires.mode} options={["all", "any"].map((v) => ({ value: v, label: t(`mcModeOption.${v}`) }))}
        change={(mode) => put({}, { ...m.requires, mode: mode as "all" | "any" })} />
      <Checks legend={t("mcArmor")} options={["light", "medium", "shield"].map((v) => ({ value: v, label: t(`armorOption.${v}`) }))}
        value={m.gains.armor} change={(v) => put({ armor: v as ClassMulticlassForm["gains"]["armor"] })} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={m.gains.weapons.includes("martial")} onChange={(e) => put({ weapons: e.target.checked ? ["martial"] : [] })} />
        {t("mcMartial")}
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Pick label={t("mcSkillsFrom")} value={!skills ? "none" : skills.from === "any" ? "any" : "class"}
          options={["none", "any", "class"].map((v) => ({ value: v, label: t(`mcSkillsOption.${v}`) }))}
          change={(v) => put({ skills: v === "none" ? null : { count: skills?.count ?? 1, from: v === "any" ? "any" : own === "any" ? "any" : [...own] } })} />
        {skills && <Num label={t("mcSkills")} value={skills.count} min={1} max={4} change={(count) => put({ skills: { ...skills, count } })} />}
      </div>
      <ToolChips label={t("mcToolGrant")} catalog={catalog} value={tools?.grant ?? []} change={(grant) => putTools({ ...tools, grant })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextBox label={t("mcToolCategory")} value={tools?.choice?.category ?? ""}
          change={(category) => {
            const { choice: _choice, ...rest } = tools ?? {};
            putTools(category ? { ...rest, choice: { category, count: tools?.choice?.count ?? 1 } } : rest);
          }} />
        {tools?.choice && (
          <Num label={t("mcToolCount")} value={tools.choice.count} min={1} change={(count) => putTools({ ...tools, choice: { ...tools.choice!, count } })} />
        )}
      </div>
    </fieldset>
  );
}

export function CastingStep({ form, set, catalog }: Parts) {
  const t = useTranslations("homebrew.class");
  const names = useNames(catalog);
  const builtin = catalog.context.builtin;
  const casting = form.casting;
  const like = (p: Progression) => catalog.ids.filter((id) => builtin[id].progression === p && builtin[id].prepared && (p !== "pact" || builtin[id].pact));
  const casters = catalog.ids.filter((id) => builtin[id].progression);
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-class-step="casting">
      <Pick label={t("castingKind")} value={casting?.progression ?? "none"}
        options={["none", "full", "artificer", "pact"].map((v) => ({ value: v, label: t(`castingOption.${v}`) }))}
        change={(v) => {
          if (v === "none") return set({ casting: null });
          const p = v as Progression;
          const first = like(p)[0];
          const ability = String((builtin[first].meta.spellcasting as { ability?: string } | undefined)?.ability ?? "int");
          set({ casting: { progression: p, ability: ability as "int", countsLike: first, list: casting?.list ?? "" } });
        }} />
      {casting && (
        <>
          <Pick label={t("castingAbility")} value={casting.ability} options={["int", "wis", "cha"].map((a) => ({ value: a, label: names.ability(a) }))}
            change={(ability) => set({ casting: { ...casting, ability: ability as "int" } })} />
          <Pick label={t("countsLike")} value={casting.countsLike} options={like(casting.progression).map((id) => ({ value: id, label: names.cls(id) }))}
            change={(countsLike) => set({ casting: { ...casting, countsLike } })} />
          <Pick label={t("list")} value={casting.list}
            options={[{ value: "", label: t("ownList") }, ...casters.map((id) => ({ value: id, label: t("borrow", { class: names.cls(id) }) }))]}
            change={(list) => set({ casting: { ...casting, list } })} />
        </>
      )}
    </div>
  );
}

export function LadderStep({ form, set, catalog }: Parts) {
  const t = useTranslations("homebrew.class");
  const names = useNames(catalog);
  const builtin = catalog.context.builtin;
  return (
    <div className="space-y-4" data-class-step="ladder">
      <div className="grid gap-3 sm:grid-cols-2">
        <Pick label={t("asi")} value={form.asi} options={["standard", "fighter", "rogue"].map((v) => ({ value: v, label: t(`asiOption.${v}`) }))}
          change={(asi) => set({ asi: asi as ClassForm["asi"] })} />
        <Pick label={t("subclassLike")} value={form.subclassLike}
          options={[
            ...(form.subclassLike ? [] : [{ value: "", label: "—" }]),
            ...catalog.ids.map((id) => ({ value: id, label: t("subclassLikeOption", { class: names.cls(id), levels: builtin[id].subclassLevels.join("/") }) })),
          ]}
          change={(subclassLike) => set({ subclassLike })} />
        <Pick label={t("mastery")} value={form.mastery} options={["none", "two", "barbarian", "fighter"].map((v) => ({ value: v, label: t(`masteryOption.${v}`) }))}
          change={(mastery) => set({ mastery: mastery as ClassForm["mastery"] })} />
        <label className="flex items-center gap-2 self-end text-sm">
          <input type="checkbox" checked={form.extraAttack} onChange={(e) => set({ extraAttack: e.target.checked })} />
          {t("extraAttack")}
        </label>
      </div>
      <ColumnsEditor form={form} set={set} />
    </div>
  );
}

/** One section per level 1–20: the generated features read-only, the authored ones editable. */
export function FeatureSteps({ form, set, generated }: Omit<Parts, "catalog"> & { generated: Array<{ level: number; name: string }> }) {
  const t = useTranslations("homebrew.class");
  const ts = useTranslations("homebrew.subclass");
  const tb = useTranslations("homebrew");
  const update = (i: number, patch: Partial<ClassForm["features"][number]>) =>
    set({ features: form.features.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  return (
    <div className="space-y-2" data-class-step="features">
      {Array.from({ length: 20 }, (_, i) => i + 1).map((level) => (
        <section key={level} className="space-y-2 rounded border p-3" data-class-level={level}>
          <h5 className="font-medium">{t("level", { level })}</h5>
          {generated.filter((g) => g.level === level).map((g, k) => (
            <p key={k} className="text-sm" data-generated-feature>
              {g.name} <span className="text-xs text-muted-foreground">({t("generatedNote")})</span>
            </p>
          ))}
          {form.features.map((f, i) =>
            f.level !== level ? null : (
              <div key={i} className="space-y-2 border-l-2 pl-3" data-class-feature={i}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <TextBox label={ts("featureNameZh")} value={f.nameZh} change={(nameZh) => update(i, { nameZh })} />
                  <TextBox label={ts("featureNameEn")} value={f.nameEn} change={(nameEn) => update(i, { nameEn })} />
                  <TextBox long label={ts("featureTextZh")} value={f.textZh} change={(textZh) => update(i, { textZh })} />
                  <TextBox long label={ts("featureTextEn")} value={f.textEn} change={(textEn) => update(i, { textEn })} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Num label={ts("featureLevel")} value={f.level} min={1} max={20} change={(l) => update(i, { level: l })} />
                  <Button type="button" size="sm" variant="ghost" className="self-end" onClick={() => set({ features: form.features.filter((_, j) => j !== i) })}>
                    {tb("remove")}
                  </Button>
                </div>
                {f.key && !f.key.endsWith(`-l${f.level}`) && <p className="text-sm text-muted-foreground">{ts("relevel")}</p>}
              </div>
            ),
          )}
          <Button type="button" size="sm" variant="outline"
            onClick={() => set({ features: [...form.features, { level, nameEn: "", nameZh: "", textEn: "", textZh: "" }] })}>
            {t("addFeature")}
          </Button>
        </section>
      ))}
    </div>
  );
}
