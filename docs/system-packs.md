# 第一次預覽系統擴充包

[提燈人](../packages/sheet-sdk/src/scripts/system-pack/example/)是一個可直接試玩的範例。請在 SDK 根目錄執行：

```sh
bun run system-pack build packages/sheet-sdk/src/scripts/system-pack/example --out lantern.json
bun run system-pack check lantern.json
bun run dev
```

開啟 <http://localhost:3100/zh-TW/pack>，選擇 `lantern.json`。在編輯模式改角色名，切回遊玩模式擲一次力量，再查看擲骰紀錄。打開規則速查，從「基本規則」點進「出身」，或搜尋「燈油」；列印預覽則可查看改名後的角色卡。重新整理會清除這次載入的包和修改。

若檔案無法載入，頁面會列出問題代碼、JSON 指標與原因。例如 `/manifest/version` 指的是 `manifest` 裡的 `version`。修改來源檔後重新打包，不要直接改產生的 `lantern.json`，否則內容會與雜湊不符。

離線預覽不執行創角精靈。請在網站匯入後查看匯入報告，再用擁有者帳號試跑創角。要編寫自己的系統，見[來源檔與格式](system-packs.zh-TW.md)。
