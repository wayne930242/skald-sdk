import { expect, it } from 'vitest';
import corpus from '@skald/system-dnd5e/data/dnd5e-2024/game/classes.json';
import { MULTICLASS_RULES, multiclassRulesOf, prerequisites, casterKindOf, casterLevel, combinedSlots, combinedPact, type CasterKind } from '../multiclass';

it('covers every SRD class and its selectable skills',()=>{
  expect(Object.keys(MULTICLASS_RULES).sort()).toEqual(corpus.map(c=>c.id).sort());
  for(const c of corpus){const skills=multiclassRulesOf(c.id,undefined).gains.skills;if(skills) expect(skills.from).toEqual(c.skillChoice.from);}
});
it('reports unmet thresholds for both classes and respects alternatives',()=>{
  const check=(...ids:string[])=>prerequisites({str:10,dex:14,con:10,int:10,wis:12,cha:10},ids.map(id=>multiclassRulesOf(id,undefined)));
  expect(check('barbarian','druid')).toEqual([{ability:'str',need:13,have:10},{ability:'wis',need:13,have:12}]);
  expect(check('fighter')).toEqual([]); expect(check('monk')).toEqual([{ability:'wis',need:13,have:12}]);
});
it('keeps both failed fighter alternatives in a single requirement', () => {
  const scores = { str: 10, dex: 11, con: 10, int: 14, wis: 10, cha: 10 };
  expect(prerequisites(scores, [multiclassRulesOf('fighter', undefined)])).toEqual([
    { anyOf: [{ ability: 'str', have: 10 }, { ability: 'dex', have: 11 }], need: 13 },
  ]);
});
it('reads pack rules and distinguishes the primary-ability fallback',()=>{
  expect(multiclassRulesOf('pack',{multiclass:MULTICLASS_RULES.bard})).toEqual({...MULTICLASS_RULES.bard,known:true});
  expect(multiclassRulesOf('pack',{primaryAbility:['int']})).toEqual({...MULTICLASS_RULES.wizard,known:false});
});
const row=(classId:string,level:number,kind:CasterKind|null)=>({classId,level,kind});
it.each([
  [row('ranger',4,'half'),row('sorcerer',3,'full'),5,[4,3,2]],
  [row('paladin',1,'half'),row('ranger',1,'half'),2,[3]],
  [row('cleric',3,'full'),row('wizard',2,'full'),5,[4,3,2]],
  [row('fighter',7,'third'),row('wizard',1,'full'),3,[4,2]],
] as const)('combines %o and %o',(a,b,level,slots)=>{
  expect(casterLevel([a,b])).toBe(level); expect(combinedSlots([a,b],()=>null)).toEqual([...slots,...Array(9-slots.length).fill(0)]);
});
it('uses own tables for a lone caster and keeps pact magic separate',()=>{
  expect(combinedSlots([row('fighter',5,null),row('wizard',1,'full')],(id,l)=>id==='wizard'&&l===1?[2]:null)).toEqual([2]);
  const rows=[row('warlock',3,'pact'),row('sorcerer',2,'full')];
  expect(combinedSlots(rows,(id,l)=>id==='sorcerer'&&l===2?[3]:null)).toEqual([3]);
  expect(combinedPact(rows,(id,l)=>id==='warlock'&&l===3?{slots:2,level:2}:null)).toEqual({slots:2,level:2});
  expect(casterKindOf({}, {spellcasting:{progression:'third'}})).toBe('third');
  expect(casterKindOf({spellcasting:{progression:'artificer'}})).toBe('half');
});
it('a malformed pack multiclass block falls back to the primary-ability rule, unknown', () => {
  const fallback = {...MULTICLASS_RULES.wizard, known:false};
  const good = MULTICLASS_RULES.bard;
  for (const multiclass of [
    { gains: good.gains },
    { requires: good.requires },
    { ...good, gains: { ...good.gains, armor: ['heavy'] } },
    { ...good, requires: { ...good.requires, abilities: ['luck'] } },
    { ...good, requires: { ...good.requires, mode: 'some' } },
    { ...good, gains: { ...good.gains, skills: { count: '1', from: 'any' } } },
    { ...good, gains: { ...good.gains, tools: { grant: [1] } } },
    'bard',
  ]) {
    const rules = multiclassRulesOf('pack', {multiclass, primaryAbility:['int']});
    expect(rules).toEqual(fallback);
    expect(() => prerequisites({str:10,dex:10,con:10,int:10,wis:10,cha:10}, [rules])).not.toThrow();
  }
});
