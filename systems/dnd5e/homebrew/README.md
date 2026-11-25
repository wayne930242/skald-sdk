# D&D homebrew editor

`HomebrewWorkspace` edits a player's named content packs. Mount it inside a host that supplies `dndHomebrewStorePort` (`store-port.ts`). The host owns authentication and persistence; on Skald, only signed-in, non-guest accounts can save packs.

The form codecs in `domain/forms/` map feats, spells, magic items, species and backgrounds to pack entries. `domain/subclass/` builds a subclass from a parent class (a built-in or homebrew class with the standard subclass-level class features), features at the parent's subclass levels, optional always-prepared subclass spells (at levels set by the caster type), and, for Fighter and Rogue, optional third-caster spellcasting. Third-caster slots are derived from the SRD 5.2.1 multiclass spellcaster table at row ⌈class level / 3⌉, slot levels 1 to 4, and the generated table says so. A subclass is stored as ordinary pack entries: one `subclass` entry, a generated opening feature at the first subclass level, generated spells and spellcasting features when present, and one `subclassFeature` entry per authored feature. Each of these is one row and counts toward the entry limit. A save writes only the rows that changed, so editing one feature offers an update only on sheets that copied that feature.

The class editor starts from a built-in class. It lets the author change starting proficiencies and equipment, choose spellcasting and subclass progression, and add features and columns to the progression table. `domain/class/` generates one `class` row and separate `classFeature` rows. Imported classes that the form cannot round-trip open read-only.

The class and subclass editors call `saveItems` with only changed rows and deleted keys. A batch runs in order and stops at the first failure; completed operations are not rolled back. The port reports how many operations finished so the editor can report a partial save. The host refreshes the device index once after the batch, including on partial failure.

The editor imports a `skald/pack/v1` JSON file directly and exports a sealed v1 file. One account can keep 20 packs, with at most 300 entries and 1 MB across them.

A sheet keeps the text it copied from an entry, including in the character copy shared with members of a table. A later edit to the pack offers a manual update on the sheet; it does not silently change a character in play.
