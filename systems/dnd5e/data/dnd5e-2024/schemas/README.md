# D&D 2024 schemas

| File | Contract |
|---|---|
| `game-items.schema.json` | Wizard items, built-in and pack. |
| `pack.v1.schema.json` | The SDK pack format `skald/pack/v1`, for anyone writing a content pack. |
| `content-pack.schema.json` | The app's pack format `skald/content-pack/v1`. Frozen. |
| `content-pack.v2.schema.json` | The app's pack format `skald/content-pack/v2`. Current. |

The validators enforce more than the schemas can: the 12 MB file limit, `ref` = `kind:id`, the payload checksum, and the rules that drop a pack entry whose ref or English name equals a built-in entry's.

## The SDK format

`pack.v1.schema.json` is the documented format for packs written outside Skald; [docs/content-packs.md](../../../../../docs/content-packs.md) explains how to write, check and seal one.
It is built from `content-pack.v2.schema.json` by `content-pack/open/schema.ts`, so entry kinds, text blocks, `meta`, zh-TW layers, overlays, wizard items and limits are the same.
A test fails when the committed file differs from the builder's output; `bun run pack schema` prints the current one.

It differs from the app's format in these ways:

- `$schema` is `skald/pack/v1`.
- The manifest has a `name`, and needs no build pins or per-kind counts; `requiresBuiltin`, `generatedAt` and `locales` are optional.
- An entry needs only `kind`, `id`, `name` and `entries`; `ref` (always `kind:id`), `meta` and `lore` are optional, and `source` is any short label such as `homebrew`.
- `zhTW`, `wizard` (and each of its lists) and `overlays` are optional.
- An overlay has `en` and an optional `zhTW`, and no `source`: the reference shows it as the pack's own wording.

## Versions of the app's format

- v1 is frozen.
- A change that a previous validator would reject, or that a previous reader would misread, needs a new major version and a new file.
  Every object is `additionalProperties: false`, so even a new optional field needs a new major version.
- The app reads the current and the previous major, and reads v1 by normalizing it to `overlays: {}`.
- v3 or later is `unsupportedVersion`.
- An app built before v2 rejects a v2 pack as `wrongSystem`.
- IndexedDB stays at version 1, and cached records are upgraded in memory when read.

## v2: what changed from v1

- `$schema` is `skald/content-pack/v2`.
- Kinds gain `creature`, `table` and `chapter`.
  `manifest.counts` requires all three.
- An entry `source` is one of the schema's book codes; `srd52` stays `false`.
- A pack entry may carry `lore`, an array of blocks, for example monster lore.
  Habitat and treasure are `meta` fields.
- `payload.zhTW[<packRef>]` gains `meta` (translated text fields of `meta`) and `lore`.
  `name` and `entries` stay required.
- `payload.overlays` is required, and may be `{}`.
- `manifest.packId` is any id matching `^[a-z0-9][a-z0-9/-]{0,199}$` (`PACK_ID_PATTERN`), not the single id v1 allows, so a user can keep several packs per system (B-025).
  This is the one loosening made after v2 was first published: v1 stays frozen, and an app built before B-025 reports a pack with another packId as `schema`.

## Overlays

`payload.overlays` maps a built-in ref to other wording of that entry.
A loaded pack shows that wording over the SRD text, and the reference view keeps a toggle back to the SRD version.
Overlays never reach character rows.

```jsonc
{
  "<builtinRef>": {
    "source": "<book code>", // the app's format only
    "en":   { "name?": "", "entries?": [], "entriesHigherLevel?": [], "material?": "", "meta?": {}, "lore?": [] },
    "zhTW": { "name?": "", "entries?": [], "entriesHigherLevel?": [], "material?": "", "meta?": {}, "lore?": [] }
  }
}
```

- Keys use the ref pattern of every v2 kind, and there are at most 5,000.
  A key that is not a built-in ref is dropped by the validator.
- In the app's format, `source` names the book the wording comes from, and the reference shows it.
- `en` is required and has at least one field.
  A lore-only overlay has just `lore`.
  Its blocks may not be `null`.
- `meta` holds stat block header fields that differ from the SRD `meta`, and a creature's `habitat` and `treasure` (lists of display values).
  The stat block reads overlay `meta` over the SRD `meta` while the overlay is shown.
- `zhTW` is optional.
  `entries`, `entriesHigherLevel` and `lore` are sparse: a `null` block, or a `null` `meta` value, means "use the English one".

## Limits

The same in every format: 12 MB per file, 5,000 entries, 20,000 characters per string, entry trees 12 deep.
Overlay text uses the same string and depth limits, and `overlays` has at most 5,000 keys.
