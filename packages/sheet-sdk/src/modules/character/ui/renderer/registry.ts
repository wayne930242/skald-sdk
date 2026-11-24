// modules/character/ui/renderer/registry.ts
import type { Field } from "@skald/types/schema";
import type { FieldRendererComponent } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";

export type { FieldRendererComponent, FieldRendererProps } from "@skald/sheet-sdk/modules/systems/ui/system-plugin-ui";

/**
 * Registry of field type to renderer component
 */
const fieldRegistry = new Map<string, FieldRendererComponent<Field>>();

/**
 * Register a renderer for a field type
 */
export function registerFieldRenderer<T extends Field>(
  fieldType: T["type"],
  renderer: FieldRendererComponent<T>,
): void {
  fieldRegistry.set(fieldType, renderer as FieldRendererComponent<Field>);
}

/**
 * Get the renderer for a field type
 */
export function getFieldRenderer(
  fieldType: string,
  pluginRenderers?: ReadonlyMap<string, FieldRendererComponent>,
): FieldRendererComponent<Field> | undefined {
  return pluginRenderers?.get(fieldType) ?? fieldRegistry.get(fieldType);
}

/**
 * Check if a renderer is registered for a field type
 */
export function hasFieldRenderer(
  fieldType: string,
  pluginRenderers?: ReadonlyMap<string, FieldRendererComponent>,
): boolean {
  return !!getFieldRenderer(fieldType, pluginRenderers);
}

/** Get all field types available to the host. */
export function getRegisteredFieldTypes(
  pluginRenderers?: ReadonlyMap<string, FieldRendererComponent>,
): string[] {
  return [...new Set([...fieldRegistry.keys(), ...(pluginRenderers?.keys() ?? [])])];
}
