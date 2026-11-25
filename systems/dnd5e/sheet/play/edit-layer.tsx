"use client";

import type { FieldReference } from "@skald/types/schema";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@skald/sheet-sdk/components/ui/dialog";
import { FieldRenderer } from "@skald/sheet-sdk/modules/character/ui/renderer/field-renderer";
import { DerivedValue } from "@skald/sheet-sdk/modules/character/ui/derived/derived-value";
import { useSchemaI18n } from "@skald/sheet-sdk/lib/i18n/use-schema-i18n";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { CARD, CARD_TITLE } from "./card-styles";
import { classDerivedPatch, classIssues, sheetClasses } from "./class-model";
import { EditIntl } from "./edit-messages";
import { usePlay } from "./play-context";
import { ABILITIES, SKILLS, signed, text, type Ability } from "./play-model";
import { LanguageEditor } from "./row-actions";
import { NOT_SIGNED, RECALC_TRIGGERS, useDndRecalcText } from "./recalc";
import { useRecalcOnEditExit } from "@skald/sheet-sdk/modules/character/ui/derived/use-recalc";
import { InlineTextEditor } from "./text-editor";

/**
 * Edit mode in the play view (plan-uat2 §3.1, D2 = B): the same cards, with the structural fields
 * as the schema's own field renderers (validation, derived-value overrides and labels as in the
 * template form). Loaded on the first switch to 編輯; each card of the play view mounts one part.
 */

const slots = Array.from({ length: 9 }, (_, index) => `slot${index + 1}Total`);

/** The fields each part edits, in order. The coverage guard reads them. */
export const EDIT_PARTS = {
  identity: ["name", "player", "className", "subclass", "level", "multiclass", "xp", "species", "lineage", "size", "background", "alignment"],
  vitals: [
    "hitDieFaces", "hpPerLevelBonus", "hpMaxMisc", "hpMax",
    "armorType", "armorBase", "shield", "unarmoredDefense", "acMisc", "ac",
    "initiativeProf", "initiativeMisc", "initiative", "speed", "darkvision",
  ],
  abilities: ABILITIES.flatMap((ability) => [ability, `${ability}SaveProf`, `${ability}Save`]),
  skills: [...SKILLS.flatMap((skill) => [`${skill.id}Prof`, skill.id]), "jackOfAllTrades", "orderLoreBonus"],
  combat: ["rangedAttackBonus"],
  spellcasting: ["spellAbility", "spellSaveDc", "spellAttack", ...slots, "pactSlots", "pactSlotLevel"],
  training: ["armorLight", "armorMedium", "armorHeavy", "armorShields", "weaponProficiencies", "weaponMasteries"],
  items: ["cp", "sp", "ep", "gp", "pp", "attunement1", "attunement2", "attunement3", "equipment"],
} as const;

/**
 * B-023: what a tap on a roll or play control opens in edit mode, by what the control shows
 * (plan §4.1). Each target edits the value and the inputs it follows. The coverage guard checks
 * the ids are schema fields.
 */
export const EDIT_TARGETS = {
  hp: ["hp", "hpTemp", "hpMax", "hitDieFaces", "hpPerLevelBonus", "hpMaxMisc"],
  ac: ["ac", "armorType", "armorBase", "shield", "shieldBonus", "unarmoredDefense", "acMisc"],
  initiative: ["initiative", "initiativeProf", "initiativeMisc"],
  speed: ["currentSpeed", "speed", "darkvision"],
  passive: ["passivePerception", "perceptionProf", "perception"],
  hitDice: ["hitDiceMax", "hitDiceSpent", "hitDieFaces"],
  deathSaves: ["deathSuccesses", "deathFailures"],
  spellcasting: ["spellAbility", "spellSaveDc", "spellAttack"],
} as const;

export type EditTarget = keyof typeof EDIT_TARGETS | `ability:${Ability}` | `skill:${string}`;

/** The fields a target edits: an ability's score and save, a skill's proficiency and bonus. */
export function targetFields(target: EditTarget): readonly string[] {
  if (target.startsWith("ability:")) {
    const ability = target.slice("ability:".length);
    return [ability, `${ability}SaveProf`, `${ability}Save`];
  }
  if (target.startsWith("skill:")) {
    const skill = target.slice("skill:".length);
    return [`${skill}Prof`, skill];
  }
  return EDIT_TARGETS[target as keyof typeof EDIT_TARGETS];
}

/** The edit parts, the banner, and the 角色 tab's ✎ editors (in play too): a long text and the languages. */
export type EditPartName = keyof typeof EDIT_PARTS | "banner" | "text" | "languages";

export interface EditPartProps {
  part: EditPartName;
  /** The text field of a `text` part. */
  field?: "appearance" | "backstory" | "notes";
  /** Closes a ✎ editor. */
  onDone?: () => void;
}

const refs = new Map<string, FieldReference>();
/** One reference object per field, so the memoized FieldRenderer keeps it across renders. */
function ref(fieldId: string): FieldReference {
  const found = refs.get(fieldId) ?? { type: "field-ref", fieldId };
  refs.set(fieldId, found);
  return found;
}

/** The ids the character's own schema has: a character on an older template version lacks newer fields. */
function usePresent(ids: readonly string[]): string[] {
  const { schema } = usePlay();
  return ids.filter((id) => id in schema.fields);
}


/**
 * A derived value of the play view's editors (B-024): the shared DerivedValue with the schema's
 * label, so the override, its mark and 恢復自動計算 read the same on every system.
 */
function DerivedField({ id }: { id: string }) {
  const tPlay = useTranslations("play");
  const { schema } = usePlay();
  const { resolveI18n } = useSchemaI18n();
  const label = resolveI18n(schema.fields[id]?.label ?? id);
  const display = (value: number | string) =>
    typeof value !== "number" ? value : id === "currentSpeed" ? tPlay("feet", { value }) : NOT_SIGNED.has(id) ? value : signed(value);
  return (
    <div data-field-id={id} className="min-w-0">
      <DerivedValue fieldId={id} label={label} display={display} />
    </div>
  );
}

function Fields({ ids, className }: { ids: readonly string[]; className?: string }) {
  const present = usePresent(ids);
  const { schema } = usePlay();
  if (present.length === 0) return null;
  return (
    <div className={cn("grid items-end gap-x-4 gap-y-2 @lg:grid-cols-2", className)}>
      {present.map((id) =>
        schema.fields[id]?.type === "computed" ? <DerivedField key={id} id={id} /> : <FieldRenderer key={id} fieldRef={ref(id)} />,
      )}
    </div>
  );
}

function Card({ title, part, children }: { title: string; part: string; children: React.ReactNode }) {
  return (
    <section className={cn(CARD, "@container space-y-2")} aria-label={title} data-play-edit={part}>
      <h3 className={CARD_TITLE}>{title}</h3>
      {children}
    </section>
  );
}

function Banner() {
  const t = useTranslations("edit");
  return (
    <p role="status" className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm" data-play-edit-banner>
      {t("banner")}
    </p>
  );
}

function Abilities() {
  const t = useTranslations("edit.part");
  const tAbility = useTranslations("ability");
  return (
    <Card title={t("abilities")} part="abilities">
      {/* One column in the narrow side card: en labels ("Dexterity save") need the full width. */}
      <div className="grid gap-2 @md:grid-cols-2 @2xl:grid-cols-3">
        {ABILITIES.map((ability) => (
          <section key={ability} className="space-y-1 rounded-lg bg-muted/40 p-2" aria-label={tAbility(ability)}>
            <Fields ids={[ability, `${ability}SaveProf`, `${ability}Save`]} className="@lg:grid-cols-1" />
          </section>
        ))}
      </div>
    </Card>
  );
}

/**
 * Multiclass (CLASS-IMPL §7.2): keeps `hpClassAdjust` current, one write after `multiclass` or
 * `hitDieFaces` changes from any editor (the 角色 tab's rows, the HP / hit dice editor on 戰鬥).
 * Mounted for the whole edit session by `RecalcOnEditExit`.
 */
function useClassDerivedSync() {
  const { values, editable, write } = usePlay();
  const multiclass = values.multiclass;
  const hitDieFaces = values.hitDieFaces;
  const stored = values.hpClassAdjust;
  useEffect(() => {
    if (!editable) return;
    const patch = classDerivedPatch({ multiclass, hitDieFaces, hpClassAdjust: stored });
    if (Object.keys(patch).length > 0) write(patch);
    // Only a change of the classes or the starting die writes; `write` is a fresh closure per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiclass, hitDieFaces, editable]);
}

/** Multiclass (CLASS-IMPL §7.2): the starting class's derived level and the broken invariants. Display only. */
function ClassesNote() {
  const t = useTranslations("edit.classes");
  const { values } = usePlay();
  const classes = sheetClasses(values);
  if (classes.length === 1) return null;
  const issues = classIssues(values);
  return (
    <div className="space-y-1 text-sm" data-play-classes>
      <p className="text-muted-foreground" data-play-start-level>{t("startLevel", { level: classes[0].level })}</p>
      {issues.map((issue) => (
        <p key={issue} role="alert" className="text-destructive" data-class-issue={issue}>
          {t(`issue.${issue}`)}
        </p>
      ))}
    </div>
  );
}

function TextEditor({ field, onDone }: { field: NonNullable<EditPartProps["field"]>; onDone: () => void }) {
  const tField = useTranslations("field");
  const { values, write } = usePlay();
  return (
    <InlineTextEditor
      label={tField(field)}
      value={text(values[field])}
      onCancel={onDone}
      onSave={(next) => {
        write({ [field]: next });
        onDone();
      }}
    />
  );
}

function Part({ part, field = "notes", onDone = () => {} }: EditPartProps) {
  const t = useTranslations("edit.part");
  const tSection = useTranslations("section");
  const tPlay = useTranslations("play");
  const { schema } = usePlay();
  // A part whose fields the character's schema has none of renders nothing, not an empty card.
  if (part in EDIT_PARTS && !EDIT_PARTS[part as keyof typeof EDIT_PARTS].some((id) => id in schema.fields)) return null;
  switch (part) {
    case "banner":
      return <Banner />;
    case "text":
      return <TextEditor field={field} onDone={onDone} />;
    case "languages":
      return <LanguageEditor onDone={onDone} />;
    case "abilities":
      return <Abilities />;
    case "identity":
      return (
        <div className="min-w-0 space-y-2" data-play-edit="identity">
          <Fields ids={EDIT_PARTS.identity} />
          <ClassesNote />
        </div>
      );
    case "vitals":
      return (
        <Card title={`${tSection("hitPoints")} · ${tSection("armorClass")}`} part="vitals">
          <Fields ids={EDIT_PARTS.vitals} />
        </Card>
      );
    case "skills":
      return (
        <Card title={t("skills")} part="skills">
          <Fields ids={EDIT_PARTS.skills} />
        </Card>
      );
    case "combat":
      return (
        <Card title={t("combat")} part="combat">
          <Fields ids={EDIT_PARTS.combat} />
        </Card>
      );
    case "spellcasting":
      return (
        <Card title={`${tSection("spellcasting")} · ${tSection("spellSlots")}`} part="spellcasting">
          <Fields ids={["spellAbility", "spellSaveDc", "spellAttack"]} />
          <div className="grid gap-x-4 gap-y-2 @md:grid-cols-3">
            {slots.map((id, index) => id in schema.fields && (
              <div key={id} className="flex items-end gap-2">
                <span className="shrink-0 pb-2 text-sm font-semibold">{tPlay("spells.level", { level: index + 1 })}</span>
                <FieldRenderer fieldRef={ref(id)} />
              </div>
            ))}
          </div>
          <Fields ids={["pactSlots", "pactSlotLevel"]} />
        </Card>
      );
    case "training":
      // Inside the 特性 tab's training card, under its chips.
      return (
        <div className="mt-3 border-t border-border pt-3" data-play-edit="training">
          <Fields ids={EDIT_PARTS.training} />
        </div>
      );
    case "items":
      return (
        <Card title={`${tSection("coins")} · ${tSection("attunement")}`} part="items">
          <Fields ids={EDIT_PARTS.items.slice(0, 5)} className="grid-cols-3 @lg:grid-cols-5" />
          <Fields ids={EDIT_PARTS.items.slice(5, 8)} className="@lg:grid-cols-3" />
          <details className="pt-2">
            <summary className="min-h-9 cursor-pointer text-sm font-semibold">{t("items")}</summary>
            <Fields ids={EDIT_PARTS.items.slice(8)} className="pt-2 @lg:grid-cols-1" />
          </details>
        </Card>
      );
  }
}

/** A target's title: the label the play view shows for that value (no new strings). */
function useTargetTitle(target: EditTarget): string {
  const tPlay = useTranslations("play");
  const tSection = useTranslations("section");
  const tAbility = useTranslations("ability");
  const tSkill = useTranslations("skill");
  if (target.startsWith("ability:")) return tAbility(target.slice("ability:".length) as Ability);
  if (target.startsWith("skill:")) return tSkill(target.slice("skill:".length));
  switch (target as keyof typeof EDIT_TARGETS) {
    case "hp":
      return tPlay("hp.title");
    case "ac":
      return tPlay("ac");
    case "initiative":
      return tPlay("initiative");
    case "speed":
      return tPlay("speed");
    case "passive":
      return tPlay("passive");
    case "hitDice":
      return tPlay("hitDice.short");
    case "deathSaves":
      return tPlay("death.title");
    case "spellcasting":
      return tSection("spellcasting");
  }
}

function Editor({ target, onClose }: { target: EditTarget; onClose: () => void }) {
  const t = useTranslations("edit");
  const title = useTargetTitle(target);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="@container max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-dnd-editor={target} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Fields ids={targetFields(target)} />
        <DialogFooter>
          <button type="button" onClick={onClose} className="min-h-11 rounded-md border border-border px-4 text-sm hover:bg-muted sm:min-h-9">
            {t("done")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** B-023: the value editor a tap opens in edit mode (`DndEditorHost`). */
/**
 * B-024 q3: leaving edit mode after a level or ability score change shows what was recalculated.
 * `DndEditorHost` mounts this from the first edit entry on (it loads with the edit layer) and
 * keeps it mounted, so it sees each entry and exit. It also keeps `hpClassAdjust` current
 * (`useClassDerivedSync`) whichever tab's editor changed the classes or the starting die.
 */
export function RecalcOnEditExit() {
  useClassDerivedSync();
  useRecalcOnEditExit({ triggers: RECALC_TRIGGERS, ...useDndRecalcText() });
  return null;
}

export function EditorDialog(props: { target: EditTarget; onClose: () => void }) {
  return (
    <EditIntl>
      <Editor {...props} />
    </EditIntl>
  );
}

export function EditPart(props: EditPartProps) {
  return (
    <EditIntl>
      <Part {...props} />
    </EditIntl>
  );
}
