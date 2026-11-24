# Contributing

Thanks for helping. This repository holds the Skald sheet SDK and two open systems: Fate Condensed
and D&D 2024 (SRD 5.2.1). The maintainer reads every diff before merging.

## What we accept

- Bug fixes, tests, docs, and accessibility fixes.
- Improvements to the sheet SDK, the previewer, and the Fate Condensed and D&D 2024 SRD systems.
- New systems whose rules text and data you wrote yourself, or whose licence allows commercial use and relicensing with this project (for example CC-BY, CC0, MIT).

## What we never accept

Provenance is the one hard rule. Do not contribute:

- text, tables, or art from commercial publisher books;
- anything from Call of Cthulhu / Chaosium, Avatar Legends, or Brindlewood Bay;
- translations or data under non-commercial or share-alike licences (such as CC BY-NC-SA), translations
  you did not write yourself, or any unlicensed publisher text.

State the source and licence of anything not written by you in the pull request. D&D content stays
within SRD 5.2.1 (CC-BY-4.0); Fate content within the Fate SRD (CC-BY-3.0). Give the attribution for new third-party
material in the pull request; the maintainer adds it to `NOTICE`. CC-BY data keeps its attribution.

## Contributor licence

Sign the CLA (`CLA.md`) when the cla-assistant.io bot asks on your first pull request; its
`license/cla` check stays red until you do. You keep
your copyright; the licence lets the maintainer use your work in this repository and in the
private Skald service.

## Workflow

1. Open an issue first for anything larger than a small fix.
2. Fork, branch, and keep each pull request to one change.
3. Run `bun install --frozen-lockfile`, then `bun run ci` (typecheck, lint, tests and the previewer build) before you push, and
   check the sheets you changed in the previewer (`bun run dev`, see `apps/previewer/README.md`).
4. Fill in the pull request template, including provenance.

How your PR lands: the maintainer imports accepted pull requests into the private source
repository, and they reappear in this repository's history under your author line. The pull request
is then closed with "Landed in <commit>"; a closed PR is not a rejection. Changes to dependencies,
lockfiles, configuration, scripts or CI, and binary files, need prior agreement in an issue or the
maintainer refuses them.

Rules for files:

- Generated data and overlay files (including `NOTICE`) are read-only, and CI fails a pull request
  that edits them: `.github/protected-paths.json` lists them, and
  `bun scripts/check-protected-paths.ts origin/main` runs the same check locally. Report data errors
  in an issue, and give attributions for new material in the pull request; the maintainer updates
  `NOTICE`.
- User-facing strings go through next-intl messages in both `zh-TW` and `en`. Chinese text is
  Traditional Chinese, never Simplified.
- Regenerating the Fate rules corpus needs `--zh <pinned MDX blob>` from outside this repository;
  ask in your issue if you need it.
- Code for the SDK must not import Supabase or read environment variables. Reach the host through
  the ports in `modules/systems`.

## Thank-you for contributions

Accepted contributions may earn a discretionary membership thank-you from the maintainer: usually 30
days, at most 90 for large work. It is not payment and is not guaranteed. To opt in, add your Skald
ID (profile page, 投稿 tab) to the pull request. A pull request is public: adding your Skald ID
links your GitHub and Skald accounts publicly. Leaving it blank is fine.

## Conduct and security

See `CODE_OF_CONDUCT.md`. Report security problems privately as described in `SECURITY.md`, not in a public issue.

---

## 貢獻指南（繁體中文）

感謝你願意幫忙。本儲存庫包含 Skald 角色卡 SDK，以及兩套開放系統：Fate Condensed 與 D&D 2024
（SRD 5.2.1）。維護者會逐一閱讀每個 diff 後才合併。

**來源是唯一的硬性規則。** 請勿貢獻：商業出版品的文字、表格或美術；Call of Cthulhu／Chaosium、
Avatar Legends、Brindlewood Bay 的任何內容；非商業或相同方式分享授權（例如 CC BY-NC-SA）的翻譯或資料、
非你自己撰寫的翻譯，以及任何未經授權的出版商文字。非你自己撰寫的內容，請在 PR 中註明來源與授權。
D&D 內容限於 SRD 5.2.1（CC-BY-4.0），Fate 內容限於 Fate SRD（CC-BY-3.0）；其他來源須允許商業使用並可與本專案一併再授權（如 CC-BY、CC0、MIT）。

首次提交 PR 時，請依 cla-assistant.io 機器人的指示簽署 CLA（`CLA.md`）。你保有著作權。

流程：大改動先開 issue；一個 PR 只做一件事；推送前先跑 `bun run ci`（型別檢查、lint、測試與預覽器建置），並在預覽器（`bun run dev`，見 `apps/previewer/README.md`）看過改到的角色卡；填寫 PR 範本。
自動產生與覆蓋層檔案（含 `NOTICE`）為唯讀，CI 會擋下修改它們的 PR（清單在 `.github/protected-paths.json`，本機可跑 `bun scripts/check-protected-paths.ts origin/main`）；資料錯誤請開 issue，新素材的來源標示請寫在 PR，由維護者更新 `NOTICE`。

PR 的處理方式：維護者會把接受的 PR 匯入私有來源儲存庫，再以你的作者署名出現在本儲存庫歷史，PR 會以「Landed in <commit>」關閉，關閉不代表拒絕。變更相依套件、lockfile、設定、腳本、CI 或二進位檔，需先在 issue 取得同意。使用者可見字串須同時提供 zh-TW 與 en，中文一律
使用繁體。

被接受後，維護者可能酌情給予會員感謝（通常 30 天，大型貢獻最多 90 天），不是報酬，也不保證。
若要參加，請在 PR 填入你的 Skald ID（個人頁「投稿」分頁），不填也沒關係。注意 PR 是公開的，填入 Skald ID 會公開連結你的 GitHub 與 Skald 帳號。

安全問題請依 `SECURITY.md` 私下回報。
