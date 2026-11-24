import * as v from 'valibot';
import { GameDataMetaSchema, LocalizableItemSchema } from '../base';

// ============================================================================
// Base Skill - 所有技能共用的欄位
// ============================================================================

export const BaseSkillSchema = v.object({
  ...LocalizableItemSchema.entries,
});

// ============================================================================
// Generic Skill (Fate style) - 只有 id 和 name
// ============================================================================

export const GenericSkillSchema = BaseSkillSchema;

export const GenericSkillsMasterSchema = v.object({
  ...GameDataMetaSchema.entries,
  skills: v.array(GenericSkillSchema),
});

export type GenericSkill = v.InferOutput<typeof GenericSkillSchema>;
export type GenericSkillsMaster = v.InferOutput<typeof GenericSkillsMasterSchema>;

// ============================================================================
// Era-based Skill (CoC7e style) - 擴展 base 加上時代配置
// ============================================================================

export const SkillEraConfigSchema = v.object({
  baseValue: v.union([v.number(), v.string()]),
  availability: v.optional(v.picklist(['default', 'optional', 'unavailable'])),
});

export const EraBasedSkillSchema = v.object({
  ...LocalizableItemSchema.entries, // id, name?
  category: v.optional(v.string()),
  retired: v.optional(v.boolean()),
  eras: v.optional(v.record(v.string(), SkillEraConfigSchema)),
  specializations: v.optional(v.array(v.string())),
  pushable: v.optional(v.boolean()),
  combatSkill: v.optional(v.boolean()),
});

export const EraBasedSkillsMasterSchema = v.object({
  ...GameDataMetaSchema.entries,
  eras: v.optional(v.array(v.string())),
  skills: v.array(EraBasedSkillSchema),
});

export type EraBasedSkill = v.InferOutput<typeof EraBasedSkillSchema>;
export type EraBasedSkillsMaster = v.InferOutput<typeof EraBasedSkillsMasterSchema>;

// ============================================================================
// Unified Skills Schema (accepts both)
// ============================================================================

export const SkillsMasterSchema = v.union([
  EraBasedSkillsMasterSchema,
  GenericSkillsMasterSchema,
]);

export type SkillsMaster = v.InferOutput<typeof SkillsMasterSchema>;
