import type { LoadedSystem } from "@skald/types/system";
import { normalizeSchema, normalizeTemplate, readCharacterFormulaRuntime } from "@skald/sheet-sdk/modules/sheet-schema";
import { ruleNodesPlainText, toSystemData, type SystemPack, type SystemPackDocument } from "@skald/sheet-sdk/modules/systems/domain/system-pack";
import type { SystemRulesReader } from "@skald/sheet-sdk/modules/systems/ui/core-ports";
import { compileBuiltinFixtureArtifact } from "@skald/sheet-sdk/modules/templates/sheet-artifact";

function packReader(documents: SystemPackDocument[]): SystemRulesReader {
  const title = ({ key, title }: SystemPackDocument) => ({ key, title });
  const get = (kind: string, collection: string | null, key: string) => {
    const doc = documents.find(d => d.kind === kind && d.collection === collection && d.key === key);
    if (!doc) throw new Error(`Unknown ${kind}: ${key}`);
    return doc;
  };
  return {
    toc: async () => documents.filter(d => d.kind === 'section').map(d => ({ ...title(d), parent_key: d.parentKey })),
    section: async key => get('section', null, key),
    collections: async () => documents.filter(d => d.kind === 'collection').map(title),
    entries: async (collection, page) => {
      const entries = documents.filter(d => d.kind === 'entry' && d.collection === collection);
      const start = page * 50;
      return { items: entries.slice(start, start + 50).map(title), hasMore: start + 50 < entries.length };
    },
    entry: async (collection, key) => get('entry', collection, key),
    search: async query => {
      const hits = [];
      for (const doc of documents) {
        if (doc.kind === 'collection') continue;
        const text = [doc.title, doc.summary, ...doc.tags, ruleNodesPlainText(doc.blocks)].filter(Boolean).join(' ');
        const index = text.toLowerCase().indexOf(query.toLowerCase());
        if (index >= 0) hits.push({ ...title(doc), collection: doc.collection, snippet: text.slice(Math.max(0, index - 40), index + 120) });
        if (hits.length === 50) break;
      }
      return hits;
    },
  };
}

export function preparePack(pack: SystemPack) {
  // Never dispatch a built-in sheet or print plugin, even for a matching packId.
  const slug = `sp-${pack.manifest.packId}`;
  const { config, data, documents } = toSystemData(pack, slug);
  const templateVersionId = `preview:${pack.hash}`;
  const system: LoadedSystem = {
    // The renderer's category union describes only the built-ins. Preserve the pack category.
    config: { ...config, category: config.category as LoadedSystem['config']['category'] },
    runtime: { systemId: slug, templateVersionId, builtinTemplate: false },
    schema: normalizeSchema(data.schema), template: normalizeTemplate(data.template), defaultData: data.defaultData,
    gameData: data.gameData ?? {}, mappings: data.mappings ?? { eraMappings: {}, categoryMappings: {} }, dsl: data.dsl,
  };
  const { compiledArtifact } = compileBuiltinFixtureArtifact(slug, data);
  const formulaRuntime = readCharacterFormulaRuntime({ templateVersionId, compiledArtifact, derivedOverrides: {} }) ?? undefined;
  return { system, formulaRuntime, reader: packReader(documents) };
}
