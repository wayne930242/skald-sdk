# 內容包

[English](content-packs.md)

Skald 把遊戲內容分成兩類：收錄在本儲存庫的內建內容，以及每位玩家自己保管的內容包。
本頁說明兩者的界線、內容包是什麼，以及怎麼用本儲存庫的工具撰寫、檢查與預覽內容包。

## 兩類內容

**內建內容**收錄在本儲存庫，也在 [skald.tw](https://skald.tw) 上提供給所有人。
只有本儲存庫可以再散布的素材才能收錄：

- 以開放授權釋出的系統參考文件，例如 D&D SRD 5.2.1（CC BY 4.0）或 Fate SRD（CC BY 3.0）；
- 貢獻者自己撰寫的文字；
- 其他採用 CC BY、CC0、MIT 等授權的素材；
- 出版商的粉絲或社群創作政策允許在這類專案中再散布的素材。這類專案指的是：免費、公開的開放原始碼儲存庫，其內容任何人都能在 skald.tw 免費閱讀，而 skald.tw 同時販售會員方案。

依粉絲政策收錄的素材沿用出版商的條件，不會改以 Apache-2.0 再授權。
貢獻這類政策涵蓋的內容之前，請先讀過政策，並在 PR 中附上政策連結。
完整規則見 [CONTRIBUTING.md](../CONTRIBUTING.md)。

**內容包**放其餘的內容：你可以在自己的牌桌上使用、但不能再散布的文字，例如你擁有的書中的內容、你對它的筆記，或你們這桌的房規。
內容包是由你保管的檔案，Skald 在你的裝置上讀取它，把它的文字和內建內容並列顯示。

## 內容包是什麼

內容包是單一系統的一個 JSON 檔，可以：

- 加入內建資料沒有的項目，例如法術、專長、物品、生物、表格或規則文字；
- 加入指向這些項目的創角選項；
- 為內建項目換上另一種寫法（覆蓋文字，overlay），並可切回內建文字；
- 在英文之外附上繁體中文。

內容包不是：

- 由 Skald 代管、列出或分享的檔案；
- 本儲存庫的一部分：不要把內容包檔案或其中的文字提交到這裡，測試也一樣。本儲存庫裡除了下面的範例之外，只要還有其他內容包檔案，`bun run ci` 就會失敗；
- 為所有人修改內建項目的方法：覆蓋文字只出現在載入了該內容包的地方。

## 格式與載入的地方

目前只有 D&D 2024（`dnd5e-2024`）會讀取內容包。

| 格式 | 說明 | 在哪裡載入 |
| --- | --- | --- |
| `skald/pack/v1` | 本頁說明的 SDK 格式。任何作者都能撰寫：不需要建置版本 id，沒有固定的書籍清單，自製內容也有效。 | 本儲存庫的 `pack` 指令與預覽器。 |
| `skald/content-pack/v2` | Skald 自己的內容包建置程式所產生的格式。 | skald.tw。 |

skald.tw 目前還不能讀取 `skald/pack/v1`。
我們的計畫是讓 skald.tw 的內容包面板把 `skald/pack/v1` 檔案交給 `pack` 指令所用的同一套檢查（`content-pack/open/validate-open-pack.ts`），並顯示內容包的 `name`；app 自己的格式維持不變。
在那之前，請用這裡的工具檢查與預覽你的內容包。

相關檔案：

| 路徑 | 內容 |
| --- | --- |
| `systems/dnd5e/data/dnd5e-2024/schemas/pack.v1.schema.json` | `skald/pack/v1` 的 JSON Schema。 |
| `systems/dnd5e/data/dnd5e-2024/schemas/game-items.schema.json` | 創角選項的格式，內容包的 schema 會引用它。 |
| `systems/dnd5e/data/dnd5e-2024/schemas/README.md` | 各格式的差異、覆蓋文字與各項上限。 |
| `systems/dnd5e/content-pack/open/` | SDK 格式的檢查、封裝與 `pack` 指令。 |
| `systems/dnd5e/content-pack/open/example/lantern-table.pack.json` | 一個完整的範例內容包。 |
| `systems/dnd5e/data/dnd5e-2024/corpus/en/` | 所有內建項目，以 ref 為鍵。 |

## 撰寫內容包

從範例內容包複製一份開始，檔案請放在本儲存庫的 clone 之外。
以下步驟照著範例走：一項新專長與一則覆蓋文字。

### 1. 決定 id

每個項目都有 `kind` 與 `id`，它的 ref 是 `kind:id`，例如 `feat:lantern-watcher`。
id 只能用小寫字母、數字、`-` 與 `/`。

- 新項目的 ref 不能和任何內建項目相同。內建的 ref 可以在 `corpus/en/*.json` 查到。
- 要改寫內建項目的文字，不要另加一個同名項目，而是在它的 ref 上寫覆蓋文字（第 3 步）。

### 2. 撰寫項目

`payload.entries` 是項目清單：

```json
{
  "kind": "feat",
  "id": "lantern-watcher",
  "name": "Lantern Watcher",
  "source": "homebrew",
  "entries": [
    "You have kept watch through many long nights.",
    {
      "type": "entries",
      "name": "Steady Light",
      "entries": ["While you hold a lit lantern, you have Advantage on Wisdom (Perception) checks made at night."]
    }
  ],
  "meta": { "category": "general", "grants": {}, "repeatable": false }
}
```

- `kind`、`id`、`name` 與 `entries` 是必填欄位。
- `entries` 放段落與區塊，區塊類型與行內標記和內建文字相同。
- `meta` 放該種類的欄位，欄位名稱照 `corpus/en/` 裡同種類的內建項目。複製內建項目時，保留 `kind`、`id`、`name`、`entries`、`meta` 與 `lore`，其他欄位刪掉。
- `source` 可省略：任意簡短標記，由字母、數字、`.`、`_` 與 `-` 組成，例如 `homebrew`。它只供你自己記錄，Skald 不會顯示。
- `ref` 可省略；要填的話必須是 `kind:id`。

### 3. 加入覆蓋文字

`payload.overlays` 把內建項目的 ref 對應到該項目的另一種寫法。
在載入內容包的地方，規則查閱會顯示這段文字並標明出自內容包，同時保留切回內建文字的開關。

```json
{
  "spell:light": {
    "en": { "entries": ["At our table, the light this spell makes is the warm yellow of a lantern flame. Otherwise the spell works as written."] },
    "zhTW": { "entries": ["在我們這桌，這道法術發出的光是提燈火焰那種溫暖的黃光；其餘照原本的規則運作。"] }
  }
}
```

- `en` 至少要有 `name`、`entries`、`entriesHigherLevel`、`material`、`meta`、`lore` 其中一項。
- 覆蓋文字不會新增項目，也不會寫進角色卡。
- 沒有覆蓋文字時省略 `overlays`。

### 4. 加入繁體中文

`payload.zhTW` 把內容包項目的 ref 對應到它的中文 `name` 與 `entries`。
沒有中文的項目，在繁體中文介面會顯示英文。
覆蓋文字的中文寫在它自己的 `zhTW` 裡；其中值為 `null` 的區塊表示沿用英文。

### 5. 加入創角選項

`payload.wizard` 依清單名稱（`feats`、`spells`、`backgrounds` 等）列出創角精靈的選項，只需要寫你用到的清單。
每個選項依 `game-items.schema.json` 中對應的定義撰寫，帶 `"origin": "pack"`，並以 `ref` 指向同一個內容包裡的項目。
找不到對應項目、或與內建選項重複的選項會被捨棄。

### 6. 填寫 manifest

`manifest` 描述這個檔案：

| 欄位 | 值 |
| --- | --- |
| `systemId` | `"dnd5e-2024"` |
| `packId` | 內容包的 id，例如 `"lantern-table"`。各版本維持不變。 |
| `packVersion` | 任意版本標記，例如 `"1.0.0"`。每次發布都要更新。 |
| `name` | 內容包的名稱，列出內容包的地方都會顯示。 |
| `notice` | 作者與使用條件。 |
| `payloadSha256` | `payload` 的校驗碼，由 `seal` 寫入（第 7 步）。 |
| `requiresBuiltin` | 可省略：檢查內容包時所對照的內建資料校驗碼，由 `seal --pin` 寫入。 |
| `generatedAt`、`locales` | 可省略：建立檔案的時間（ISO 日期時間），以及檔案的語言（`"en"`、`"zh-TW"`）。 |

檔案最上層是 `{ "$schema": "skald/pack/v1", "manifest": {…}, "payload": {…} }`。

### 7. 封裝與檢查檔案

在 clone 的根目錄用 [Bun](https://bun.sh) 執行：

```sh
bun run pack seal ../my-pack.json      # 寫入 payloadSha256，接著檢查檔案
bun run pack check ../my-pack.json     # 只檢查，不修改檔案
```

`payloadSha256` 是 `payload` 轉成標準 JSON（物件鍵排序、不含空白、結尾一個換行）後的 SHA-256。
每次改動 `payload` 後都要重新封裝；校驗碼不符的檔案會被拒收。

`seal --pin` 還會寫入 `requiresBuiltin`，也就是排序後的內建 ref 清單的同一種校驗碼。
之後內建資料若有變動，檢查會提示這個內容包是對照其他版本的資料製作的，但仍可載入。
沒有 `requiresBuiltin` 的內容包，一律對照目前的內建資料檢查，不會出現這個提示。

`check` 會列出可以載入與被捨棄的內容。內容包可以載入時結束代碼為 0，被拒收時為 1，用法或檔案錯誤時為 2。
`bun run pack schema` 會印出這個格式的 JSON Schema，可交給任何 draft-07 驗證工具使用。

### 8. 預覽

啟動預覽器（`bun run dev`），打開 D&D 2024 角色卡，選「載入內容包檔案」。
預覽器會做同一套檢查，並列出每個內容包提供與被捨棄的內容。
內容包只留在那個瀏覽器分頁的記憶體裡：不儲存、不傳送，重新整理就會清除。
內容包的專長、法術等項目會出現在角色卡的資料庫與規則查閱中，覆蓋文字則顯示在它對應的內建項目上。

## 在 skald.tw 上

以下規則適用於 skald.tw 載入的內容包（目前是 app 自己的格式）：

- 內容包面板在 D&D 2024 的系統頁（`skald.tw/zh-TW/sheets/dnd5e-2024`）。你貼上的是自己 Google 雲端硬碟裡的檔案連結，共用設為「知道連結的任何人」。
- Google 雲端硬碟不讓瀏覽器直接下載檔案，所以由 Skald 的伺服器代你的瀏覽器取得檔案；伺服器不儲存、也不記錄檔案內容。你的瀏覽器會檢查檔案，並在這台裝置上保留一份副本。登入帳號時，Skald 會保存你的連結清單，讓你的其他裝置也能下載。
- 兩個內容包有相同的項目時，由清單中排在上面的提供。內建項目一律優先於 ref 或名稱相同的內容包項目。
- 為角色選了內容包的選項時，角色會保留該選項的文字，即使沒有內容包也能閱讀角色卡。之後移除內容包，不影響已建立的角色。
- 角色帶進牌桌的副本只保留內容包選項的名稱，不含文字。牌桌上的其他人，只有在自己的裝置也有含該項目的內容包時才看得到文字。
- 覆蓋文字只留在規則查閱中，不會寫進角色。

## 錯誤與警告

沒通過以下檢查的內容包不會載入：

| 訊息 | 原因 |
| --- | --- |
| 檔案超過 12 MB。 | 檔案超過大小上限。 |
| 這個檔案不是 JSON 物件。 | 檔案不是 JSON，或最上層不是物件。 |
| 不是有效的內容包（…） | 檔案不符合 schema，或某個項目的 `ref` 不是 `kind:id`。訊息會指出第一個出錯的路徑。 |
| 這個檔案不是 skald/pack/v1 格式的 D&D 2024 內容包。 | `$schema` 或 `manifest.systemId` 不對。 |
| ……需要較新版…… | 檔案是這個格式較新的版本。 |
| 校驗碼不符…… | `payloadSha256` 與 `payload` 不符，請重新封裝。 |

可以載入的內容包，仍可能有部分內容被捨棄，檢查結果會列出：

- ref 和內建項目相同、或在同一個內容包裡重複的項目會被捨棄；
- 種類與英文名稱都和內建項目相同的項目，連同它的中文與創角選項會被捨棄，請改寫覆蓋文字（章節、表格、規則與職業或子職業特性本來就會重名，只比對 ref）；
- 鍵不是內建 ref 的覆蓋文字會被捨棄；
- `requiresBuiltin` 不相符只會提示，不影響載入。

## 上限

- 每個檔案 12 MB、5,000 個項目、5,000 則覆蓋文字，每個字串 20,000 字元，區塊最多巢狀 12 層。
- 在 skald.tw 上：每個系統在一台裝置上的內容包合計 48 MB，每個角色最多複製 200 KB 的內容包文字。

## 版本

- 發布內容包新版時，修改檔案、更新 `packVersion`，再重新封裝。
- `skald/pack/v1` 是目前的 SDK 格式。舊版檢查會拒收或誤讀的變更會開新的主版本；較新的主版本需要較新的檢查程式。

## 確認你使用內容的條件

把文字放進內容包之前，請先讀出版商的授權與粉絲創作政策，並在範圍內使用，包括和同桌玩家分享檔案時。
本頁說明的是 Skald 如何處理內容包，不是法律意見。
