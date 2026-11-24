/**
 * Attribute reference detection utilities
 *
 * These utilities help detect and validate attribute references in roll expressions.
 * Attribute references use the format {{@attr}} within expressions.
 */

/** Regex to match attribute references: @attr within {{...}} */
const STANDALONE_ATTR_REGEX = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;

export interface AttributeValidationResult {
  valid: boolean;
  missingAttributes: string[];
}

/**
 * Check if an expression contains any attribute references
 */
export function hasAttributeReference(expression: string): boolean {
  // Find all {{...}} blocks
  const braceMatches = expression.match(/\{\{[^}]+\}\}/g) || [];

  for (const block of braceMatches) {
    // Skip macro references {{#macroId}}
    if (block.includes("#")) continue;

    // Check if there's an @attr in this block
    if (/@[a-zA-Z_]/.test(block)) {
      return true;
    }
  }

  return false;
}

/**
 * Find all attribute references in an expression
 * Returns unique attribute names
 */
export function findAttributeReferences(expression: string): string[] {
  const attributes = new Set<string>();

  // Find all {{...}} blocks
  const braceMatches = expression.match(/\{\{[^}]+\}\}/g) || [];

  for (const block of braceMatches) {
    // Skip macro references {{#macroId}}
    if (block.includes("#")) continue;

    // Find all @attr within the block
    STANDALONE_ATTR_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = STANDALONE_ATTR_REGEX.exec(block)) !== null) {
      attributes.add(match[1]);
    }
  }

  return Array.from(attributes);
}

/**
 * Validate that all attribute references have values in context
 */
export function validateAttributeReferences(
  expression: string,
  context: Record<string, number> | undefined
): AttributeValidationResult {
  const requiredAttrs = findAttributeReferences(expression);

  if (requiredAttrs.length === 0) {
    return { valid: true, missingAttributes: [] };
  }

  if (!context) {
    return { valid: false, missingAttributes: requiredAttrs };
  }

  const missingAttributes = requiredAttrs.filter(
    (attr) => !(attr in context)
  );

  return {
    valid: missingAttributes.length === 0,
    missingAttributes,
  };
}
