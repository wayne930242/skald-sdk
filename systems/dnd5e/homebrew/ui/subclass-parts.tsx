import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@skald/sheet-sdk/components/ui/button";
import { Input } from "@skald/sheet-sdk/components/ui/input";
import { Textarea } from "@skald/sheet-sdk/components/ui/textarea";
import {
  maxSpellLevel,
  spellFits,
  spellLevels,
  spellListOf,
  spellProblems,
  thirdCasterSlots,
  type Breakpoint,
  type SubclassForm,
  type SubclassParent,
} from "../domain/subclass";
import type { SubclassCatalog } from "./subclass-context";

type Parts = { form: SubclassForm; set(patch: Partial<SubclassForm>): void; parent: SubclassParent; catalog: SubclassCatalog };
type Casting = NonNullable<SubclassForm["spellcasting"]>;

export function TextBox({ label, value, change, long }: { label: string; value: string; change(v: string): void; long?: boolean }) {
  return (
    <label className="block min-w-0 space-y-1">
      <span className="text-sm">{label}</span>
      {long ? (
        <Textarea value={value} onChange={(e) => change(e.target.value)} />
      ) : (
        <Input value={value} onChange={(e) => change(e.target.value)} />
      )}
    </label>
  );
}

/** One section per parent subclass level, plus any level a stored feature still has. */
export function FeatureSections({ form, set, parent }: Omit<Parts, "catalog">) {
  const t = useTranslations("homebrew.subclass");
  const tb = useTranslations("homebrew");
  const levels = [...new Set([...parent.subclassLevels, ...form.features.map((f) => f.level)])].sort((a, b) => a - b);
  const update = (i: number, patch: Partial<SubclassForm["features"][number]>) =>
    set({ features: form.features.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  return levels.map((level) => (
    <section key={level} className="space-y-3 rounded border p-3" data-subclass-level={level}>
      <h4 className="font-medium">{t("level", { level })}</h4>
      {form.features.map((f, i) =>
        f.level !== level ? null : (
          <div key={i} className="space-y-2 border-l-2 pl-3" data-subclass-feature={i}>
            <div className="grid gap-2 sm:grid-cols-2">
              <TextBox label={t("featureNameZh")} value={f.nameZh} change={(nameZh) => update(i, { nameZh })} />
              <TextBox label={t("featureNameEn")} value={f.nameEn} change={(nameEn) => update(i, { nameEn })} />
              <TextBox long label={t("featureTextZh")} value={f.textZh} change={(textZh) => update(i, { textZh })} />
              <TextBox long label={t("featureTextEn")} value={f.textEn} change={(textEn) => update(i, { textEn })} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm">
                {t("featureLevel")}{" "}
                <select
                  className="rounded border bg-background p-1"
                  value={f.level}
                  onChange={(e) => update(i, { level: Number(e.target.value), draftId: undefined })}
                >
                  {levels.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => set({ features: form.features.filter((_, j) => j !== i) })}
              >
                {tb("remove")}
              </Button>
            </div>
            {f.key && !f.key.endsWith(`-l${f.level}`) && <p className="text-sm text-muted-foreground">{t("relevel")}</p>}
          </div>
        ),
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => set({ features: [...form.features, { level, nameEn: "", nameZh: "", textEn: "", textZh: "" }] })}
      >
        {t("addFeature")}
      </Button>
    </section>
  ));
}

export function SpellRows({ form, set, parent, catalog }: Parts) {
  const t = useTranslations("homebrew.subclass");
  const zh = useLocale() === "zh-TW";
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [otherLists, setOtherLists] = useState(false);
  const levels = spellLevels(parent, form);
  if (!levels.length) return null;
  const l = zh ? "zh" : "en";
  const name = (ref: string) => catalog.spells[ref]?.[l] ?? ref;
  const byLabel = new Map(Object.entries(catalog.spells).map(([ref, n]) => [n[l], ref]));
  // A third caster's own list is a hard choice; a parent's list only narrows the suggestions by default.
  const list = spellListOf(form, parent);
  const strictList = Boolean(form.spellcasting);
  const filterList = list && (strictList || !otherLists) ? list : undefined;
  const problems = new Map(spellProblems(form, parent, (ref) => catalog.spellInfo[ref]).map((p) => [`${p.level}/${p.ref}`, p]));
  const listName = list ? (catalog.classNames[list] ?? catalog.parents.find((p) => p.id === list)?.name)?.[l] ?? list : "";
  const setRefs = (level: number, refs: string[]) =>
    set({
      spells: [...form.spells.filter((s) => s.level !== level), ...(refs.length ? [{ level, refs }] : [])].sort(
        (a, b) => a.level - b.level,
      ),
    });
  return (
    <fieldset className="space-y-2 rounded border p-3" data-subclass-spells>
      <legend className="font-medium">{t("spells")}</legend>
      {list && (
        <p className="text-xs text-muted-foreground" data-spell-list={list}>
          {t("spellListNote", { list: listName })}
        </p>
      )}
      {list && !strictList && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={otherLists} onChange={(e) => setOtherLists(e.target.checked)} />
          {t("spellOtherLists")}
        </label>
      )}
      {levels.map((level) => {
        const refs = form.spells.find((s) => s.level === level)?.refs ?? [];
        const draft = drafts[level] ?? "";
        const ref = catalog.spells[draft] ? draft : byLabel.get(draft);
        const max = maxSpellLevel(form, parent, level);
        const info = ref ? catalog.spellInfo[ref] : undefined;
        const misfit = info && !spellFits(info, max);
        const suggestions = Object.keys(catalog.spells).filter((r) => {
          const spell = catalog.spellInfo[r];
          return spell && spellFits(spell, max) && (!filterList || spell.classes.includes(filterList)) && !refs.includes(r);
        });
        return (
          <div key={level} className="space-y-1" data-spell-row={level}>
            <datalist id={`subclass-spells-${level}`}>
              {suggestions.map((r) => (
                <option key={r} value={name(r)} />
              ))}
            </datalist>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-0 grow text-sm">
                {t("spellRef", { level })}
                <Input
                  list={`subclass-spells-${level}`}
                  value={draft}
                  aria-invalid={misfit || undefined}
                  onChange={(e) => setDrafts({ ...drafts, [level]: e.target.value })}
                />
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!ref || misfit || refs.includes(ref) || refs.length >= 10}
                onClick={() => {
                  setRefs(level, [...refs, ref!]);
                  setDrafts({ ...drafts, [level]: "" });
                }}
              >
                {t("addSpell")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("maxSpell", { level, max })}</p>
            {misfit && (
              <p className="text-xs text-destructive" role="alert">
                {info.level < 1
                  ? t("spellCantrip", { spell: name(ref!) })
                  : t("spellTooHigh", { spell: name(ref!), spellLevel: info.level, max })}
              </p>
            )}
            <ul className="flex flex-wrap gap-1">
              {refs.map((r) => {
                const problem = problems.get(`${level}/${r}`);
                return (
                  <li key={r} data-spell-problem={problem?.reason}>
                    <Button
                      type="button"
                      size="sm"
                      variant={problem ? "destructive" : "secondary"}
                      aria-label={t("removeSpell", { spell: name(r) })}
                      onClick={() => setRefs(level, refs.filter((x) => x !== r))}
                    >
                      {name(r)} ×
                    </Button>
                    {problem && (
                      <span className="ml-1 text-xs text-destructive">
                        {problem.reason === "cantrip"
                          ? t("spellCantrip", { spell: name(r) })
                          : t("spellTooHigh", { spell: name(r), spellLevel: problem.spellLevel, max: problem.max })}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </fieldset>
  );
}

function Breakpoints({ label, value, change }: { label: string; value: Breakpoint[]; change(v: Breakpoint[]): void }) {
  const t = useTranslations("homebrew.subclass");
  const edit = (i: number, patch: Partial<Breakpoint>) => change(value.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm">{label}</legend>
      {value.map((b, i) => (
        <div key={i} className="flex gap-2">
          <label className="text-sm">
            {t("fromLevel")}
            <Input type="number" min={3} max={20} value={b.level} onChange={(e) => edit(i, { level: Number(e.target.value) })} />
          </label>
          <label className="text-sm">
            {t("value")}
            <Input type="number" min={0} value={b.value} onChange={(e) => edit(i, { value: Number(e.target.value) })} />
          </label>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => change([...value, { level: Math.min(20, (value.at(-1)?.level ?? 2) + 1), value: value.at(-1)?.value ?? 0 }])}
      >
        {t("addBreakpoint")}
      </Button>
    </fieldset>
  );
}

/** Fighter / Rogue only: one-third caster with slots derived from the multiclass table. */
export function ThirdCaster({ form, set, parent, catalog }: Parts) {
  const t = useTranslations("homebrew.subclass");
  const zh = useLocale() === "zh-TW";
  if (!parent.thirdCaster) return null;
  const sc = form.spellcasting;
  const edit = (patch: Partial<Casting>) => set({ spellcasting: { ...sc!, ...patch } });
  const lists = catalog.parents.filter((p) => p.builtin && p.caster !== "none");
  return (
    <fieldset className="space-y-3 rounded border p-3" data-subclass-casting>
      <label className="flex items-center gap-2 font-medium">
        <input
          type="checkbox"
          role="switch"
          className="size-4"
          checked={Boolean(sc)}
          onChange={(e) => {
            const on = e.target.checked;
            set({
              spells: [],
              spellcasting: on
                ? { ability: "int", list: "wizard", cantrips: [], prepared: [], textEn: "", textZh: "" }
                : null,
            });
          }}
        />
        {t("casting")}
      </label>
      {sc && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">
              {t("ability")}{" "}
              <select className="rounded border bg-background p-1" value={sc.ability} onChange={(e) => edit({ ability: e.target.value as Casting["ability"] })}>
                {(["int", "wis", "cha"] as const).map((a) => (
                  <option key={a} value={a}>
                    {catalog.abilityNames[a][zh ? "zh" : "en"]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t("list")}{" "}
              <select className="rounded border bg-background p-1" value={sc.list} onChange={(e) => edit({ list: e.target.value })}>
                {lists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name[zh ? "zh" : "en"]}
                  </option>
                ))}
              </select>
            </label>
            <TextBox long label={t("castingTextZh")} value={sc.textZh} change={(textZh) => edit({ textZh })} />
            <TextBox long label={t("castingTextEn")} value={sc.textEn} change={(textEn) => edit({ textEn })} />
            <Breakpoints label={t("cantrips")} value={sc.cantrips} change={(cantrips) => edit({ cantrips })} />
            <Breakpoints label={t("prepared")} value={sc.prepared} change={(prepared) => edit({ prepared })} />
          </div>
          <p role="note" className="text-sm text-muted-foreground">
            {t("derivedNote")}
          </p>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-sm" data-derived-slots>
              <thead>
                <tr>
                  <th className="text-left">{t("classLevel")}</th>
                  {[1, 2, 3, 4].map((n) => (
                    <th key={n}>{t("slotLevel", { n })}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 18 }, (_, i) => i + 3).map((level) => (
                  <tr key={level}>
                    <td>{level}</td>
                    {thirdCasterSlots(level).map((n, j) => (
                      <td key={j} className="text-center">
                        {n || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </fieldset>
  );
}
