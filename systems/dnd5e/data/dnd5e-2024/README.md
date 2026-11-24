# D&D 5e (2024) built-in data

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd.
The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

Traditional Chinese translation by Skald (machine-assisted); structured data adapted from 5etools (5etools-mirror-3/5etools-src).

## Regeneration

Run the following from `apps/web`:

```bash
bun run dnd2024:fetch
bun run dnd2024:data
```

If the pinned local workbook is outside this checkout, set `DND2024_BOSS_WORKBOOK` to its path before fetching.
The fetch command checks every input against `pipeline.lock.json`.
Use `--update-lock` only for a reviewed pin or input change.
The data command works offline, checks the English input hashes again, and generates `game/`, `corpus/en/`, `import/spell-index.json`, `coverage/en.json`, and the English name messages.
Only `game/` is for wizard data loading; `corpus/` is for lazy reference loading, not seeding or eager imports.
`dnd2024:messages` rebuilds the catalogs from the disjoint parts in `messages/src/`.

`bun run dnd2024:pack` is separate and offline.
Its output is private, written outside `apps/` to `content-packs/dnd5e-2024/dist/`.
That directory is committed only while this repository is private and is excluded from every deploy path; its README covers the workflow.
Never bundle or serve the pack from the app.
