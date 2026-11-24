// modules/character/ui/renderer/renderers/reference/empty-reference.tsx
//
// 參考類欄位取不到資料時的說明。
//
// 為什麼不回傳 null：作者在模板編輯器裡把欄位拉進來，看到的是一片空白——
// 分不出是「欄位沒生效」還是「這個系統本來就沒有這份資料」。跑團當下同理，
// GM 只會看到該有東西的地方沒有東西。
//
// 沿用 moves-list 既有的做法（見 movesList.selectPlaybookFirst）。
import * as React from "react";

export function EmptyReference({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
