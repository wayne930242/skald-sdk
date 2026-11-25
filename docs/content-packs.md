# Content packs

[繁體中文](content-packs.zh-TW.md)

Skald keeps two kinds of game content apart: the content built into this repository, and content packs that each player keeps for themselves.
This page explains where the line runs, what a content pack is, and how to write, check and preview one with the tools in this repository.

## Two kinds of content

**Built-in content** ships in this repository and on [skald.tw](https://skald.tw) for everyone.
It may only be material that this repository is allowed to redistribute:

- a system reference document under an open licence, such as the D&D SRD 5.2.1 (CC BY 4.0) or the Fate SRD (CC BY 3.0);
- text the contributor wrote themselves;
- other material under a licence such as CC BY, CC0 or MIT;
- material a publisher's fan or community content policy allows to be redistributed in a project like this one: a free, public, open-source repository whose content anyone can read free of charge on skald.tw, a service that also sells memberships.

Material under a fan policy keeps the publisher's terms and is not relicensed under Apache-2.0.
Read the policy before you contribute anything it covers, and link it in the pull request.
[CONTRIBUTING.md](../CONTRIBUTING.md) has the full rule.

**Content packs** hold the rest: text you may use at your own table but may not redistribute, such as material from a book you own, your notes on it, or your table's house rules.
For a file-based pack, you keep the file. Skald reads it on your device and shows its text next to the built-in content.

## What a content pack is

A content pack is one JSON file for one system. It can:

- add entries that are not built in, such as spells, feats, items, creatures, tables or rules text;
- add character creation options that point to those entries;
- show other wording over a built-in entry (an overlay), with a switch back to the built-in text;
- carry a Traditional Chinese layer next to the English text.

A file-based pack is not:

- hosted, listed or shared by Skald;
- part of this repository: never commit a pack file or text from one here, not even in a test. `bun run ci` fails when the repository holds a pack file other than the example below;
- a way to change built-in entries for everyone: an overlay shows only where the pack is loaded.

## Write homebrew in Skald

Sign in and open the [D&D 2024 homebrew editor](https://skald.tw/en/sheets/dnd5e-2024/homebrew). Unlike a pack you load from Drive, a homebrew pack holds your own content in your Skald account. Guests cannot create packs. Name a pack, then add a feat, spell, magic item, species, background, class or subclass. You can keep up to 20 named packs; together they can hold up to 300 entries and 1 MB per account.

A subclass belongs to the class you pick when you create it, and the class cannot change after the first save. Each feature sits at a level where that class gains subclass features: 3, 7, 15 and 20 for the Paladin. Moving a saved feature to another level saves it as a new feature; sheets that added the old one keep it.

If the class or the subclass casts spells, you can list subclass spells that a character always has prepared from a given class level. A Fighter or Rogue subclass can cast spells as a third caster. Pick the spellcasting ability and the class whose spell list it borrows; cantrip and prepared spell counts by level are optional. Spell slots come from the SRD 5.2.1 multiclass spellcaster table at one third of the class level, rounded up, so a level 7 character reads the level 3 row. Skald labels the resulting table as derived, not SRD text.

Each feature is one entry toward the 300-entry limit. The subclass itself, its opening feature at the first subclass level, and its spells and spellcasting features, when present, are one entry each.

On a sheet, type the subclass name in the subclass field, then add its features from the Features tab of the compendium. The compendium shows each feature's class, level and subclass.

Enable a pack in the content pack panel to use it on a sheet. Adding an entry copies its text onto the sheet. If you bring the character to a table, members of that table can read the text in the table copy. Editing the original does not rewrite the sheet: choose **Update to latest** on the sheet row when you want the new version.

To move a pack, export it as a sealed `skald/pack/v1` JSON file. Import that file directly in the editor, without a Drive link. If a pack with the same ID already exists, choose whether to replace it or create another pack.

## Write a class

In the homebrew editor, add a class and copy a built-in class as a starting point. Set its starting proficiencies, equipment, progression and features. You can then use the class as a parent in the subclass editor.

A class saves as one `class` entry plus one `classFeature` entry for each generated or authored feature. Each counts separately toward the entry limit. For a pack class with id `ash-warden`, a level 2 feature might have id `ash-warden/ash-mark-l2` and `meta.level: 2`. Moving a saved feature to another level gives it a new id.

For a hand-written class, put one progression `table` in the class entry's English `entries`. Start `colLabels` with `Level`, `Proficiency Bonus`, and `Class Features`, in that order. Include one row for each level from 1 through 20. In the feature column, link to the feature entries with tags such as `{@classFeature ash-mark|ash-warden||2||Ash Mark}`. Add `Cantrips` and `Prepared Spells` where applicable, numbered columns (`1`, `2`, …) for regular spell slots, or `Spell Slots` and `Slot Level` for Pact Magic. You can add other columns for class-specific counts. Translate the display table in the zh-TW layer; keep the English headers in the source entry so the helper can read it.

To borrow a spell list, set `meta.spellcasting.list` to the source class id, such as `druid`. Character creation and the sheet's spell picker can then offer that list. Omit `list` to use the class's own id. Borrowing a list does not change the class's spellcasting progression.

### Multiclass rules for a pack class

Put the requirements and the proficiencies gained when joining the class under `meta.multiclass`. This example requires Dexterity or Wisdom of at least 13 and grants light armor proficiency plus one skill of the player's choice:

```json
{
  "requires": { "abilities": ["dex", "wis"], "mode": "any", "score": 13 },
  "gains": {
    "armor": ["light"],
    "weapons": [],
    "skills": { "count": 1, "from": "any" },
    "tools": null
  }
}
```

Use `all` when every listed ability must reach 13. Armor ids are `light`, `medium` and `shield`; the weapon id is `martial`. For skills, use `null` for no grant, or replace `"any"` with an array of skill ids to limit the choice. For tools, use `null` or an object with `grant` (an array of tool ids), `choice` (`category` and `count`), or both. Without `meta.multiclass`, a custom class falls back to its primary abilities and offers no multiclass proficiencies.

## Level up on the sheet

On an editable sheet, open **Level Up** from the Character tab. The helper adds one character level, up to 20. Pick fixed or rolled HP. Review the features, subclass or ability score choices, and spell slot changes offered for the new class level before applying. The helper shows changes to cantrip and prepared spell counts but leaves the choice of spells to you. If it cannot find class data, it can still increase your level and HP. Use **Undo** after applying to reverse the level-up without overwriting later changes to fields.

Choose an existing class to advance it, or choose **Add Class** to start another class at level 1. The helper checks ability requirements for the new class and your existing classes, then offers the new class's multiclass proficiencies. Features and subclass choices follow the chosen class's level, not your total level. The helper can combine regular spell slots when it has the needed progression data; Pact Magic slots stay separate. It leaves a second Extra Attack unchecked and does not replace an existing Unarmored Defense automatically.

## Formats and where they load

Only D&D 2024 (`dnd5e-2024`) reads content packs today.

| Format | What it is | Where it loads |
| --- | --- | --- |
| `skald/pack/v1` | The SDK format this page describes. Any author can write it: no build pins, no fixed list of books, and homebrew is valid. | skald.tw, the `pack` command and the previewer in this repository. |
| `skald/content-pack/v2` | The format Skald's own pack builder writes. | skald.tw. |

skald.tw accepts both formats through Google Drive links.

The files:

| Path | Contents |
| --- | --- |
| `systems/dnd5e/data/dnd5e-2024/schemas/pack.v1.schema.json` | The JSON Schema of `skald/pack/v1`. |
| `systems/dnd5e/data/dnd5e-2024/schemas/game-items.schema.json` | Character creation options, which the pack schema references. |
| `systems/dnd5e/data/dnd5e-2024/schemas/README.md` | How the formats differ, overlays and limits. |
| `systems/dnd5e/content-pack/open/` | The SDK format's check, seal and `pack` command. |
| `systems/dnd5e/content-pack/open/example/lantern-table.pack.json` | A complete example pack. |
| `systems/dnd5e/data/dnd5e-2024/corpus/en/` | Every built-in entry, keyed by its ref. |

## Write a pack

Start from a copy of the example pack, and keep your file outside your clone of this repository.
The steps below follow the example: one new feat and one overlay.

### 1. Choose ids

Every entry has a `kind` and an `id`, and its ref is `kind:id`, for example `feat:lantern-watcher`.
Ids use lowercase letters, digits, `-` and `/`.

- A new entry needs a ref that no built-in entry has. Look up the built-in refs in `corpus/en/*.json`.
- To change the wording of a built-in entry, do not add an entry with its name: write an overlay on its ref (step 3).

### 2. Write the entries

`payload.entries` is a list of entries:

```json
{
  "kind": "feat",
  "id": "lantern-watcher",
  "name": "Lantern Watcher",
  "source": "homebrew",
  "entries": [
    "You have kept watch through many long nights.",
    {
      "type": "entries",
      "name": "Steady Light",
      "entries": ["While you hold a lit lantern, you have Advantage on Wisdom (Perception) checks made at night."]
    }
  ],
  "meta": { "category": "general", "grants": {}, "repeatable": false }
}
```

- `kind`, `id`, `name` and `entries` are required.
- `entries` holds paragraphs and blocks, with the same block types and inline tags as the built-in text.
- `meta` holds the kind's fields; take the field names from a built-in entry of the same kind in `corpus/en/`. When you copy a built-in entry, keep `kind`, `id`, `name`, `entries`, `meta` and `lore`, and remove the other fields.
- `source` is optional: any short label of letters, digits, `.`, `_` and `-`, such as `homebrew`. It is for your own records; Skald does not show it.
- `ref` is optional; when you give it, it must be `kind:id`.

### 3. Add overlays

`payload.overlays` maps a built-in ref to other wording of that entry.
Where the pack is loaded, the reference shows this wording, marked as the pack's, with a switch back to the built-in text.

```json
{
  "spell:light": {
    "en": { "entries": ["At our table, the light this spell makes is the warm yellow of a lantern flame. Otherwise the spell works as written."] },
    "zhTW": { "entries": ["在我們這桌，這道法術發出的光是提燈火焰那種溫暖的黃光；其餘照原本的規則運作。"] }
  }
}
```

- `en` needs at least one of `name`, `entries`, `entriesHigherLevel`, `material`, `meta` or `lore`.
- An overlay never adds an entry, and it never reaches a character's sheet.
- Leave out `overlays` when the pack has none.

### 4. Add Traditional Chinese text

`payload.zhTW` maps the ref of a pack entry to its zh-TW `name` and `entries`.
An entry without a zh-TW layer shows its English text in the zh-TW interface.
An overlay carries its own zh-TW layer in `zhTW`; a `null` block there means "use the English block".

### 5. Add character creation options

`payload.wizard` lists options for the character creation wizard, by list name (`feats`, `spells`, `backgrounds` and so on); give only the lists you use.
Each option follows the matching definition in `game-items.schema.json`, has `"origin": "pack"`, and points with `ref` to an entry of the same pack.
An option without its pack entry, or one that repeats a built-in option, is dropped.

### 6. Fill in the manifest

`manifest` describes the file:

| Field | Value |
| --- | --- |
| `systemId` | `"dnd5e-2024"` |
| `packId` | Your pack's id, for example `"lantern-table"`. Keep it the same across versions. |
| `packVersion` | Any version label, for example `"1.0.0"`. Change it with every release. |
| `name` | The pack's name, shown wherever the pack is listed. |
| `notice` | Who wrote the pack and on what terms. |
| `payloadSha256` | The checksum of `payload`; `seal` writes it (step 7). |
| `requiresBuiltin` | Optional: the checksum of the built-in data the pack was checked against; `seal --pin` writes it. |
| `generatedAt`, `locales` | Optional: when you built the file (ISO date-time), and its languages (`"en"`, `"zh-TW"`). |

The file's top level is `{ "$schema": "skald/pack/v1", "manifest": {…}, "payload": {…} }`.

### 7. Seal and check the file

Run these from the root of your clone with [Bun](https://bun.sh):

```sh
bun run pack seal ../my-pack.json      # writes payloadSha256, then checks the file
bun run pack check ../my-pack.json     # checks it again without changing it
```

`payloadSha256` is the SHA-256 of `payload` as canonical JSON (object keys sorted, no spaces, one trailing newline).
Seal the file again after every change to `payload`; a file whose checksum does not match is refused.

`seal --pin` also writes `requiresBuiltin`, the same kind of checksum over the sorted list of built-in refs.
When the built-in data changes later, the check warns that the pack was built for other data, and still loads it.
Without `requiresBuiltin`, the pack is checked against the current built-in data and never warns.

`check` prints what loads and what is dropped, and exits with 0 when the pack loads, 1 when it is refused, and 2 on a usage or file error.
`bun run pack schema` prints the format's JSON Schema, for any draft-07 validator.

### 8. Preview it

Start the previewer (`bun run dev`), open the D&D 2024 sheet, and choose **Load a pack file**.
The previewer runs the same check and lists what each pack supplies and drops.
The pack stays in that browser tab's memory only: nothing is stored or sent, and a reload clears it.
Its feats, spells and other entries appear in the sheet's compendium and reference, and an overlay shows over the built-in entry it names.

## On skald.tw

These rules hold for packs that skald.tw loads:

- The pack panel is on the D&D 2024 system page (`skald.tw/en/sheets/dnd5e-2024`). You paste a link to the file in your own Google Drive, shared as "Anyone with the link".
- Skald's server fetches the file from Google Drive for your browser, because Drive does not let a browser download it directly; the server does not store or log the file. Your browser checks the file and keeps a copy on this device. With an account, Skald keeps your list of links so your other devices can download the packs.
- When two packs have the same entry, the pack higher in the list supplies it. A built-in entry always wins over a pack entry with the same ref or the same name.
- When you pick a pack option for a character, the character keeps that option's text, so the sheet still reads without the pack. Removing a pack later does not change existing characters.
- A character's copy at a table keeps the names of pack options but not their text. Other people at the table see the text only if their own device has a pack with that entry.
- Overlays stay in the reference and never enter a character.

## Errors and warnings

A pack that fails one of these checks does not load:

| Message | Cause |
| --- | --- |
| The file is over 12 MB. | The file is larger than the limit. |
| The file is not a JSON object. | The file is not JSON, or its top level is not an object. |
| Not a valid content pack (…) | The file breaks the schema, or an entry's `ref` is not `kind:id`. The message names the first failing path. |
| This file isn't a D&D 2024 content pack in the skald/pack/v1 format. | `$schema` or `manifest.systemId` is wrong. |
| … needs a newer version … | The file is in a later version of the format. |
| The checksum doesn't match … | `payloadSha256` does not match `payload`. Seal the file again. |

A pack that loads can still lose parts of itself, which the check reports:

- an entry whose ref equals a built-in ref, or repeats a ref in the same pack, is dropped;
- an entry with the same kind and English name as a built-in entry is dropped, with its zh-TW layer and its options; write an overlay instead (chapters, tables, rules and class or subclass features are compared by ref only, since their names repeat on purpose);
- an overlay whose key is not a built-in ref is dropped;
- a `requiresBuiltin` that does not match gives a warning only.

## Limits

- 12 MB per file, 5,000 entries, 5,000 overlays, 20,000 characters per string, blocks nested at most 12 deep.
- On skald.tw: 48 MB of packs per system on one device, and 200 KB of pack text copied into one character.

## Versions

- To release a new version of your pack, change the file, raise `packVersion`, and seal it again.
- `skald/pack/v1` is the current SDK format. A change that a v1 check would refuse or misread gets a new major version; a later major needs a newer check.

## Check the terms of what you use

Before you put text in a pack, read the publisher's licence and fan content policy, and keep within them, including when you share the file with your group.
This page describes how Skald handles packs; it is not legal advice.
