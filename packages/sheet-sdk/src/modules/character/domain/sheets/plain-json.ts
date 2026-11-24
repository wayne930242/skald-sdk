// modules/character/domain/sheets/plain-json.ts
//
// 寫進角色資料前，把值變成「JSON 存起來再讀回來也一樣」的樣子。
//
// 為什麼要：角色資料經 Yjs 寫入，之後存進 JSON 欄位，undefined 的鍵會在那裡消失。
// 伺服器合併時拿「存下來的 JSON」跟「Yjs 狀態」比對，發現鍵數不同，就會用自己的
// 用戶端 ID 把整個欄位再寫一次；這次重寫可能蓋掉玩家緊接著的新修改（例如剛勾上的
// 「可成長」立刻撤銷，撤銷就消失）。寫入時先去掉 undefined 的鍵，兩邊就一致，沒有重寫。
export function toPlainJson<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}
