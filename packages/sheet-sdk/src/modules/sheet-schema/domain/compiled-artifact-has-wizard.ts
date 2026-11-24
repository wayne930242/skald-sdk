import { WIZARD_SCHEMA } from "@skald/types/wizard";

/**
 * Whether a published Template Version carries a Character Creation Wizard.
 *
 * Publish writes `compiledArtifact.wizard` only for a source whose `wizard`
 * passed validation, so the compiled marker is the one thing every reader
 * (the System runtime loader, the template list, the wizard route) can ask
 * without loading the definition. A version without it is created the way
 * it always was: default data, then the sheet.
 */
export function compiledArtifactHasWizard(compiledArtifact: unknown): boolean {
  if (typeof compiledArtifact !== "object" || compiledArtifact === null) return false;
  const wizard = (compiledArtifact as Record<string, unknown>).wizard;
  return (
    typeof wizard === "object" &&
    wizard !== null &&
    (wizard as Record<string, unknown>).schema === WIZARD_SCHEMA
  );
}
