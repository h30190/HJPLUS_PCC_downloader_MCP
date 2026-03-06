# PCC Downloader MCP Server

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)

一個基於 Node.js 與 Playwright 的 Model Context Protocol (MCP) 伺服器，專門用於從「公共工程雲端服務網 (tec0304)」自動化搜尋並下載施工綱要規範文件。

---

## 核心特色 (Key Features)

- **目錄瀏覽 (Discovery)**: `list_chapters` 直接從網站的下拉選單動態讀取最新章節清單，不硬編碼。
- **精確搜尋 (Smart Search)**: `search_specifications` 支援關鍵字與 5 位碼規範編號搜尋，並回傳每筆規範**實際可用的格式**（DOC/ODT/XLS/ODS/PDF）。
- **批次處理 (Batch Automation)**: `batch_download_specifications` 讓 LLM 一次下達多筆下載任務，每筆可指定一個或多個格式。
- **格式選擇**: 支援 DOC（含 DOCX）、ODT、XLS、ODS、PDF，每筆規範可用格式不同，搜尋結果會標示。
- **自動存檔**: 檔案自動儲存至**使用者的系統下載資料夾**（`C:\Users\{你的名字}\Downloads`）。

---

## 快速上手 (Getting Started)

### 前置需求
- [Node.js](https://nodejs.org/) (v22+)
- [npm](https://www.npmjs.com/) (v11+)

### 安裝步驟

```bash
# 1. 安裝依賴套件
npm install

# 2. 安裝 Playwright 所需的瀏覽器引擎
npx playwright install chromium

# 3. 編譯專案
npm run build
```

### 整合至 Agent（以 Claude Desktop 為例）

編輯 `%APPDATA%\Claude\claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "pcc-downloader": {
      "command": "node",
      "args": ["C:/你的路徑/PCC_downloader_MCP/dist/index.js"]
    }
  }
}
```

> **注意**：Playwright 啟動 Chromium 需要約 5~15 秒，請確保 agent 的 tool timeout 設定在 60 秒以上。

---

## 建議使用流程

```
1. list_chapters              ← 取得章節清單（可選，用來確認章節代碼）
        ↓
2. search_specifications      ← 搜尋規範，確認 hasDoc/hasOdt 等可用格式
        ↓
3. batch_download_specifications  ← 指定 code 和 formats 批次下載
```

下載的檔案會自動儲存至 **系統下載資料夾**（`C:\Users\{你的名字}\Downloads`）。

---

## 工具說明 (Available Tools)

### 1. `list_chapters` — 取得章節清單

從網站下拉選單動態讀取所有可用章節（動態，不硬編碼）。

**回傳範例：**
```json
[
  { "name": "00 一般規定", "value": "00" },
  { "name": "03 混凝土", "value": "03" },
  { "name": "09 完成面", "value": "09" }
]
```

---

### 2. `search_specifications` — 搜尋規範

| 參數 | 類型 | 說明 |
|------|------|------|
| `keyword` | string（選填）| 關鍵字（如「油漆」）或規範編號（如「09910」）。留空可列出該章節全部規範。|
| `chapter` | string（選填）| 章節代碼（00-16, L, E）。留空搜尋全部章節。|

> ⚠️ **搜尋建議**：關鍵字搜尋對應網站的「關鍵字」欄位，僅比對章名。若結果過多或不精確，建議改用 5 位碼規範編號搜尋（如 `09910`）。

**回傳範例：**
```json
[
  {
    "index": 0,
    "code": "09910",
    "name": "油漆",
    "fullVersion": "V8.0",
    "detailVersion": "V5.0",
    "hasDoc": true,
    "hasOdt": true,
    "hasXls": true,
    "hasOds": true,
    "hasPdf": false
  }
]
```

---

### 3. `batch_download_specifications` — 批次下載

| 參數 | 類型 | 說明 |
|------|------|------|
| `items` | array | 下載任務列表 |
| `items[].code` | string（選填）| 規範章碼（精確比對，優先使用）|
| `items[].keyword` | string（選填）| 關鍵字（無章碼時使用）|
| `items[].chapter` | string（選填）| 章節代碼 |
| `items[].formats` | string[]（必填）| 要下載的格式：`doc`、`odt`、`xls`、`ods`、`pdf` |

**呼叫範例：**
```json
{
  "items": [
    { "code": "09910", "chapter": "09", "formats": ["doc", "odt"] },
    { "code": "09250", "chapter": "09", "formats": ["doc"] }
  ]
}
```

**回傳範例：**
```json
[
  { "item": "Code: 09910", "status": "Success", "files": ["09910v80.doc", "09910v80.odt"] },
  { "item": "Code: 09250", "status": "Success", "files": ["09250v70.doc"] }
]
```

---

### 4. `download_specification` — 下載單一規範

| 參數 | 類型 | 說明 |
|------|------|------|
| `keyword` | string（必填）| 搜尋用關鍵字 |
| `chapter` | string（必填）| 章節代碼 |
| `name` | string（必填）| 規範完整章名（與搜尋結果的 `name` 欄位一致）|
| `format` | string（必填）| 格式：`doc`、`odt`、`xls`、`ods`、`pdf` |

---

## 格式說明

| 格式代碼 | 說明 | 對應按鈕 |
|---------|------|---------|
| `doc` | Word 文件 | DOC版 或 DOCX版 |
| `odt` | OpenDocument Text | ODT版 |
| `xls` | Excel 試算表 | XLS版 |
| `ods` | OpenDocument Spreadsheet | ODS版 |
| `pdf` | PDF 文件 | PDF版 |

> 每筆規範的可用格式不盡相同，請先用 `search_specifications` 確認 `hasDoc`、`hasOdt` 等欄位。

---

## 授權與免責聲明 (License & Disclaimer)

### 授權協議 (License)
本專案採用 [MIT License](./LICENSE) 授權。

## 關於作者 (About the Author)
- **作者**: 加號設計數位工程有限公司 HJPLUS.DESIGN
- **網站**: [加號設計數位工程有限公司](https://hjplus.design)
- **粉絲專頁**: [加號設計數位工程有限公司](https://www.facebook.com/hjplus.design)
- **電子郵件**: [info@hjplusdesign.com](mailto:info@hjplusdesign.com)

### 免責聲明 (Disclaimer)
**在使用本工具前，請務必詳閱以下聲明：**

1. **法律責任**：本工具僅供技術研究與個人自動化作業參考，使用者須自行承擔因使用本程式而產生的所有法律責任。
2. **遵循規範**：使用者應嚴格遵守「公共工程雲端服務網」之使用條款、隱私權政策及相關規定，嚴禁用於任何可能干擾網站正常運作之行為。
3. **合理使用**：建議每次請求之間保留適當間隔，避免對伺服器造成不必要的負擔。
4. **第三方內容**：下載之所有施工規範文件，其版權均屬行政院公共工程委員會所有，本工具不保證下載內容的完整性與準確性。

---
*最後更新: 2026-03-06*
