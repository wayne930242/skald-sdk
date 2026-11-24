# Skald SDK

[English](README.md)

[Skald](https://skald.tw) 是桌上角色扮演遊戲（TRPG）的輔助工具，可以管理角色卡、擲骰和開團。
本儲存庫包含 Skald 的角色卡 SDK、Fate Condensed 與 D&D 2024（SRD 5.2.1）兩套遊戲系統，以及本機預覽器。

## 快速開始

請使用 [Bun](https://bun.sh) 1.4.4（CI 使用的版本）和 [Node.js](https://nodejs.org) 24。
在儲存庫根目錄執行：

```sh
bun install
bun run ci
```

`bun run ci` 會檢查型別和程式碼、執行測試，並建置預覽器。
要以開發模式啟動預覽器，請執行：

```sh
bun run dev
```

開啟 [localhost:3100/zh-TW](http://localhost:3100/zh-TW) 或 [localhost:3100/en](http://localhost:3100/en)，選擇遊戲系統。
預覽器有遊玩、編輯與列印三種模式，角色資料的改動會儲存在瀏覽器中。
[預覽器指南](apps/previewer/README.md)列出各模式的網址和送出 PR 前的檢查步驟。

## 畫面

<!-- screenshots: added after selection -->

## 儲存庫結構

| 路徑 | 內容 |
| --- | --- |
| [`packages/`](packages/) | 角色卡 SDK（結構處理工具、渲染器和列印元件）、共用型別、擲骰與公式。 |
| [`systems/`](systems/) | Fate Condensed 和 D&D 2024 的系統外掛與規則資料。 |
| [`apps/previewer/`](apps/previewer/) | 在本機試用角色卡的 Next.js 應用程式。 |
| [`scripts/`](scripts/) | 儲存庫的檢查指令碼，包括受保護路徑檢查。 |

## 新增系統或修改角色卡

- 修改角色卡時，從該系統的 `schema.json` 和 `template.json` 下手。[Fate Condensed 資料](systems/fate/data/fate-condensed/)示範如何定義欄位，再用範本安排版面；欄位與版面的格式見[結構與範本型別][sheet-types]。
- 新增系統時，可以參考 [Fate 外掛](systems/fate/plugin.ts)。依照 [`SystemPlugin` 介面][plugin-contract]實作，讓 `loadBuiltinData` 傳回符合 [`BuiltinLocalSystemData`][builtin-data] 型別的結構、範本與預設角色資料，並在[預覽器的系統登錄檔](apps/previewer/lib/systems.ts)註冊外掛。
- 在預覽器的遊玩、編輯及列印模式中檢查角色卡。
- 要撰寫 D&D 2024 內容包、檢查它並在預覽器載入，見[內容包](docs/content-packs.zh-TW.md)。

## 貢獻方式

提交 PR 前請先讀[貢獻指南](CONTRIBUTING.md)。
較大的改動請先開 issue 討論；PR 若含第三方素材，請註明來源與授權。
首次提交 PR 時，請依 cla-assistant 的提示簽署[貢獻者授權協議（CLA）](CLA.md)。
PR 必須經 [CODEOWNERS 所列的維護者](CODEOWNERS)審查，並通過 CLA、受保護路徑和 CI 檢查（型別、程式碼檢查、測試與預覽器建置）。

## 授權與來源標示

本專案採 [Apache-2.0 授權](LICENSE)，第三方素材沿用各自的授權。
D&D SRD 5.2.1 素材採 CC BY 4.0，Fate SRD 素材採 CC BY 3.0。
Game-Icons.net 圖示採 CC BY 3.0，另有標為 CC0 或公有領域的圖示。
完整來源標示見 [NOTICE](NOTICE)，商標使用條款見 [TRADEMARKS.md](TRADEMARKS.md)。
本儲存庫不能再散布的文字，例如你擁有的書中的內容，應放在每位玩家自己保管的內容包；兩者的界線見[內容包](docs/content-packs.zh-TW.md)。

[sheet-types]: packages/types/src/schema.ts
[plugin-contract]: packages/sheet-sdk/src/modules/systems/domain/system-plugin.ts
[builtin-data]: packages/sheet-sdk/src/modules/systems/domain/builtin-local-system-data.ts
