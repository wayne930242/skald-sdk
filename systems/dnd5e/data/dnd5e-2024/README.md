# D&D 5e (2024) built-in data

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd.
The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

Traditional Chinese translation by Skald (machine-assisted).
The structure and markup of the data files are adapted from a third-party project; [NOTICE](../../../../NOTICE) gives its name, source and licence.

## Files

| Path | Contents |
| --- | --- |
| `system.json`, `schema.json`, `template.json`, `default-data.json` | The system's sheet: its configuration, fields, layout and a blank character. |
| `game/` | Character creation data: classes, species, backgrounds, feats, spells, equipment and the rest. |
| `corpus/en/`, `corpus/zh-TW/` | The rules text of every built-in entry, keyed by its ref (`kind:id`), read when a reference view opens. |
| `corpus/index/`, `corpus/parts.json`, `import/`, `coverage/` | Search indexes, the corpus file list, the spell index and the coverage report the data build writes. |
| `messages/` | Interface labels and entry names in `en` and `zh-TW`; `messages/src/` holds the parts the catalogs merge. |
| `economy/` | The item catalog with prices. |
| `dsl-*.json`, `roll-macros.json` | Dice rules and roll macros. |
| `schemas/` | JSON Schemas for character creation items and content packs; see [schemas/README.md](schemas/README.md). |
| `zh-availability.json` | The zh-TW files this repository does not carry yet; each holds the English text. |

These files are generated: report a data error in an issue instead of editing them (see [CONTRIBUTING.md](../../../../CONTRIBUTING.md)).
The built-in content is the SRD 5.2.1. Other content belongs in a content pack, which each player keeps for themselves; see [docs/content-packs.md](../../../../docs/content-packs.md).
