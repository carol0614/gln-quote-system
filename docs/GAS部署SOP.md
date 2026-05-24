# P0：GAS 線索接收部署 SOP

> **目的**：把預算分配表的填寫資料從「Console.log 蒸發」變成「Google Sheet 永久保存 + Email 通知 Carol」。
> **預估時間**：15 分鐘
> **最後更新**：2026-05-24

---

## 為什麼要做這一步

來自《報價系統_策略報告_v2.docx》附錄 C 億萬富翁思維體檢 — 脆弱點 A：

> 客戶填了 9 區塊 30+ 題（包含預算、屋齡、區域、需求文字描述、痛點——極高價值的市場數據），但目前送到 LINE 後就分散到設計師個人對話框。客戶若 6 個月後才回購，好感找不到他、不知道他當初填什麼。**這是把鑽石當沙子用。**

完成 P0 後：
- ✅ 每筆填表自動寫進 Google Sheet（含 30+ 欄位）
- ✅ Carol 每筆收 Email 通知（含關鍵欄位摘要）
- ✅ 客戶 Modal 多一條「📩 您的預算分配 PDF 已寄至 xxx」確認感
- ✅ 半年後可撈出趨勢分析（南部老屋平均預算、最常勾選的屋況加成 ⋯⋯）

---

## Step 1：建 Google Sheet（1 分鐘）

1. 開 [https://sheets.google.com](https://sheets.google.com)
2. 新增空白試算表，命名為 **`GLN_預算分配表_線索`**
3. 從網址抓 **Sheet ID**（格式：`https://docs.google.com/spreadsheets/d/`**`這一段`**`/edit`）
4. 把這個 ID 記下來，下一步要用

---

## Step 2：貼 Apps Script（5 分鐘）

1. 在 Sheet 上方點 **擴充功能 → Apps Script**
2. 把預設的 `function myFunction() {}` 整段刪掉
3. 開檔案 `Projects/02-GLN/線上估價系統/google-apps-script.gs`
4. 全選複製 → 貼到 Apps Script 編輯器
5. **改第 22 行**：把 `YOUR_SHEET_ID_HERE` 換成 Step 1 抓到的 Sheet ID
6. 第 24 行的 `NOTIFY_EMAIL` 確認是 `carol@goodlivingnotes.com`（若要寄到其他信箱請改）
7. 上方點💾儲存（檔案 → 儲存），命名專案為 `GLN-Lead-Endpoint`

---

## Step 3：部署為 Web App（3 分鐘）

1. 編輯器右上角 **部署 → 新增部署作業**
2. 點齒輪 ⚙️ → 選 **網頁應用程式**
3. 設定：
   - **說明**：`GLN 預算分配表 v1`
   - **執行身分**：`我（carol@goodlivingnotes.com）`
   - **存取權**：`任何人`（重要！這樣前端才能無登入呼叫）
4. 點 **部署**
5. 第一次會跳授權視窗 → 選 carol@goodlivingnotes.com → 「進階」→「前往 GLN-Lead-Endpoint（不安全）」→ 允許
6. 出現 **Web 應用程式網址**，複製起來（格式：`https://script.google.com/macros/s/AKfyc.../exec`）

---

## Step 4：把網址填入前端 config（30 秒）

1. 開檔案 `Projects/02-GLN/線上估價系統/web/config.json`
2. 把剛複製的網址貼到 `leadEndpoint`：

```json
{
  "leadEndpoint": "https://script.google.com/macros/s/AKfyc.../exec"
}
```

3. 存檔

---

## Step 5：測試（3 分鐘）

1. 開瀏覽器，到 [http://localhost:8775](http://localhost:8775) 或 GitHub Pages 網址
2. 滾到「完整估價」區塊，隨便填一份測試資料（建議 email 填自己的）
3. 送出 → 應該看到 Modal 開頭出現「✉️ 您的預算分配 PDF 已寄至 xxx」
4. **回到 Google Sheet** → 應該有新的一列資料
5. **檢查 carol@goodlivingnotes.com 信箱** → 應該收到 `[GLN 新線索] ...` 通知信

---

## 疑難排解

### ❌ Sheet 沒新資料、信也沒收到
- 檢查瀏覽器 DevTools Console，看有沒有 `[GLN] sendLead 失敗`
- 檢查 GAS 編輯器左側 **執行作業** → 看 `doPost` 是否有 error log
- 最常見：Web App 部署存取權沒設「任何人」，或 SHEET_ID 沒換對

### ❌ 收到信但 Sheet 只有表頭
- 表示 sheet append 失敗，看 GAS 執行作業的錯誤訊息
- 通常是 SHEET_ID 對但分頁名稱（`線索`）被手動改過

### ⚠️ 客戶反應「沒收到 PDF」
- 目前 GAS 還沒實作自動寄 PDF 給客戶（P0 範圍內只通知 Carol）
- 下一階段 P0.5：再串一個 `MailApp.sendEmail` 把預算 PDF 自動寄給客戶
- 暫時做法：Carol 收到通知信 → 兩個工作日內由客服手動寄

---

## 下一階段（P0.5，可選）

完成 P0 後，這幾個小升級成本都很低：

1. **自動寄 PDF 給客戶**（在 `sendNotification` 後加 `sendCustomerEmail`）
2. **Sheet 條件式格式**：超過 500 萬的線索自動標紅（高價值）
3. **每週 Carol 報表**：用 GAS 的 `Trigger` 每週一寄上週線索摘要
4. **Notion CRM 同步**：在 `appendToSheet` 後 `UrlFetchApp.fetch('https://api.notion.com/...')` 建 page

---

## 安全提醒

- Web App URL 是 public 但有 obscurity 保護（網址不外流）
- Sheet 內容只有有權限的人能看（因為執行身分 = Carol 自己）
- 客戶資料（電話、地址、email）受 GLN 隱私聲明保護，請勿外流
- 半年後若要做趨勢分析，建議匯出後去識別化再分享給外部顧問
