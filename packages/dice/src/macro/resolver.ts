// packages/dice/src/macro/resolver.ts
import type {
  RollMacroRegistry,
  RollMacroDefinition,
  ResolvedMacroDefinition,
  MacroParamDefinition,
} from "./types";
import { parseMacroBody } from "./body-parser";
import { isReservedIdentifier } from "./reserved-words";

export class MacroValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MacroValidationError";
  }
}

function validateParams(macroId: string, params: MacroParamDefinition[]): void {
  const seen = new Set<string>();
  for (const param of params) {
    if (isReservedIdentifier(param.name)) {
      throw new MacroValidationError(
        `Macro "${macroId}" parameter "${param.name}" is a reserved identifier (rolled/target/total/margin).`,
      );
    }
    if (seen.has(param.name)) {
      throw new MacroValidationError(
        `Macro "${macroId}" declares parameter "${param.name}" more than once.`,
      );
    }
    seen.add(param.name);
  }
}

export class MacroResolver {
  private registry: RollMacroRegistry;
  private cache = new Map<string, ResolvedMacroDefinition>();

  constructor(registry: RollMacroRegistry) {
    this.registry = registry;
  }

  /**
   * Resolve a macro ID to its parsed, validated definition. Parsing and
   * validation happen once per macro id and are cached — not repeated per
   * invocation.
   */
  resolve(macroId: string): ResolvedMacroDefinition | null {
    const direct = this.registry.macros[macroId];
    const normalizedId = direct
      ? macroId
      : Object.keys(this.registry.macros).find(
          (id) => id.toLowerCase() === macroId.toLowerCase(),
        );
    const definition = direct ?? (normalizedId ? this.registry.macros[normalizedId] : undefined);
    if (!definition) return null;

    const resolvedId = normalizedId ?? macroId;
    const cached = this.cache.get(resolvedId);
    if (cached) return cached;

    validateParams(resolvedId, definition.params);
    const body = parseMacroBody(definition.body);

    const resolved: ResolvedMacroDefinition = {
      macroId: resolvedId,
      label: definition.label ?? resolvedId,
      system: definition.system ?? this.registry.defaultSystem,
      target: definition.target ?? this.registry.defaultTarget ?? "session",
      params: definition.params,
      body,
      bonusDice: definition.bonusDice,
      dialog: definition.dialog,
    };
    this.cache.set(resolvedId, resolved);
    return resolved;
  }

  /**
   * Check if a macro exists
   */
  has(macroId: string): boolean {
    return macroId in this.registry.macros;
  }

  /**
   * Get all macro IDs
   */
  getAllIds(): string[] {
    return Object.keys(this.registry.macros);
  }

  /**
   * Add or update a macro definition
   */
  register(macroId: string, definition: RollMacroDefinition): void {
    this.registry.macros[macroId] = definition;
    this.cache.delete(macroId);
  }
}
