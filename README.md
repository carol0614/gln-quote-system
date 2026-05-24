# GLN 線上估價系統 — Web 前端

> 對應 `../估價系統_規格書_v1.md`（v1.2）+ `../估價系統_係數參數_v1.json`
> 本資料夾包含可獨立部署的靜態網站。

---

## 檔案結構

```
web/
├── index.html         主頁（hero + 快速模式 + 完整模式 8 步驟）
├── style.css          GLN VI 暖色系（Olive Gray + Taupe + Mist）
├── main.js            前端邏輯（分頁導航、驗證、結果顯示）
├── estimate.js        計算引擎（純函式，可在 Node 與瀏覽器執行）
├── params.json        係數參數（鏡像自 ../估價系統_係數參數_v1.json）
├── test_estimate.js   Node 測試（驗證 4 個官方 test case）
└── README.md          本檔
```

---

## 本機預覽

### 方法 1：Claude Preview（推薦）

已設定 `gln-quote` 於 `.claude/launch.json`，port `8775`：

```
mcp__Claude_Preview__preview_start  name=gln-quote
```

### 方法 2：純 npx http-server

```bash
cd web/
npx http-server -p 8775 -c-1
# 開啟 http://localhost:8775
```

### 方法 3：VS Code Live Server

開啟 `index.html` → 右鍵 → Open with Live Server。

---

## 驗證計算引擎

```bash
cd web/
node test_estimate.js
```

預期輸出：32 通過 / 0 失敗（涵蓋 Carol 提供的 4 個 test case）。

---

## 部署到 GitHub Pages（規劃中）

```bash
# 建議 repo 名稱
gln-quote-system

# 目錄結構直接放 root
.
├── index.html
├── style.css
├── main.js
├── estimate.js
└── params.json
```

啟用 Pages：Settings → Pages → Source: main branch / root

預定網址：`https://carol0614.github.io/gln-quote-system/`

---

## TODO（待 Carol 決策）

| # | 項目 | 阻塞 |
|---|---|---|
| 1 | 串接 Google Apps Script Web App | 表單送出後 POST 到 Apps Script，寫入 Google Sheet + 寄 PDF |
| 2 | PDF 報告範本（Google Docs） | 含 LOGO、估價區間、Cost Breakdown、屋況加成、CTA |
| 3 | 風格參考圖（F1 各風格代表圖） | 上傳到 web/img/styles/ 並在表單中以縮圖呈現 |
| 4 | GLV 系統櫃導流連結 | 等 GLV 估價系統建好後加 link |
| 5 | Phase 2：商業空間估價邏輯 | 等 Carol 提供商業空間係數 |

---

## 開發者注意事項

### 1. params.json 為單一資料來源
若 Carol 在 `../估價系統_係數參數_v1.json` 更新係數，**必須同步複製到本資料夾**：

```bash
cp "../估價系統_係數參數_v1.json" params.json
```

未來可改為 build step 自動同步。

### 2. estimate.js 為純函式
- 可同時用於瀏覽器（`window.GLNEstimate.estimate`）與 Node（`require('./estimate.js')`）
- 無 DOM 依賴、無外部呼叫 → 容易測試

### 3. 信心度對應寬度
| 信心度 | 寬度 |
|---|---|
| 高 | ±10% |
| 中 | ±15% |
| 低 | ±25% |
| 參考 | ±35% |

快速模式預設「低」，完整模式預設「中」。未來上傳平面圖可升級為「高」。

### 4. 邊界情況：屋齡 = 5
- 新成屋 5 年 → 6 萬/坪（age <= 5 規則）
- 公寓 5 年 → 6.5 萬/坪（5 <= age < 20 規則）
- 由 `findBasePrice()` 兩輪比對處理（第一輪嚴格 `<`，找不到再放寬到 `<=`）

### 5. 廚房自動鎖定
若房屋型態為新成屋/預售屋且屋齡 ≤ 5，廚房翻新自動鎖為「否」（建商已附）。

---

## 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| v1.0 | 2026-05-22 | 初版，含快速+完整雙模式、計算引擎、Modal 結果頁、預算打架建議 |
