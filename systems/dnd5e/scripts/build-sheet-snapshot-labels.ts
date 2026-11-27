/** Regenerate the small names-only lookup for sheet rows saved in a previous viewing locale. */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { choiceOf, namedOptionsIn } from "../sheet/level-up/options";
import type { GameWeapon } from "../sheet/play/play-model";

const root = pathToFileURL(resolve(process.argv[2] ?? "data/dnd5e-2024") + "/");
const load = async <T>(path: string): Promise<T> => JSON.parse(await readFile(new URL(path, root), "utf8"));
await mkdir(new URL("messages/sheet-snapshot/", root), { recursive: true });
const parts = (await readdir(new URL("corpus/en/", root))).filter((part) => /^(subclass|class)Feature-.*\.json$/.test(part)).sort();
const weapons = await load<GameWeapon[]>("game/weapons.json");
type Corpus = Record<string, { entries?: unknown[] }>;
for (const locale of ["en", "zh-TW"]) {
  const { ref } = await load<{ ref: Record<string, Record<string, string>> }>(`messages/${locale}.json`);
  const { damageType } = await load<{ damageType: Record<string, string> }>(`messages/play-tabs/${locale}.json`);
  const label = (key: string) => { const [kind, id] = key.split(":"); return ref[kind]?.[id] ?? id; };
  const attacks = Object.fromEntries(weapons.map((weapon) => [weapon.ref, {
    name: label(weapon.ref), damageType: damageType[weapon.damage?.type ?? ""] ?? "",
    mastery: weapon.mastery?.[0] ? label(weapon.mastery[0]) : "",
    notes: [...(weapon.properties ?? []).map(label), weapon.range].filter(Boolean).join(" · "),
  }]));
  const options: Record<string, Record<string, string>> = {};
  for (const part of parts) {
    const en = await load<Corpus>(`corpus/en/${part}`);
    const local = locale === "en" ? en : await load<Corpus>(`corpus/${locale}/${part}`);
    for (const [ref, feature] of Object.entries(en)) {
      const choice = choiceOf(feature.entries);
      const named = choice?.kind === "named" ? choice : choice?.kind === "feat" ? choice.alternatives : null;
      if (!named) continue;
      const labels = namedOptionsIn(local[ref]?.entries ?? [], named) ?? named.options;
      options[ref] = Object.fromEntries(named.options.map((id, index) => [id, labels[index]]));
    }
  }
  await writeFile(new URL(`messages/sheet-snapshot/${locale}.json`, root), JSON.stringify({ attacks, options }, null, 2) + "\n");
}
