/**
 * Moving a subclass draft to another parent class: what still fits the new parent is kept (a third
 * caster's spellcasting, spells at its spell levels, features at its subclass levels), the rest is
 * removed or moved to its first subclass level. The editor lists the changes and applies them only
 * once the author confirms; what a confirmed move took (`MoveStash`) comes back when a later parent
 * fits it again.
 */
import type { SubclassFeatureForm, SubclassForm } from "./form";
import type { SubclassParent } from "./parents";
import { spellLevels } from "./spells";

/** What a move changes: casting removed, spell rows removed, features moved to another level. */
export interface MoveChanges {
  casting: boolean;
  spells: SubclassForm["spells"];
  features: Array<{ feature: SubclassFeatureForm; from: number; to: number }>;
}

/** What confirmed moves took from the draft, to give back when a later parent fits it. */
export interface MoveStash {
  spellcasting: SubclassForm["spellcasting"];
  spells: SubclassForm["spells"];
  /** A moved feature's draft id and the level it had. */
  levels: ReadonlyMap<string, number>;
}

/** The draft with what earlier moves took given back: casting, spell rows at levels it no longer has, feature levels. */
export function restored(form: SubclassForm, stash?: MoveStash): SubclassForm {
  if (!stash) return form;
  const spells = [...form.spells, ...stash.spells.filter((s) => !form.spells.some((x) => x.level === s.level))].sort((a, b) => a.level - b.level);
  return {
    ...form,
    spellcasting: form.spellcasting ?? stash.spellcasting,
    spells,
    features: form.features.map((f) => (f.draftId && stash.levels.has(f.draftId) ? { ...f, level: stash.levels.get(f.draftId)! } : f)),
  };
}

let drafted = 0;
const newDraftId = () => `moved-${++drafted}`;

/** `form` moved under `next` (none: no parent chosen, nothing removed), and what that changes. */
export function moveTo(form: SubclassForm, next: SubclassParent | undefined): { form: SubclassForm; changes: MoveChanges } {
  const spellcasting = !next || next.thirdCaster ? form.spellcasting : null;
  const levels = next ? spellLevels(next, { spellcasting }) : null;
  const keep = (level: number) => !levels || levels.includes(level);
  const changes: MoveChanges = {
    casting: Boolean(form.spellcasting) && !spellcasting,
    spells: form.spells.filter((s) => !keep(s.level) && s.refs.length),
    features: [],
  };
  const features = form.features.map((f) => {
    if (!next || next.subclassLevels.includes(f.level) || !next.subclassLevels.length) return f;
    const moved = { ...f, draftId: f.draftId ?? newDraftId(), level: next.subclassLevels[0] };
    changes.features.push({ feature: moved, from: f.level, to: moved.level });
    return moved;
  });
  return { form: { ...form, parent: next?.id ?? "", spellcasting, spells: form.spells.filter((s) => keep(s.level)), features }, changes };
}

/** Whether a move changes nothing of the author's draft. */
export const keepsAll = (changes: MoveChanges) => !changes.casting && !changes.spells.length && !changes.features.length;

/** The stash after a move from `source` (the draft with the previous stash given back): what it took. */
export function stashOf(source: SubclassForm, changes: MoveChanges): MoveStash | undefined {
  if (keepsAll(changes)) return undefined;
  return {
    spellcasting: changes.casting ? source.spellcasting : null,
    spells: changes.spells,
    levels: new Map(changes.features.map((c) => [c.feature.draftId!, c.from])),
  };
}

/**
 * Moving the editor's `draft` under `next`: `changes` lists what it removes or moves of the draft as
 * it is (a confirmation is needed unless none); `form` also gives back what earlier moves (`stash`)
 * took and now fits; `stash` is what this move leaves out.
 */
export function planMove(draft: SubclassForm, stash: MoveStash | undefined, next: SubclassParent | undefined) {
  const source = restored(draft, stash);
  const move = moveTo(source, next);
  return { form: move.form, changes: moveTo(draft, next).changes, stash: stashOf(source, move.changes) };
}
