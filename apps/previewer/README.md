# Sheet previewer

A local Next.js app that renders a system's character sheet from this repository's source, so you can
see a change to the SDK or a system before you open a pull request. It has no backend, no account
and no environment variables. Characters stay in your browser (localStorage).

## Run it

From the repository root:

```sh
bun install --frozen-lockfile
bun run dev          # http://localhost:3100, rebuilds as you edit
```

Or a production build: `bun run build`, then `bun run --filter=@skald/previewer start`.

## What you can check

Open `/en` or `/zh-TW` and pick a system and a mode, or go straight to
`/<locale>/<system>?mode=play|edit|print`:

| System | Slug | Locales |
| --- | --- | --- |
| Fate Condensed | `fate-condensed` | en, zh-TW |
| D&D 2024 (SRD 5.2.1) | `dnd5e-2024` | en; zh-TW shows English where the zh-TW text is not in this repository yet, with a notice on the sheet |

- **Play** and **Edit** are the sheet's two modes; edits save to localStorage at once and survive a reload.
- **Print** opens the print preview; the browser's print dialog prints it. Closing it returns to play.
- Rolls you make on the sheet land in the roll log beside it. Nothing is sent anywhere.
- **Character**: load the sample character (`characters/<system>.json`) or a blank sheet, import a
  character JSON file, or export the one on screen.

These features need the Skald service and show as unavailable here: table sessions, portrait upload,
PDF download, Excel formulas and content packs.

## Manual check before a pull request

For each system (`fate-condensed`, `dnd5e-2024`), each locale (`en`, `zh-TW`) and each mode
(`play`, `edit`, `print`):

1. Open `http://localhost:3100/<locale>/<system>?mode=<mode>` and wait for the sheet.
2. Play: tap a skill or an ability; the roll appears in the roll log.
3. Edit: change a value, reload the page; the value is still there.
4. Print: the preview shows the character's pages; A4 and Letter switch the paper.
5. D&D in zh-TW: the notice above the sheet says some text shows in English.
6. The browser console shows no errors.
