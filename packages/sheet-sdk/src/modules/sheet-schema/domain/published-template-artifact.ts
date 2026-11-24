import type { Json } from "@skald/types";

export interface PublishedTemplateArtifact {
  versionId: string;
  /** The Character Sheet Template the version belongs to. */
  templateId?: string;
  source: Json;
  compiledArtifact: Json;
}
