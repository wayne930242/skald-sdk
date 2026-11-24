import * as v from 'valibot';
import { SkillsMasterSchema } from './modules/skills';
import { TechniquesMasterSchema } from './modules/techniques';
import { OccupationsMasterSchema } from './modules/occupations';
import { WeaponsMasterSchema } from './modules/weapons';
import { PlaybooksMasterSchema } from './modules/playbooks';

// ============================================================================
// Schema Registry - 根據 $schema 欄位選擇驗證器
// ============================================================================

type SchemaEntry = {
  schema: v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>;
  description: string;
};

const schemaRegistry: Record<string, SchemaEntry> = {
  'skald/skills-master/v1': {
    schema: SkillsMasterSchema,
    description: 'Skills master data',
  },
  'skald/techniques-master/v1': {
    schema: TechniquesMasterSchema,
    description: 'Techniques master data',
  },
  'skald/occupations-master/v1': {
    schema: OccupationsMasterSchema,
    description: 'Occupations master data',
  },
  'skald/weapons-master/v1': {
    schema: WeaponsMasterSchema,
    description: 'Weapons master data',
  },
  'skald/playbooks-master/v1': {
    schema: PlaybooksMasterSchema,
    description: 'Playbooks master data',
  },
};

/**
 * 根據 $schema 欄位取得對應的 Valibot schema
 */
export function getSchemaForData(schemaId: string): SchemaEntry | undefined {
  return schemaRegistry[schemaId];
}

/**
 * 註冊新的 schema（供擴展用）
 */
export function registerSchema(schemaId: string, entry: SchemaEntry): void {
  schemaRegistry[schemaId] = entry;
}

/**
 * 列出所有已註冊的 schemas
 */
export function listRegisteredSchemas(): string[] {
  return Object.keys(schemaRegistry);
}
