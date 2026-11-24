/**
 * The sheet part of the template compiler as its own entry: a built-in's structure, formula and
 * scoped-CSS artifact, pure and free of publishing, so plugin tests (and the open-source export)
 * reach it without the rest of the templates index.
 */
export { compileBuiltinFixtureArtifact } from "./domain/artifact-dual-read";
