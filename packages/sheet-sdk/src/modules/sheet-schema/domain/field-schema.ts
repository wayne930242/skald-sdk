import { z } from "zod";

export const templateStyleVariableNameSchema = z
  .string()
  .regex(/^--skald-[a-z0-9-]+$/);
export const templateCustomClassNameSchema = z
  .string()
  .regex(/^skald-user-[a-z0-9-]+$/);

/**
 * Base field layout schema
 * Validates common layout properties without being overly restrictive
 */
export const fieldLayoutSchema = z
  .object({
    width: z.union([z.string(), z.number()]).optional(),
    height: z.union([z.string(), z.number()]).optional(),
    minWidth: z.union([z.string(), z.number()]).optional(),
    maxWidth: z.union([z.string(), z.number()]).optional(),
    padding: z.string().optional(),
    margin: z.string().optional(),
    hidden: z.union([z.boolean(), z.string()]).optional(),
    printHidden: z.boolean().optional(),
    screenHidden: z.boolean().optional(),
  })
  .passthrough()
  .optional();

/**
 * Base field schema - validates structure common to all fields
 * Uses passthrough() to allow field-type-specific properties
 */
export const baseFieldSchema = z
  .object({
    id: z.string().min(1, "Field ID is required"),
    type: z.string().min(1, "Field type is required"),
    label: z.string().optional(),
    labelPosition: z.enum(["top", "left", "inline", "hidden"]).optional(),
    description: z.string().optional(),
    layout: fieldLayoutSchema,
    required: z.boolean().optional(),
    readonly: z.boolean().optional(),
    defaultValue: z.unknown().optional(),
    visibleWhen: z.string().optional(),
    customClass: templateCustomClassNameSchema.optional(),
  })
  .passthrough(); // Allow additional field-type-specific properties

const LIST_ROW_FORBIDDEN_TYPES = new Set([
  "list",
  "structured-list",
  "page",
  "section",
  "container",
  "object",
]);

/** List Row Template 只接受可渲染的共用葉節點 Field。 */
export const listRowFieldSchema = baseFieldSchema.superRefine((field, context) => {
  if (LIST_ROW_FORBIDDEN_TYPES.has(field.type)) {
    context.addIssue({
      code: "custom",
      path: ["type"],
      message: `List Row Template cannot contain structural field type \"${field.type}\".`,
    });
  }
});

export const listRowTemplateSchema = z.object({
  children: z.array(listRowFieldSchema),
  layout: z.lazy(() => pageLayoutSchema),
});

export const listFieldSchema = baseFieldSchema.extend({
  type: z.literal("list"),
  rowTemplate: listRowTemplateSchema,
  maxItems: z.number().int().nonnegative().optional(),
  allowAdd: z.boolean().optional(),
  allowRemove: z.boolean().optional(),
  idPrefix: z.string().optional(),
  emptyMessage: z.string().optional(),
});

export const fieldDefinitionSchema = baseFieldSchema.superRefine(
  (field, context) => {
    if (field.type === "character-reference") {
      refineCharacterReference(field, context);
      return;
    }
    if (field.type !== "list") return;

    const result = listFieldSchema.safeParse(field);
    if (result.success) return;

    for (const issue of result.error.issues) {
      context.addIssue({
        code: "custom",
        path: issue.path,
        message: issue.message,
      });
    }
  }
);

/** ADR 0014: `scope: "table"` is the only scope, and only for a multi-entry reference list. */
function refineCharacterReference(field: Record<string, unknown>, context: z.RefinementCtx) {
  if (field.scope === undefined) return;
  if (field.scope !== "table") {
    context.addIssue({ code: "custom", path: ["scope"], message: 'character-reference scope must be "table"' });
  } else if (field.allowMultiple !== true) {
    context.addIssue({
      code: "custom",
      path: ["allowMultiple"],
      message: 'character-reference with scope "table" requires allowMultiple: true',
    });
  }
}

/**
 * Schema for fields record - maps field IDs to field definitions
 */
export const fieldsRecordSchema = z.record(z.string(), fieldDefinitionSchema);

/**
 * Page layout schema
 */
export const pageLayoutSchema = z
  .object({
    type: z.enum(["stack", "grid", "fixed"]),
    direction: z.enum(["row", "column"]).optional(),
    columns: z.union([z.array(z.string()), z.number(), z.string()]).optional(),
    baseColumns: z.number().int().min(1).optional(),
    rows: z.union([z.array(z.string()), z.number(), z.string()]).optional(),
    gap: z.string().optional(),
    columnGap: z.string().optional(),
    rowGap: z.string().optional(),
  })
  .passthrough();

/**
 * Field reference schema (used in page content)
 */
export const fieldReferenceSchema = z
  .object({
    type: z.literal("field-ref"),
    fieldId: z.string(),
    label: z.string().optional(),
    printGrid: z
      .object({
        span: z.number().int().min(1).max(12),
        start: z.number().int().min(1).max(12).optional(),
      })
      .optional(),
    layout: fieldLayoutSchema,
    customClass: templateCustomClassNameSchema.optional(),
  })
  .passthrough();

/**
 * Container schema (used in page content)
 */
export const containerSchema = z
  .object({
    type: z.literal("container"),
    layout: pageLayoutSchema.optional(),
    children: z.array(z.lazy(() => pageContentSchema)),
  })
  .passthrough();

/**
 * Section schema (used in page content)
 */
export const sectionSchema = z
  .object({
    type: z.literal("section"),
    id: z.string(),
    title: z.string().optional(),
    layout: pageLayoutSchema.optional(),
    children: z.array(z.lazy(() => pageContentSchema)),
    customClass: templateCustomClassNameSchema.optional(),
  })
  .passthrough();

/**
 * Page content item (field reference, section, container, or inline field)
 */
export const pageContentSchema: z.ZodTypeAny = z
  .object({ type: z.string() })
  .passthrough()
  .superRefine((content, context) => {
    const reservedSchema =
      content.type === "field-ref"
        ? fieldReferenceSchema
        : content.type === "section"
          ? sectionSchema
          : content.type === "container"
            ? containerSchema
            : null;
    if (!reservedSchema) return;

    const result = reservedSchema.safeParse(content);
    if (result.success) return;
    for (const issue of result.error.issues) {
      context.addIssue({
        code: "custom",
        path: issue.path,
        message: issue.message,
      });
    }
  });

/**
 * Page schema
 */
export const pageSchema = z
  .object({
    id: z.string(),
    title: z.string().optional(),
    layout: pageLayoutSchema.optional(),
    children: z.array(pageContentSchema),
    customClass: templateCustomClassNameSchema.optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// views.web
//
// `views` 有自己的一組 content schema，而不是在上面的 sectionSchema／
// fieldReferenceSchema 加屬性：那兩個同時驗證 `pages`，新屬性不能影響
// 既有範本（含社群範本與舊版本）的驗證結果。
// ---------------------------------------------------------------------------

/** 行動優先的響應式值：直接給值，或 `{ base, md?, lg? }`。 */
function responsive<T extends z.ZodTypeAny>(inner: T) {
  return z.union([
    inner,
    z
      .object({
        base: inner,
        md: inner.optional(),
        lg: inner.optional(),
      })
      .strict(),
  ]);
}

const sheetModesSchema = z
  .array(z.enum(["play", "edit"]))
  .min(1)
  .refine((modes) => new Set(modes).size === modes.length, {
    message: "modes must not contain duplicates",
  });

const stickyConfigSchema = z
  .object({
    top: z.string().optional(),
    maxHeight: z.literal("viewport").optional(),
  })
  .strict();

const layoutOverridesSchema = z
  .object({
    md: pageLayoutSchema.partial().optional(),
    lg: pageLayoutSchema.partial().optional(),
  })
  .strict();

const fieldLayoutOverridesSchema = z
  .object({
    md: fieldLayoutSchema,
    lg: fieldLayoutSchema,
  })
  .strict();

const webFieldReferenceSchema = fieldReferenceSchema.extend({
  display: responsive(z.string().min(1)).optional(),
  modes: sheetModesSchema.optional(),
  visible: responsive(z.boolean()).optional(),
  at: fieldLayoutOverridesSchema.optional(),
});

const webContainerSchema = containerSchema.extend({
  children: z.array(z.lazy(() => webViewContentSchema)),
});

const webSectionSchema = sectionSchema.extend({
  children: z.array(z.lazy(() => webViewContentSchema)),
  display: responsive(z.enum(["stack", "tabs"])).optional(),
  sticky: responsive(z.union([z.boolean(), stickyConfigSchema])).optional(),
  at: layoutOverridesSchema.optional(),
  modes: sheetModesSchema.optional(),
  visible: responsive(z.boolean()).optional(),
  slot: z.literal("campaign-rules").optional(),
});

/**
 * views.web 的內容節點（欄位引用、區塊、容器或 inline 欄位）
 */
const webViewContentSchema: z.ZodTypeAny = z
  .object({ type: z.string() })
  .passthrough()
  .superRefine((content, context) => {
    const reservedSchema =
      content.type === "field-ref"
        ? webFieldReferenceSchema
        : content.type === "section"
          ? webSectionSchema
          : content.type === "container"
            ? webContainerSchema
            : null;
    if (!reservedSchema) return;

    const result = reservedSchema.safeParse(content);
    if (result.success) return;
    for (const issue of result.error.issues) {
      context.addIssue({
        code: "custom",
        path: issue.path,
        message: issue.message,
      });
    }
  });

const webViewHeaderSchema = z
  .object({
    title: z.string().min(1),
    subtitle: z.array(z.string().min(1)).optional(),
    portrait: z.string().min(1).optional(),
  })
  .strict();

/** `Template.header`：照 pages 渲染的範本的身分列；title 可省略（沿用名稱欄位）。 */
const templateHeaderSchema = z
  .object({
    title: z.string().min(1).optional(),
    subtitle: z.array(z.string().min(1)).optional(),
    portrait: z.string().min(1).optional(),
  })
  .strict();

const webViewSchema = z
  .object({
    id: z.string().min(1),
    header: webViewHeaderSchema.optional(),
    layout: pageLayoutSchema,
    at: layoutOverridesSchema.optional(),
    children: z.array(webViewContentSchema),
  })
  .strict();

const templateViewsSchema = z
  .object({
    web: webViewSchema.optional(),
  })
  .strict();

/**
 * Schema definition schema
 */
export const schemaDefinitionSchema = z.object({
  $schema: z.literal("skald/schema/v1"),
  id: z.string(),
  name: z.string(),
  version: z.string(),
  fields: fieldsRecordSchema,
});

/**
 * Template definition schema
 */
export const templateDefinitionSchema = z.object({
  $schema: z.literal("skald/template/v1"),
  id: z.string(),
  name: z.string(),
  version: z.string(),
  schemaId: z.string(),
  schemaVersion: z.string(),
  scopedStyles: z
    .object({
      variables: z
        .record(templateStyleVariableNameSchema, z.string())
        .optional(),
      css: z.string().optional(),
    })
    .optional(),
  pages: z.array(pageSchema),
  header: templateHeaderSchema.optional(),
  views: templateViewsSchema.optional(),
});
