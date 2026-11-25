# 系統擴充包的來源檔

`skald/system-pack/v1` 描述一套完整的遊戲系統。若只要替內建系統增加條目，請改用[內容包](content-packs.zh-TW.md)；兩種檔案不能混用。

從[提燈人的來源目錄](../packages/sheet-sdk/src/scripts/system-pack/example/)複製一份，再逐項修改：

| 來源 | 用途 |
| --- | --- |
| `system.json` | 設定名稱、版本、分類與內容語言。`id` 會成為 `manifest.packId`；更新同一套包時保留這個值。 |
| `schema.json`、`template.json`、`default-data.json` | 依序定義角色欄位、排列方式與初始值。遊玩、編輯與列印共用這份範本。 |
| `dsl-roll-rules.json`、`roll-macros.json` | 選用。定義擲骰規則與巨集。 |
| `game/*.json` | 可供角色卡或精靈讀取的遊戲資料。 |
| `rules/*.md` | 規則全文。打包時會把標題轉成章節，可用 `#basics` 這類連結指向章節識別碼。 |
| `entries/*.md`、`entries/*.json` | 每個檔案是一組條目，例如行動或裝備。可用 `entry:moves/brace` 指向 `moves` 裡的 `brace`。 |
| `wizard.json`、`field-migration.json` | 選用。前者定義創角步驟；後者描述更新範本時的欄位遷移。 |

一套包只用一種內容語言；預覽器切換語言不會翻譯規則。包內不能放程式碼、HTML、圖片或 CSS `url()`。圖示可使用內建 Game-Icons，規則內文可連到 HTTPS 網址。

用 `bun run system-pack build <來源目錄> --out my-game.json` 產生含雜湊的 JSON 檔，再用 `bun run system-pack check my-game.json` 檢查。檢查通過表示檔案格式、雜湊與包內連結通過驗證，不表示已通過網站的匯入檢查。精靈的結構可離線檢查，步驟是否能讀到所需資料則要上站驗證；精靈介面也只能在網站試跑。

[在本機試玩範例](system-packs.md)
