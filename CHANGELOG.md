# 更新紀錄 (Changelog)

本文件記錄 PCC Downloader MCP 的所有版本變動。

## [1.0.0] - 2026-03-05

### 新增 (Added)
- **核心功能**: 實作 `search_specifications` 工具，支援關鍵字與章節搜尋。
- **自動下載**: 實作 `download_specification` 工具，自動處理 Playwright 下載邏輯。
- **目錄瀏覽**: 實作 `list_chapters` 工具，動態抓取公共工程雲端服務網的分類清單。
- **批次處理**: 實作 `batch_download_specifications` 工具，讓模型能一次下載多筆規範。
- **錯誤處理**: 加入 `zod` 參數驗證與 Playwright 的 DOM 等待與超時處理。
- **專案基礎**: 初始化 TypeScript (ESM) 開發環境與 MCP Server SDK。

### 優化 (Improved)
- 將 LLM 的決策邏輯轉移至 MCP 內部，大幅降低因模型解析 JSON 導致的失敗率。
- 加入對 DOC, ODT, XLS, PDF 四種格式的全面支援。

---
*參考標準: Keep a Changelog*
