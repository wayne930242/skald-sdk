import type { z } from "zod";
import {
  schemaDefinitionSchema,
  templateDefinitionSchema,
} from "@skald/sheet-sdk/modules/sheet-schema";
import type {
  JsonObject,
  TemplateArtifactValidationResult,
  TemplateArtifactValidator,
  TemplateValidationIssue,
} from "@skald/sheet-sdk/modules/sheet-schema";

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function zodIssues(
  root: "schema" | "template",
  result: z.ZodSafeParseResult<unknown>
): TemplateValidationIssue[] {
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    category: "template",
    code: `${root}_invalid`,
    severity: "error",
    path: [root, ...issue.path.map(String)],
    message: issue.message,
    details: { zodCode: issue.code },
  }));
}

/** views.web 裡每個要指向 schema 欄位的 ID，連同它在 source 中的位置。 */
interface ViewFieldReference {
  fieldId: string;
  path: string[];
}

function collectViewFieldReferences(
  nodes: unknown,
  path: string[],
  found: ViewFieldReference[]
): void {
  if (!Array.isArray(nodes)) return;
  nodes.forEach((node, index) => {
    if (!isObject(node)) return;
    const nodePath = [...path, String(index)];
    if (node.type === "field-ref" && typeof node.fieldId === "string") {
      found.push({ fieldId: node.fieldId, path: [...nodePath, "fieldId"] });
    }
    collectViewFieldReferences(node.children, [...nodePath, "children"], found);
  });
}

/** views.web 內的欄位引用與身分列欄位，都必須存在於 schema.fields。 */
function unknownViewFieldIssues(
  template: {
    views?: {
      web?: {
        header?: { title: string; subtitle?: string[]; portrait?: string };
        children: unknown[];
      };
    };
  },
  fieldIds: ReadonlySet<string>,
  headerOnly = false,
): TemplateValidationIssue[] {
  const web = template.views?.web;
  if (!web) return [];

  const references: ViewFieldReference[] = [];
  const headerPath = ["template", "views", "web", "header"];
  if (web.header) {
    references.push({
      fieldId: web.header.title,
      path: [...headerPath, "title"],
    });
    web.header.subtitle?.forEach((fieldId, index) =>
      references.push({
        fieldId,
        path: [...headerPath, "subtitle", String(index)],
      })
    );
    if (web.header.portrait !== undefined) {
      references.push({
        fieldId: web.header.portrait,
        path: [...headerPath, "portrait"],
      });
    }
  }
  if (!headerOnly) {
    collectViewFieldReferences(
      web.children,
      ["template", "views", "web", "children"],
      references
    );
  }

  return references
    .filter((reference) => !fieldIds.has(reference.fieldId))
    .map((reference) => ({
      category: "template",
      code: "template_view_unknown_field",
      severity: "error",
      path: reference.path,
      message: `${reference.path[3] === "header" ? reference.path.slice(1).join(".") : "views.web"} references field "${reference.fieldId}" which is not defined in the schema.`,
      details: { fieldId: reference.fieldId },
    }));
}

/** `Template.header`（照 pages 渲染的範本）的欄位也必須存在於 schema.fields。 */
function unknownHeaderFieldIssues(
  template: { header?: { title?: string; subtitle?: string[]; portrait?: string } },
  fieldIds: ReadonlySet<string>
): TemplateValidationIssue[] {
  const header = template.header;
  if (!header) return [];
  const path = ["template", "header"];
  const references: ViewFieldReference[] = [];
  if (header.title !== undefined) references.push({ fieldId: header.title, path: [...path, "title"] });
  header.subtitle?.forEach((fieldId, index) =>
    references.push({ fieldId, path: [...path, "subtitle", String(index)] })
  );
  if (header.portrait !== undefined) references.push({ fieldId: header.portrait, path: [...path, "portrait"] });
  return references
    .filter((reference) => !fieldIds.has(reference.fieldId))
    .map((reference) => ({
      category: "template",
      code: "template_header_unknown_field",
      severity: "error",
      path: reference.path,
      message: `${reference.path.slice(1).join(".")} references field "${reference.fieldId}" which is not defined in the schema.`,
      details: { fieldId: reference.fieldId },
    }));
}

export function findUnknownHeaderFields(
  template: z.infer<typeof templateDefinitionSchema>,
  fieldIds: ReadonlySet<string>,
): TemplateValidationIssue[] {
  return [
    ...unknownHeaderFieldIssues(template, fieldIds),
    ...unknownViewFieldIssues(template, fieldIds, true),
  ];
}

function invalidPortraitIssues(
  template: z.infer<typeof templateDefinitionSchema>,
  fieldTypes: ReadonlyMap<string, string>,
): TemplateValidationIssue[] {
  const portraits = [
    { fieldId: template.header?.portrait, path: ["template", "header", "portrait"] },
    { fieldId: template.views?.web?.header?.portrait, path: ["template", "views", "web", "header", "portrait"] },
  ];
  return portraits.flatMap(({ fieldId, path }): TemplateValidationIssue[] => {
    if (fieldId === undefined) return [];
    const type = fieldTypes.get(fieldId);
    if (type === undefined || type === "image") return [];
    return [{
      category: "template",
      code: "template_header_portrait_not_image",
      severity: "error",
      path,
      message: `${path.slice(1).join(".")} must reference an image field; "${fieldId}" has type "${type}".`,
      details: { fieldId },
    }];
  });
}

export class TemplateStructureValidator implements TemplateArtifactValidator {
  validate(source: JsonObject): TemplateArtifactValidationResult {
    const issues: TemplateValidationIssue[] = [];
    if (isObject(source.schema)) {
      const result = schemaDefinitionSchema.safeParse(source.schema);
      issues.push(...zodIssues("schema", result));
      if (result.success && Object.keys(result.data.fields).length === 0) {
        issues.push({
          category: "template",
          code: "schema_fields_empty",
          severity: "error",
          path: ["schema", "fields"],
          message: "Template Draft schema must define at least one field.",
        });
      }
    }
    const schema = schemaDefinitionSchema.safeParse(source.schema);
    if (isObject(source.template)) {
      const result = templateDefinitionSchema.safeParse(source.template);
      issues.push(...zodIssues("template", result));
      if (result.success) {
        if (result.data.name.trim().length === 0) {
          issues.push({
            category: "template",
            code: "template_name_empty",
            severity: "error",
            path: ["template", "name"],
            message: "Template Draft name must not be empty.",
          });
        }
        if (!result.data.pages.some((page) => page.children.length > 0)) {
          issues.push({
            category: "template",
            code: "template_content_empty",
            severity: "error",
            path: ["template", "pages"],
            message: "Template Draft must contain at least one page item.",
          });
        }
        if (schema.success) {
          const fields = Object.entries(schema.data.fields);
          const fieldIds = new Set(fields.map(([id]) => id));
          issues.push(...unknownViewFieldIssues(result.data, fieldIds));
          issues.push(...unknownHeaderFieldIssues(result.data, fieldIds));
          issues.push(...invalidPortraitIssues(result.data, new Map(fields.map(([id, field]) => [id, field.type]))));
        }
      }
    }
    return {
      issues,
      compiledArtifact:
        issues.length === 0
          ? { schema: source.schema, template: source.template }
          : {},
      compilerVersions: { structure: "skald/template-structure/v1" },
    };
  }
}
