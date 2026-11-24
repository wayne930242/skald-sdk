# Contributing

Thanks for helping. This repository holds the Skald sheet SDK and two open systems: Fate Condensed
and D&D 2024 (SRD 5.2.1). The maintainer reads every diff before merging.

## What we accept

- Bug fixes, tests, docs, and accessibility fixes.
- Improvements to the sheet SDK, the previewer, and the Fate Condensed and D&D 2024 SRD systems.
- New systems whose rules text and data you wrote yourself, whose licence allows commercial use and relicensing with this project (for example CC-BY, CC0, MIT), or that a publisher's fan or community content policy allows here (below).

## What we never accept

Provenance is the one hard rule. Do not contribute:

- text, tables, or art from commercial publisher books, or anything else a publisher has not allowed
  for this use, by a licence or by a fan or community content policy (below);
- translations or data under non-commercial or share-alike licences (such as CC BY-NC-SA), translations
  you did not write yourself, or any unlicensed publisher text;
- content pack files, or text from one. Text you may use at your own table but not redistribute belongs
  in a content pack that each player keeps for themselves: see [docs/content-packs.md](docs/content-packs.md).

State the source and licence of anything not written by you in the pull request. D&D content comes
from SRD 5.2.1 (CC-BY-4.0) and Fate content from the Fate SRD (CC-BY-3.0), unless a fan or community
content policy covers it as below. Give the attribution for new third-party material in the pull
request; the maintainer adds it to `NOTICE`. CC-BY data keeps its attribution.

## Material under a fan or community content policy

Some publishers let fans share parts of their games under a fan or community content policy. Such
material may become built-in content when the policy allows it to be redistributed in a project like
this one, which means both:

- a free, public, open-source repository that anyone can copy, under Apache-2.0 for its code; and
- the Skald service at skald.tw, where built-in content is free for everyone to read, and which also
  sells memberships.

Many policies allow non-commercial fan works only, or forbid content behind a paywall or in software
others can copy; read the policy with both uses in mind. In the pull request, link the policy, quote
the terms that allow the use, and give the notice it asks for; the maintainer adds the notice to
`NOTICE`. Such material keeps the publisher's terms: it is not relicensed under Apache-2.0, and it
leaves the repository if the publisher withdraws or narrows the policy.

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
- Never commit a content pack file. `bun run ci` runs `bun run check:packs`, which fails on any pack
  file except the documented example.

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

**來源是唯一的硬性規則。** 請勿貢獻：商業出版品的文字、表格或美術，以及其他出版商未以授權或粉絲、社群創作政策允許用於此處的內容；非商業或相同方式分享授權（例如 CC BY-NC-SA）的翻譯或資料、
非你自己撰寫的翻譯，以及任何未經授權的出版商文字；內容包檔案或其中的文字。你可以在自己牌桌上使用、但不能再散布的文字，應放在每位玩家自己保管的內容包，見 [docs/content-packs.zh-TW.md](docs/content-packs.zh-TW.md)。
非你自己撰寫的內容，請在 PR 中註明來源與授權。
D&D 內容來自 SRD 5.2.1（CC-BY-4.0），Fate 內容來自 Fate SRD（CC-BY-3.0），粉絲或社群創作政策涵蓋的素材除外；其他來源須允許商業使用並可與本專案一併再授權（如 CC-BY、CC0、MIT）。

**粉絲或社群創作政策涵蓋的素材：** 政策允許在這類專案中再散布時，可以收錄為內建內容。「這類專案」同時指兩件事：一是免費、公開、任何人都能複製的開放原始碼儲存庫（程式碼採 Apache-2.0）；二是 skald.tw 服務，內建內容任何人都能免費閱讀，而服務同時販售會員方案。
許多政策只允許非商業的粉絲創作，或禁止把內容放在付費牆後或他人可複製的軟體中，請同時對照這兩種用途閱讀政策。請在 PR 中附上政策連結、引用允許此用途的條文，並提供政策要求的標示，由維護者加入 `NOTICE`。這類素材沿用出版商的條件，不會改以 Apache-2.0 再授權；出版商撤回或縮小政策時，素材會從儲存庫移除。

首次提交 PR 時，請依 cla-assistant.io 機器人的指示簽署 CLA（`CLA.md`）。你保有著作權。

流程：大改動先開 issue；一個 PR 只做一件事；推送前先跑 `bun run ci`（型別檢查、lint、測試與預覽器建置），並在預覽器（`bun run dev`，見 `apps/previewer/README.md`）看過改到的角色卡；填寫 PR 範本。
自動產生與覆蓋層檔案（含 `NOTICE`）為唯讀，CI 會擋下修改它們的 PR（清單在 `.github/protected-paths.json`，本機可跑 `bun scripts/check-protected-paths.ts origin/main`）；資料錯誤請開 issue，新素材的來源標示請寫在 PR，由維護者更新 `NOTICE`。不要提交內容包檔案：`bun run ci` 會執行 `bun run check:packs`，除了文件中的範例，只要有內容包檔案就會失敗。

PR 的處理方式：維護者會把接受的 PR 匯入私有來源儲存庫，再以你的作者署名出現在本儲存庫歷史，PR 會以「Landed in <commit>」關閉，關閉不代表拒絕。變更相依套件、lockfile、設定、腳本、CI 或二進位檔，需先在 issue 取得同意。使用者可見字串須同時提供 zh-TW 與 en，中文一律
使用繁體。

被接受後，維護者可能酌情給予會員感謝（通常 30 天，大型貢獻最多 90 天），不是報酬，也不保證。
若要參加，請在 PR 填入你的 Skald ID（個人頁「投稿」分頁），不填也沒關係。注意 PR 是公開的，填入 Skald ID 會公開連結你的 GitHub 與 Skald 帳號。

安全問題請依 `SECURITY.md` 私下回報。
