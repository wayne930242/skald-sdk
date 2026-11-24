import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import type { LoadedSystem } from "@skald/types/system";
import zh from "@skald/system-dnd5e/data/dnd5e-2024/messages/zh-TW.json";
import config from "@skald/system-dnd5e/data/dnd5e-2024/system.json";
import schema from "@skald/system-dnd5e/data/dnd5e-2024/schema.json";
import template from "@skald/system-dnd5e/data/dnd5e-2024/template.json";
import weapons from "@skald/system-dnd5e/data/dnd5e-2024/game/weapons.json";
import en from "@skald/system-dnd5e/data/dnd5e-2024/messages/en.json";
import { CompendiumDialog } from "../compendium-dialog";
import { useReferenceContext } from "../use-reference-context";
import type { EffectivePacks } from "../../content-pack/domain/types";
import { sampleDm } from './sample-dm-content';

const pack = "compendium-layout-fixture";
const id = "fighter/example/ward-l18";
const ref = `subclassFeature:${id}`;
const packs: EffectivePacks = {
  keys: [pack, 'xdmg-extras'], supplier: { [ref]: pack, ...Object.fromEntries(sampleDm.entries.map(entry => [entry.ref, 'xdmg-extras'])) }, aliases: {}, shadowed: {},
  content: {
    entries: [...sampleDm.entries, { kind: 'chapter', id: 'xphb/sample', ref: 'chapter:xphb/sample', name: 'Sample Chapter', entries: [], meta: { bookChapter: 0 } }, { kind: "subclassFeature", id, ref, name: "Bright Ward of the Winter Stars", entries: [], meta: {} }],
    zhTW: { ...sampleDm.zhTW, [ref]: { name: "冬星守衛", entries: [] } }, wizard: {},
  },
};
const system: LoadedSystem = {
  config: config as LoadedSystem["config"], schema: schema as LoadedSystem["schema"], template: template as LoadedSystem["template"],
  defaultData: {}, mappings: { eraMappings: {}, categoryMappings: {} }, gameData: { weapons },
};
function Fixture() {
  const context = useReferenceContext(system, packs, { english: true, reference: true });
  return <CompendiumDialog open start={{ tab: "features" }} system={system} context={context} onUpdate={() => {}} onPreview={() => {}} onClose={() => {}} />;
}
const locale = location.search === "?en" ? "en" : "zh-TW";
createRoot(document.getElementById("root")!).render(<NextIntlClientProvider locale={locale} messages={locale === "en" ? en : zh} timeZone="UTC"><Fixture /></NextIntlClientProvider>);
