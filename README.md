# PCC Downloader MCP Server

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)

一個基於 Node.js 與 Playwright 的 Model Context Protocol (MCP) 伺服器，專門用於從「公共工程雲端服務網 (tec0304)」自動化搜尋並下載施工綱要規範文件 (DOC, ODT, XLS, PDF)。

---

## 核心特色 (Key Features)
- **目錄瀏覽 (Discovery)**: 提供 `list_chapters` 工具，動態獲取最新的章節分類清單，避免模型猜測代號。
- **精確搜尋 (Smart Search)**: 支援關鍵字與 5 位碼規範編號 (如 09910) 搜尋，自動對應正確章節。
- **批次處理 (Batch Automation)**: 提供 `batch_download_specifications` 工具，讓 LLM 僅需下達高階指令，由 MCP 自動完成「搜尋 -> 比對 -> 下載」的所有細節。
- **多格式支援**: 支援所有網站提供的格式 (DOC, ODT, XLS, PDF)，自動處理 Playwright 下載攔截。
- **高度可靠性**: 內建 JHipster/PCCES 框架下的動態 DOM 等待機制，確保在 SPA 環境中穩定運行。

## 快速上手 (Getting Started)

### 前置需求
- [Node.js](https://nodejs.org/) (v22+)
- [npm](https://www.npmjs.com/) (v11+)

### 安裝步驟
1. 複製專案並進入目錄。
2. 安裝依賴套件：
   ```bash
   npm install
   ```
3. 安裝 Playwright 所需的瀏覽器引擎：
   ```bash
   npx playwright install chromium
   ```
4. 編譯專案：
   ```bash
   npm run build
   ```

### 整合至 Claude Desktop
編輯 `%APPDATA%\Claude\claude_desktop_config.json`，加入以下內容（請確保路徑正確）：
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

## 提供工具 (Available Tools)
- `list_chapters`: 獲取所有可用的章節分類清單。
- `search_specifications`: 根據關鍵字或編號搜尋規範。
- `batch_download_specifications`: 執行批次下載任務列表。
- `download_specification`: 下載單一特定檔案。

## 授權與免責聲明 (License & Disclaimer)

### 授權協議 (License)
本專案採用 [MIT License](./LICENSE) 授權。

## 關於作者 (About the Author)
- **作者**: 加號設計數位工程有限公司 HJPLUS.DESIGN
- **網站**: [加號設計數位工程有限公司](https://hjplus.design)
- **粉絲專頁**: [加號設計數位工程有限公司](https://www.facebook.com/hjplus.design)
- **電子郵件**: [info@hjplusdesign.com](mailto:info@hjplusdesign.com)

我們是設計、建築與製造產業的外部研發夥伴，專門協助缺乏內部技術團隊的公司導入數位工作流程、工具與 AI，自動化你的知識與作業流程，以補足團隊技能升級的能量。我們專門解決以下情況：

- **技術缺口**：團隊中沒技術人員或團隊，卻需要自動化或資料串接。
- **整合困難**：專案複雜、資料格式多，但缺乏整合經驗。
- **轉型迷惘**：想導入 AI 或 BIM，但不知道從哪開始。
- **研發支援**：需要專案型的數位顧問或工具開發支援。

更多數位轉型諮詢與服務內容歡迎與我們聯絡。

### 免責聲明 (Disclaimer)
**在使用本工具前，請務必詳閱以下聲明：**

1. **法律責任**：本工具僅供技術研究與個人自動化作業參考。使用者須自行承擔因使用本程式而產生的所有法律責任。開發者及「加號設計數位工程有限公司」不對任何因使用、誤用或無法使用本工具所導致的直接、間接、偶發、特殊或衍生性損失（包括但不限於法律訴訟、帳號封禁、資料損毀或利潤損失）承擔任何法律責任。
2. **遵循規範**：使用者在使用本工具存取「公共工程雲端服務網」時，應嚴格遵守該網站之[使用條款](https://pcic.pcc.gov.tw/)、隱私權政策及相關爬蟲限制規定。嚴禁將本工具用於任何可能干擾網站正常運作或違反法律之行為。
3. **第三方內容**：本工具下載之所有施工規範文件，其版權均屬原權利人（行政院公共工程委員會）所有。本工具不保證下載內容的完整性、準確性或及時性。

---
*最後更新: 2026-03-05*
