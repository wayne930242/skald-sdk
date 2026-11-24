// modules/character/ui/renderer/renderers/index.ts
/**
 * Master index for all field renderers
 * Imports trigger self-registration via side effects
 */

// Primitive renderers
import "./primitives";

// Display renderers
import "./display";

// Interactive renderers
import "./interactive";

// List renderers
import "./lists";

// Reference renderers
import "./reference";

// Re-export for direct access
export * from "./primitives";
export * from "./display";
export * from "./interactive";
export * from "./lists";
export * from "./reference";
