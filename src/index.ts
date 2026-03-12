import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 固定指向使用者的系統下載資料夾（C:\Users\{name}\Downloads）
const DOWNLOAD_DIR = path.join(os.homedir(), "Downloads");

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

class PccDownloader {
  private browser: Browser | null = null;
  private url = "https://pcic.pcc.gov.tw/pwc-web/service/tec0304";

  async init() {
    this.browser = await chromium.launch({
      headless: true,
      // 抑制 Playwright 的 stderr 輸出，避免污染 MCP stdio 通道
      // 某些 agent host 會將 stderr 視為錯誤訊號
      args: ["--disable-logging", "--log-level=3"],
    });
  }

  async close() {
    if (this.browser) await this.browser.close();
  }

  private async getPage(): Promise<Page> {
    if (!this.browser) await this.init();
    const context = await this.browser!.newContext();
    return await context.newPage();
  }

  /**
   * 共用的搜尋流程：填入章節與關鍵字後點查詢，等待結果表格出現
   *
   * 實際 DOM 結構（由瀏覽器直接調查確認）：
   *   - 章節選擇：<select id="tecCode">，值為 "" (全部) 或 "01"..."16","L","E"
   *   - 關鍵字：<input id="cname">
   *   - 查詢按鈕：<button aria-label="查詢">
   *   - loading 遮罩：點擊查詢後出現「查詢中，請稍候...」overlay，需等待消失
   *   - 結果表格：<tbody> 裡的 <tr>，預設不顯示，點查詢後才出現
   */
  private async searchAndWait(page: Page, keyword: string, chapter?: string) {
    await page.goto(this.url, { waitUntil: "networkidle" });

    // 章節選擇（實際是 <select id="tecCode">）
    // 用三段式 fallback，避免 option value 格式不確定造成失敗：
    // 1. 先嘗試 value 精確比對
    // 2. 再嘗試 label 文字包含比對（「03 混凝土」裡找「03」）
    // 3. 最後用 evaluate 直接設值並觸發 Vue change 事件
    if (chapter) {
      const select = page.locator("#tecCode");
      if (await select.count() > 0) {
        const selected = await select.selectOption(chapter).catch(() => null)
          ?? await select.selectOption({ label: chapter }).catch(() => null)
          ?? await page.evaluate((ch) => {
            const sel = document.querySelector<HTMLSelectElement>("#tecCode");
            if (!sel) return false;
            const opt = Array.from(sel.options).find(
              o => o.value.startsWith(ch) || o.text.startsWith(ch)
            );
            if (!opt) return false;
            sel.value = opt.value;
            sel.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
          }, chapter).catch(() => null);
        if (!selected) {
          throw new Error(`找不到章節 "${chapter}"，請用 list_chapters 確認可用的章節代碼`);
        }
      }
    }

    // 關鍵字輸入
    // 頁面上有兩個搜尋欄位：右上角全站搜尋 + 表單內關鍵字欄位
    // 用 input#cname.form-control 經進一步限縮，確保命中的是表單內的關鍵字欄位
    await page.locator("input#cname.form-control").fill(keyword);

    // 點擊查詢按鈕
    await page.locator('button[aria-label="查詢"]').click();

    // 等待 loading 遮罩消失（嘗試多種常見 selector）
    for (const maskSel of [".vld-overlay", ".loading-overlay", ".mask-container", "[class*='loading']"]) {
      await page.locator(maskSel).waitFor({ state: "hidden", timeout: 3000 }).catch(() => null);
    }

    // 等待結果表格的 tbody tr 出現（比 networkidle 更精準）
    await page.waitForSelector("table tbody tr", { timeout: 30000 }).catch(() => null);

    // 額外緩衝（Vue reactive 渲染）
    await page.waitForTimeout(500);
  }

  /**
   * 取得下載按鈕的 Playwright selector
   *
   * 實際調查：下載按鈕是 <button class="btn btn-link"> 含有 "DOC版"、"DOCX版"、"ODT版"、"ODS版" 等文字
   * 注意：不同規範可能使用 DOC版 或 DOCX版，用逗號組合同時支援兩種
   */
  private getFormatSelector(format: string): string {
    switch (format.toLowerCase()) {
      // 同時支援 "DOC版" 和 "DOCX版"（網站不同規範可能出現兩種）
      case "doc": return 'button.btn-link:has-text("DOCX版"), button.btn-link:has-text("DOC版")';
      case "odt": return 'button.btn-link:has-text("ODT版")';
      case "xls": return 'button.btn-link:has-text("XLS版")';
      case "ods": return 'button.btn-link:has-text("ODS版")';
      case "pdf": return 'button.btn-link:has-text("PDF版")';
      default: throw new Error(`不支援的格式: ${format}。支援: doc, odt, xls, ods, pdf`);
    }
  }

  async listChapters() {
    const page = await this.getPage();
    try {
      await page.goto(this.url, { waitUntil: "networkidle" });

      // 章節是 <select id="tecCode">，讀取所有 <option>
      const chapters = await page.evaluate(() => {
        const select = document.querySelector<HTMLSelectElement>("#tecCode");
        if (!select) return [];
        return Array.from(select.options)
          .filter(opt => opt.value !== "")
          .map(opt => ({
            name: opt.text.trim(),
            value: opt.value,
          }));
      });
      return chapters;
    } finally {
      await page.close();
    }
  }

  async search(keyword: string = "", chapter?: string) {
    const page = await this.getPage();
    try {
      await this.searchAndWait(page, keyword, chapter);

      // 結果表格欄位結構（實際調查確認）：
      //   td[0] (nth-child 1) = 序號
      //   td[1] (nth-child 2) = 章碼（如 01271）
      //   td[2] (nth-child 3) = 章名（如 計量與計價）
      //   td[3] (nth-child 4) = 完整版：版本號 + 下載按鈕 (button.btn-link: "DOC版", "ODT版")
      //   td[4] (nth-child 5) = 細目版：版本號 + 下載按鈕
      //   td[5] (nth-child 6) = 歷程按鈕
      const rows = await page.evaluate(() => {
        const table = document.querySelector("table");
        if (!table) return [];
        const trs = Array.from(table.querySelectorAll("tbody tr"));
        return trs.map((tr, index) => {
          const tds = Array.from(tr.querySelectorAll("td"));
          // 從所有 button.btn-link 的文字判斷可用格式
          const allBtns = Array.from(tr.querySelectorAll("button.btn-link"));
          const btnTexts = allBtns.map(b => (b as HTMLElement).innerText.trim().toUpperCase());
          return {
            index,
            code: (tds[1] as HTMLElement)?.innerText?.trim() || "",
            name: (tds[2] as HTMLElement)?.innerText?.trim() || "",
            fullVersion: (tds[3] as HTMLElement)?.innerText?.replace(/DOCX版|DOC版|ODT版|XLS版|ODS版|PDF版/g, "").trim() || "",
            detailVersion: (tds[4] as HTMLElement)?.innerText?.replace(/DOCX版|DOC版|ODT版|XLS版|ODS版|PDF版/g, "").trim() || "",
            hasDoc: btnTexts.some(t => t.includes("DOC")),
            hasOdt: btnTexts.some(t => t.includes("ODT")),
            hasXls: btnTexts.some(t => t.includes("XLS")),
            hasOds: btnTexts.some(t => t.includes("ODS")),
            hasPdf: btnTexts.some(t => t.includes("PDF")),
          };
        });
      });

      return rows;
    } finally {
      await page.close();
    }
  }

  async batchDownload(items: { keyword?: string | undefined, code?: string | undefined, chapter?: string | undefined, formats: string[] }[]) {
    const results: { item: string, status: string, files: string[], error?: string }[] = [];
    const page = await this.getPage();

    try {
      for (const item of items) {
        const searchTerm = item.code || item.keyword || "";
        const itemIdentifier = item.code ? `Code: ${item.code}` : `Keyword: ${item.keyword}`;

        try {
          await this.searchAndWait(page, searchTerm, item.chapter);

          // 透過章碼（td:nth-child(2)）精確比對，或章名模糊比對
          let row;
          if (item.code) {
            row = page.locator(`table tbody tr:has(td:nth-child(2):text-is("${item.code}"))`).first();
          } else {
            row = page.locator(`table tbody tr:has-text("${item.keyword}")`).first();
          }

          if (await row.count() === 0) {
            results.push({ item: itemIdentifier, status: "Failed", files: [], error: "Not found" });
            continue;
          }

          const downloadedFiles: string[] = [];
          for (const format of item.formats) {
            const selector = this.getFormatSelector(format);
            const btn = row.locator(selector).first();
            if (await btn.count() > 0) {
              const [download] = await Promise.all([
                page.waitForEvent("download"),
                btn.click(),
              ]);
              const fileName = download.suggestedFilename();
              await download.saveAs(path.join(DOWNLOAD_DIR, fileName));
              downloadedFiles.push(fileName);
            }
          }

          results.push({
            item: itemIdentifier,
            status: downloadedFiles.length > 0 ? "Success" : "No formats found",
            files: downloadedFiles
          });

        } catch (e: any) {
          results.push({ item: itemIdentifier, status: "Error", files: [], error: e.message });
        }
      }
      return results;
    } finally {
      await page.close();
    }
  }

  async download(keyword: string, chapter: string, targetName: string, format: string) {
    const page = await this.getPage();
    try {
      await this.searchAndWait(page, keyword, chapter);

      // 用章名（td:nth-child(3)）精確比對
      let row = page.locator(`table tbody tr:has(td:nth-child(3):text-is("${targetName}"))`).first();

      // fallback：has-text 模糊比對（避免空白字元不一致導致比對失敗）
      if (await row.count() === 0) {
        row = page.locator(`table tbody tr:has-text("${targetName}")`).first();
        if (await row.count() === 0) {
          throw new Error(`找不到規範: ${targetName}`);
        }
      }

      const selector = this.getFormatSelector(format);
      const downloadBtn = row.locator(selector).first();
      if (await downloadBtn.count() === 0) {
        throw new Error(`規範 ${targetName} 沒有 ${format} 格式`);
      }

      const [download] = await Promise.all([
        page.waitForEvent("download"),
        downloadBtn.click(),
      ]);

      const fileName = download.suggestedFilename();
      const filePath = path.join(DOWNLOAD_DIR, fileName);
      await download.saveAs(filePath);

      return { fileName, filePath };
    } finally {
      await page.close();
    }
  }
}

const pcc = new PccDownloader();

const server = new Server(
  {
    name: "pcc-downloader",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_chapters",
        description: "取得所有可用的章節分類清單（從網站的 select dropdown 動態讀取）",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "search_specifications",
        description: "搜尋施工綱要規範。keyword 留空可列出該章節所有規範。",
        inputSchema: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "關鍵字或規範編號（如 09910）。可留空。" },
            chapter: {
              type: "string",
              description: "章節代碼（00-16, L, E）。輸入 'all' 表示全部章節。",
              enum: ["all", "00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "L", "E"]
            },
          },
        },
      },
      {
        name: "batch_download_specifications",
        description: "批次下載多個規範，一次 tool call 完成。適合自動化任務。",
        inputSchema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  code: { type: "string", description: "規範章碼（如 09910）" },
                  keyword: { type: "string", description: "關鍵字（無章碼時使用）" },
                  chapter: { type: "string", description: "章節代碼（00-16, L, E）" },
                  formats: {
                    type: "array",
                    items: { type: "string", enum: ["doc", "odt", "xls", "ods", "pdf"] },
                    description: "要下載的格式列表"
                  }
                },
                required: ["formats"]
              }
            }
          },
          required: ["items"]
        },
      },
      {
        name: "download_specification",
        description: "下載單一特定規範文件",
        inputSchema: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "搜尋用的關鍵字" },
            chapter: { type: "string", description: "搜尋用的章節代碼" },
            name: { type: "string", description: "要下載的規範完整章名" },
            format: {
              type: "string",
              enum: ["doc", "odt", "xls", "ods", "pdf"],
              description: "要下載的格式"
            },
          },
          required: ["keyword", "chapter", "name", "format"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "list_chapters") {
      const results = await pcc.listChapters();
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }

    if (name === "search_specifications") {
      const { keyword, chapter } = z.object({
        keyword: z.string().optional().default(""),
        chapter: z.string().optional(),
      }).parse(args);

      const results = await pcc.search(keyword, chapter);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }

    if (name === "batch_download_specifications") {
      const { items } = z.object({
        items: z.array(z.object({
          code: z.string().optional(),
          keyword: z.string().optional(),
          chapter: z.string().optional(),
          formats: z.array(z.string()),
        }))
      }).parse(args);

      const results = await pcc.batchDownload(items);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }

    if (name === "download_specification") {
      const { keyword, chapter, name: specName, format } = z.object({
        keyword: z.string(),
        chapter: z.string(),
        name: z.string(),
        format: z.string(),
      }).parse(args);

      const result = await pcc.download(keyword, chapter, specName, format);
      return {
        content: [{
          type: "text",
          text: `成功下載: ${result.fileName}\n路徑: ${result.filePath}`
        }],
      };
    }

    throw new Error(`Tool not found: ${name}`);
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // 注意：不用 console.log，避免污染 MCP 的 stdout；
  // console.error 寫入 stderr 理論上安全，但部分 agent 實作中建議完全靜默
  // console.error("PCC Downloader MCP Server running on stdio");
}

const LOG_FILE = path.join(__dirname, "..", "debug_error.log");
function logError(err: any) {
  const msg = `${new Date().toISOString()} - ${err instanceof Error ? err.stack : JSON.stringify(err)}\n`;
  fs.appendFileSync(LOG_FILE, msg);
}

process.on("uncaughtException", (err) => {
  logError(err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  logError(err);
  process.exit(1);
});

main().catch((error) => {
  logError(error);
  process.exit(1);
});
