# 開發作業程序 (Development SOP)

本文件定義 PCC Downloader MCP 的開發流程、環境配置與品質標準。

---

## 1. 開發環境配置 (Environment Setup)
在開始開發前，請確保已安裝以下工具：

- **Node.js**: v22+
- **npm**: v11+
- **Playwright**: 最新穩定版 (npx playwright install chromium)
- **TypeScript**: v5+ (tsc 編譯)

---

## 2. 專案架構 (Project Structure)
本專案遵循 MCP 標準結構：

- `/src/index.ts`: MCP 伺服器主程式，包含 PccDownloader 類別與工具註冊。
- `/dist`: 編譯後的 JavaScript 目錄。
- `/downloads`: 下載檔案的預設存儲位置。
- `tsconfig.json`: TypeScript 編譯器配置 (ESM 支援)。

---

## 3. Git 與提交規範 (Git Workflow)
所有提交建議遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

- feat: 新功能 (如新增 batch 下載)。
- fix: 修復 Bug (如更新 Playwright 選擇器)。
- docs: 僅文件異動 (如更新此 SOP)。
- style: 不影響程式邏輯的代碼格式異動。
- refactor: 代碼重構。

---

## 4. 開發週期指令 (Commands)

### 啟動開發模式
```bash
npm start
```

### 建置專案
```bash
npm run build
```

---

## 5. 品質檢查表 (Quality Checklist)
發布或提交前必須確認：

- [ ] `npm run build` 通過無報錯。
- [ ] 已清理所有開發測試用的 `temp.html` 或 JSON。
- [ ] 檢查 `downloads/` 資料夾中是否有測試殘留檔案。
- [ ] 確認 `list_chapters`、`search_specifications`、`batch_download_specifications`、`download_specification` 四個工具功能正常。

---
*版本: 1.0.0*  
*最後編輯: 2026-03-05*
