# PCC Downloader MCP Server

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)

一個基於 Node.js 與 Playwright 的 Model Context Protocol (MCP) 伺服器，專門用於從「公共工程雲端服務網 (tec0304)」自動化搜尋並下載施工綱要規範文件。

---

## 核心特色 (Key Features)

- **目錄瀏覽 (Discovery)**: `list_chapters` 直接從網站 dropdown 動態讀取最新章節清單，不硬編碼。
- **精確搜尋 (Smart Search)**: `search_specifications` 支援關鍵字與 5 位碼規範編號搜尋，並回傳每筆規範**實際可用的格式**（DOC/ODT/XLS/ODS/PDF）。
- **批次處理 (Batch Automation)**: `batch_download_specifications` 讓 LLM 一次下達多筆下載任務，每筆可指定一個或多個格式。
- **格式選擇**: 支援 DOC、ODT、XLS、ODS、PDF，每筆規範可用格式不同，搜尋結果會標示。

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

## 工具說明 (Available Tools)

### 1. `list_chapters` — 取得章節清單

直接從網站讀取所有可用章節分類（動態，不硬編碼）。

**回傳範例：**
```json
[
  { "name": "第00章 一般規定", "value": "00" },
  { "name": "第01章 一般需求", "value": "01" },
  { "name": "第09章 完成面", "value": "09" }
]
```

---

### 2. `search_specifications` — 搜尋規範

| 參數 | 類型 | 說明 |
|------|------|------|
| `keyword` | string（選填）| 關鍵字或規範編號，留空列出該章節全部 |
| `chapter` | string（選填）| 章節代碼（00-16, L, E），留空搜尋全部章節 |

**回傳範例：**
```json
[
  {
    "index": 0,
    "code": "09910",
    "name": "油漆",
    "fullVersion": "V5.0",
    "detailVersion": "V9.0",
    "hasDoc": true,
    "hasOdt": true,
    "hasXls": false,
    "hasOds": true,
    "hasPdf": false
  }
]
```

> 建議先用此工具確認每筆規範**有哪些格式可下載**，再呼叫下載工具。

---

### 3. `batch_download_specifications` — 批次下載

| 參數 | 類型 | 說明 |
|------|------|------|
| `items` | array | 下載任務列表 |
| `items[].code` | string（選填）| 規範章碼（精確比對，優先使用） |
| `items[].keyword` | string（選填）| 關鍵字（無章碼時使用） |
| `items[].chapter` | string（選填）| 章節代碼 |
| `items[].formats` | string[]（必填）| 要下載的格式：`doc`, `odt`, `xls`, `ods`, `pdf` |

**呼叫範例：**
```json
{
  "items": [
    {
      "code": "09910",
      "chapter": "09",
      "formats": ["doc", "odt"]
    },
    {
      "keyword": "混凝土",
      "chapter": "03",
      "formats": ["pdf"]
    }
  ]
}
```

**回傳範例：**
```json
[
  { "item": "Code: 09910", "status": "Success", "files": ["09910_油漆.doc", "09910_油漆.odt"] },
  { "item": "Keyword: 混凝土", "status": "No formats found", "files": [] }
]
```

---

### 4. `download_specification` — 下載單一規範

| 參數 | 類型 | 說明 |
|------|------|------|
| `keyword` | string（必填）| 搜尋用關鍵字 |
| `chapter` | string（必填）| 章節代碼 |
| `name` | string（必填）| 規範完整章名（與搜尋結果的 `name` 欄位一致）|
| `format` | string（必填）| 格式：`doc`, `odt`, `xls`, `ods`, `pdf` |

---

## 建議使用流程

```
1. list_chapters          ← 取得章節清單（可選）
        ↓
2. search_specifications  ← 搜尋規範，確認 hasDoc/hasOdt 等欄位
        ↓
3. batch_download_specifications  ← 指定 code 和 formats 批次下載
```

下載的檔案會存放在專案目錄下的 `downloads/` 資料夾。

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

1. **法律責任**：本工具僅供技術研究與個人自動化作業參考。使用者須自行承擔因使用本程式而產生的所有法律責任。
2. **遵循規範**：使用者應嚴格遵守「公共工程雲端服務網」之使用條款、隱私權政策及相關爬蟲限制規定。
3. **第三方內容**：下載之所有施工規範文件，其版權均屬行政院公共工程委員會所有。

---
*最後更新: 2026-03-05*
