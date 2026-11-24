import * as v from 'valibot';

// ============================================================================
// Base Meta Schema - 所有 game data 共用
// ============================================================================

export const GameDataMetaSchema = v.object({
  $schema: v.string(),
  version: v.string(),
});

export type GameDataMeta = v.InferOutput<typeof GameDataMetaSchema>;

// ============================================================================
// Base Item Schema - 具有 id 的項目
// ============================================================================

export const BaseItemSchema = v.object({
  id: v.string(),
});

export type BaseItem = v.InferOutput<typeof BaseItemSchema>;

// ============================================================================
// Localizable Item - 支援 i18n fallback 的項目
// ============================================================================

/**
 * 基礎可本地化項目
 * - id: 必填，用於識別和 i18n key
 * - name: 選填，有則直接用，無則從 messages 查找
 */
export const LocalizableItemSchema = v.object({
  id: v.string(),
  name: v.optional(v.string()),
});

export type LocalizableItem = v.InferOutput<typeof LocalizableItemSchema>;

// Backward compat alias
export const LocalizedStringSchema = LocalizableItemSchema;
export type LocalizedString = LocalizableItem;
