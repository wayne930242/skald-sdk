# D&D homebrew editor

`HomebrewWorkspace` edits a player's named content packs. Mount it inside a host that supplies `dndHomebrewStorePort` (`store-port.ts`). The host owns authentication and persistence; on Skald, only signed-in, non-guest accounts can save packs.

The form codecs in `domain/forms/` map feats, spells, magic items, species and backgrounds to pack entries. The editor imports a `skald/pack/v1` JSON file directly and exports a sealed v1 file. One account can keep 20 packs, with at most 300 entries and 1 MB across them.

A sheet keeps the text it copied from an entry, including in the character copy shared with members of a table. A later edit to the pack offers a manual update on the sheet; it does not silently change a character in play.
