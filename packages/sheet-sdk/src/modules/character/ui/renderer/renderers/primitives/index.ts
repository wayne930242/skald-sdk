// modules/character/ui/renderer/renderers/primitives/index.ts
// Import for side effects (self-registration)
import "./text-field";
import "./number-field";
import "./computed-field";
import "./select-field";
import "./toggle-field";

// Re-export for direct usage if needed
export { TextFieldRenderer } from "./text-field";
export { NumberFieldRenderer } from "./number-field";
export { ComputedFieldRenderer } from "./computed-field";
export { SelectFieldRenderer } from "./select-field";
export { ToggleFieldRenderer } from "./toggle-field";
