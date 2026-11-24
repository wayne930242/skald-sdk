# D&D 2024 schemas

| File | Contract |
|---|---|
| `game-items.schema.json` | Wizard items, built-in and pack. |
| `content-pack.schema.json` | Pack format `skald/content-pack/v1`. Frozen. |
| `content-pack.v2.schema.json` | Pack format `skald/content-pack/v2`. Current. |

The validator enforces more than the schemas can: the 12 MB file limit, `ref` = `kind:id`, the payload hash, and the rule that a pack ref equal to a built-in ref is dropped.

## Versions

- v1 is frozen.
  A test pins its hash. The translation pin rename below is the only exception.
- A change that a previous validator would reject, or that a previous reader would misread, needs a new major version and a new file.
  Every object is `additionalProperties: false`, so even a new optional field needs a new major version.
- Both schemas use `manifest.sources.translation` for the translation revision. The importer also reads the previous field name in either major; older apps need an update to read newly generated packs.
- The pipeline writes only the current major.
  The app reads the current and the previous major.
- The app reads v1 by normalizing it to `overlays: {}`.
- v3 or later is `unsupportedVersion`.
- An app built before v2 rejects a v2 pack as `wrongSystem`.
  That is acceptable because no v2 build has shipped.
- IndexedDB stays at version 1, and cached records are upgraded in memory when read.

## v2: what changed from v1

`content-pack.v2.schema.json` is generated from the v1 file by `scripts/dnd5e-2024/lib/pack-schema.ts`, so the parts they share stay identical.
Regenerate it with:

```sh
bun run scripts/dnd5e-2024/lib/pack-schema.ts
```

The test in `tests/unit/systems/dnd5e-2024/pack-schema.test.ts` fails when the committed file is not the generator output.

- `$schema` is `skald/content-pack/v2`.
- Kinds gain `creature`, `table` and `chapter`.
  `manifest.counts` requires all three.
  Chapter ids are `xphb/<chapter>/<section>`.
- An entry `source` is `XPHB`, `XMM` or `XDMG`; `srd52` stays `false`.
- A pack entry may carry `lore`, an array of blocks, for example XMM monster lore.
  Habitat and treasure are `meta` fields.
- `payload.zhTW[<packRef>]` gains `meta` (translated text fields of `meta`) and `lore`.
  `name` and `entries` stay required.
- `payload.overlays` is required, and may be `{}`.
- `manifest.packId` is any id matching `^[a-z0-9][a-z0-9/-]{0,199}$` (`PACK_ID_PATTERN`), not the v1 constant `xphb-extras`, so a user can keep several packs per system (B-025).
  This is the one loosening made after v2 was first published: v1 stays frozen, the pipeline still writes `xphb-extras`, and an app built before B-025 reports a pack with another packId as `schema`; no such pack existed before.

## Overlays

`payload.overlays` maps a built-in ref to its original wording.
A loaded pack shows that wording over the SRD text, and the reference view keeps a toggle back to the SRD version.
Overlays never reach character rows.

```jsonc
{
  "<builtinRef>": {
    "source": "XPHB" | "XMM" | "XDMG",
    "en":   { "name?": "", "entries?": [], "entriesHigherLevel?": [], "material?": "", "meta?": {}, "lore?": [] },
    "zhTW": { "name?": "", "entries?": [], "entriesHigherLevel?": [], "material?": "", "meta?": {}, "lore?": [] }
  }
}
```

- Keys use the ref pattern of every v2 kind, and there are at most 5,000.
  A key that is not a built-in ref is dropped by the validator.
- `source` names the original book:
  - `XPHB` for built-in entries from the Player's Handbook, and class, species and background lore;
  - `XMM` for built-in creatures, both wording and monster lore;
  - `XDMG` for built-in XDMG items (the magic items and poisons).
  The schema accepts any of the three on any key; the pipeline (`build-pack.ts`, `assertOverlays`) pairs `XMM` with `creature:` keys and `XDMG` with `item:` keys, and the source must be the book of the entry's record.
- `en` is required and has at least one field.
  A lore-only overlay has just `lore`.
  Its blocks may not be `null`.
- `meta` holds stat block header fields that differ from the SRD `meta`, and the monster's `habitat` and `treasure` (lists of display values) (XMM creatures).
  The stat block reads overlay `meta` over the SRD `meta` while the overlay is shown.
- `zhTW` is optional.
  `entries`, `entriesHigherLevel` and `lore` are sparse: a `null` block, or a `null` `meta` value, means "use the English one".
- The pipeline writes no overlays for chapters.

## Limits

Unchanged from v1: 12 MB per file, 5,000 entries, 20,000 characters per string, entry trees 12 deep.
Overlay text uses the same string and depth limits, and `overlays` has at most 5,000 keys.
