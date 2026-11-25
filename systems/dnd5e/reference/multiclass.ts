import { MULTICLASS_SLOTS, thirdCasterSlots } from '../homebrew/domain/subclass/slots';

const abilities = ['str','dex','con','int','wis','cha'] as const;
type Ability = typeof abilities[number];
export interface MulticlassRules {
  requires: { abilities: Ability[]; mode: 'all' | 'any'; score: number };
  gains: { armor: ('light'|'medium'|'shield')[]; weapons: 'martial'[];
    skills: {count: number; from: string[]|'any'} | null;
    tools: {grant?: string[]; choice?: {category: string; count: number}} | null };
  known: boolean;
}
type Rule = Omit<MulticlassRules,'known'>;
function rule(abilities: Ability[], gains: Partial<Rule['gains']> = {}, mode: 'all'|'any' = 'all'): Rule {
  return { requires: { abilities, mode, score: 13 }, gains: { armor: [], weapons: [], skills: null, tools: null, ...gains } };
}
const trained: Partial<Rule['gains']> = { armor: ['light','medium','shield'], weapons: ['martial'] };
// SRD 5.2.1 (CC BY 4.0), class descriptions: As a Multiclass Character.
export const MULTICLASS_RULES = {
  barbarian: rule(['str'], {armor:['shield'], weapons:['martial']}),
  bard: rule(['cha'], {armor:['light'], skills:{count:1, from:'any'}, tools:{choice:{category:'instrument', count:1}}}),
  cleric: rule(['wis'], {armor:['light','medium','shield']}), druid: rule(['wis'], {armor:['light','shield']}),
  fighter: rule(['str','dex'], trained, 'any'), monk: rule(['dex','wis']), paladin: rule(['str','cha'], trained),
  ranger: rule(['dex','wis'], {...trained, skills:{count:1,from:['animal-handling','athletics','insight','investigation','nature','perception','stealth','survival']}}),
  rogue: rule(['dex'], {armor:['light'], skills:{count:1,from:['acrobatics','athletics','deception','insight','intimidation','investigation','perception','persuasion','sleight-of-hand','stealth']}, tools:{grant:['item:thieves-tools']}}),
  sorcerer: rule(['cha']), warlock: rule(['cha'], {armor:['light']}), wizard: rule(['int']),
} as const;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
const subsetOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T[] => isStrings(value) && value.every(item => (allowed as readonly string[]).includes(item));
/** A pack's `meta.multiclass` block when its shape is the rule's, else null (the caller falls back). */
function validRule(value: unknown): Rule | null {
  if (!isRecord(value) || !isRecord(value.requires) || !isRecord(value.gains)) return null;
  const { requires: r, gains: g } = value;
  if (!subsetOf(r.abilities, abilities) || (r.mode !== 'all' && r.mode !== 'any') || typeof r.score !== 'number' || !Number.isFinite(r.score)) return null;
  if (!subsetOf(g.armor, ['light','medium','shield'] as const) || !subsetOf(g.weapons, ['martial'] as const)) return null;
  const skills = g.skills ?? null;
  if (skills !== null && !(isRecord(skills) && typeof skills.count === 'number' && (skills.from === 'any' || isStrings(skills.from)))) return null;
  const tools = g.tools ?? null;
  if (tools !== null) {
    if (!isRecord(tools)) return null;
    if (tools.grant !== undefined && !isStrings(tools.grant)) return null;
    if (tools.choice !== undefined && !(isRecord(tools.choice) && typeof tools.choice.category === 'string' && typeof tools.choice.count === 'number')) return null;
  }
  return {
    requires: { abilities: r.abilities, mode: r.mode, score: r.score },
    gains: {
      armor: g.armor, weapons: g.weapons,
      skills: skills ? { count: skills.count as number, from: skills.from as string[] | 'any' } : null,
      tools: tools ? { ...(tools.grant ? { grant: tools.grant as string[] } : {}), ...(tools.choice ? { choice: tools.choice as { category: string; count: number } } : {}) } : null,
    },
  };
}
export function multiclassRulesOf(classId: string, meta: Record<string, unknown> | undefined): MulticlassRules {
  const data = validRule(meta?.multiclass);
  if (data) return {...data, known:true};
  if (Object.hasOwn(MULTICLASS_RULES,classId)) return {...MULTICLASS_RULES[classId as keyof typeof MULTICLASS_RULES], known:true};
  const primary = meta?.primaryAbility;
  return {...rule(Array.isArray(primary) ? abilities.filter(a => primary.includes(a)) : []), known:false};
}
export type Prerequisite =
  | { ability: Ability; have: number; need: number }
  | { anyOf: { ability: Ability; have: number }[]; need: number };

export function prerequisites(scores: Record<Ability,number>, classes: MulticlassRules[]): Prerequisite[] {
  const missing = new Map<string, Prerequisite>();
  for (const {requires:r} of classes) {
    if (r.mode === 'any') {
      if (r.abilities.length && !r.abilities.some(a => scores[a] >= r.score)) {
        const anyOf = r.abilities.map(ability => ({ ability, have: scores[ability] }));
        missing.set(`any:${[...r.abilities].sort().join(',')}`, { anyOf, need: r.score });
      }
    } else {
      for (const ability of r.abilities) if (scores[ability] < r.score) {
        missing.set(ability, { ability, need: r.score, have: scores[ability] });
      }
    }
  }
  return [...missing.values()];
}
export type CasterKind = 'full'|'half'|'third'|'pact';
function progression(meta: unknown) { return (meta as {spellcasting?:{progression?:unknown}} | null)?.spellcasting?.progression; }
/**
 * A subclass's own Spellcasting feature, `subclassFeature:<class>/<subclass>/spellcasting-l<N>`: in
 * the 2024 rules a subclass with one makes its class a one-third caster. Its pack entry carries no
 * `meta.spellcasting`, so the feature is what identifies it; group 1 is the subclass id.
 */
export const SUBCLASS_SPELLCASTING_FEATURE = /^subclassFeature:([^/]+\/[^/]+)\/spellcasting-l\d+$/;
/** What the 2024 rules' subclass casters cast with: Wizard spells, Intelligence. */
const SUBCLASS_CASTING_DEFAULT = { ability: 'int', list: 'wizard' } as const;
const SPELL_ABILITIES = new Set(['int','wis','cha']);
export interface SubclassCasting { kind:'third'; ability:string; list?:string }
/**
 * The spellcasting a subclass grants: a homebrew subclass's `meta.spellcasting` with progression
 * `third` (its own ability and list), else, when the subclass has its own Spellcasting feature
 * (`hasSpellcastingFeature`), the 2024 default. Null when it grants none.
 */
export function subclassCastingOf(meta: unknown, hasSpellcastingFeature = false): SubclassCasting|null {
  const own = (meta as {spellcasting?:{progression?:unknown;ability?:unknown;list?:unknown}} | null | undefined)?.spellcasting;
  if (own?.progression === 'third') {
    const ability = typeof own.ability === 'string' && SPELL_ABILITIES.has(own.ability) ? own.ability : SUBCLASS_CASTING_DEFAULT.ability;
    const list = typeof own.list === 'string' && own.list ? own.list : undefined;
    return { kind: 'third', ability, ...(list ? { list } : {}) };
  }
  return hasSpellcastingFeature ? { kind: 'third', ...SUBCLASS_CASTING_DEFAULT } : null;
}
/**
 * The one subclass-casting rule, shared by the level-up helper and the sheet: a subclass is a
 * one-third caster when its `meta` says so or one of `featureRefs` is its own Spellcasting feature
 * (`subclassFeature:<class>/<subclass>/spellcasting-l<N>`).
 */
export function subclassCasting(subclassId: string, meta: unknown, featureRefs: Iterable<string>): SubclassCasting|null {
  let feature = false;
  for (const ref of featureRefs) if (SUBCLASS_SPELLCASTING_FEATURE.exec(ref)?.[1] === subclassId) { feature = true; break; }
  return subclassCastingOf(meta, feature);
}
export function casterKindOf(classMeta: unknown, subclassMeta?: unknown): CasterKind|null {
  const p = progression(classMeta);
  if (p==='artificer') return 'half';
  if (p==='full'||p==='half'||p==='pact') return p;
  return subclassCastingOf(subclassMeta) ? 'third' : null;
}
type Caster = {kind:CasterKind|null;level:number};
type Row = Caster & {classId:string};
export function casterLevel(classes: Caster[]) {
  return classes.reduce((n,{kind,level})=>n+(kind==='full'?level:kind==='half'?Math.ceil(level/2):kind==='third'?Math.floor(level/3):0),0);
}
export function combinedSlots(classes: Row[], ownSlots:(id:string,level:number)=>number[]|null) {
  const casters = classes.filter(r=>r.kind && r.kind!=='pact');
  if (casters.length===1) {
    const r = casters[0];
    return ownSlots(r.classId,r.level) ?? (r.kind==='third' && r.level>=3 ? thirdCasterSlots(r.level) : null);
  }
  return MULTICLASS_SLOTS[casterLevel(casters)-1]?.slice() ?? null;
}
export function combinedPact(classes: Row[], ownPact:(id:string,level:number)=>{slots:number;level:number}|null) {
  const pact = classes.reduce<Row|null>((best,r)=>r.kind==='pact' && (!best || r.level>best.level)?r:best,null);
  return pact ? ownPact(pact.classId,pact.level) : null;
}
