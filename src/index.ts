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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOWNLOAD_DIR = path.join(process.cwd(), "downloads");

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

class PccDownloader {
  private browser: Browser | null = null;
  private url = "https://pcic.pcc.gov.tw/pwc-web/service/tec0304";

  async init() {
    this.browser = await chromium.launch({ headless: true });
  }

  async close() {
    if (this.browser) await this.browser.close();
  }

  private async getPage(): Promise<Page> {
    if (!this.browser) await this.init();
    const context = await this.browser!.newContext();
    return await context.newPage();
  }

  async listChapters() {
    const page = await this.getPage();
    try {
      await page.goto(this.url, { waitUntil: "networkidle" });
      const chapters = await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('label:has(input[type="radio"])'));
        return labels.map(label => {
          const input = label.querySelector('input') as HTMLInputElement;
          return {
            name: label.innerText.trim(),
            value: input.value
          };
        }).filter(c => c.name !== "");
      });
      return chapters;
    } finally {
      await page.close();
    }
  }

  async search(keyword: string = "", chapter?: string) {
    const page = await this.getPage();
    try {
      await page.goto(this.url, { waitUntil: "networkidle" });

      if (chapter) {
        const radio = page.locator(`input[type="radio"][value="${chapter}"]`);
        if (await radio.count() > 0) {
          await radio.check();
        }
      }

      const keywordInput = page.locator('input[type="text"]').first();
      await keywordInput.fill(keyword);

      const searchBtn = page.locator('button:has-text("查詢")');
      await searchBtn.click();
      
      // Wait for table to update
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000); // Small buffer for JS rendering

      // Wait for the list table - usually it's a table with class or inside a certain div
      // Based on typical JHipster/PCCES structure
      await page.waitForSelector("table", { timeout: 10000 }).catch(() => null);

      // Extract table rows
      const rows = await page.evaluate(() => {
        const table = document.querySelector("table");
        if (!table) return [];
        const trs = Array.from(table.querySelectorAll("tbody tr"));
        return trs.map((tr, index) => {
          const tds = Array.from(tr.querySelectorAll("td"));
          // Typical columns: No., Chapter/Code, Name, Version, Download Icons
          return {
            index,
            code: tds[1]?.innerText?.trim() || "",
            name: tds[2]?.innerText?.trim() || "",
            version: tds[3]?.innerText?.trim() || "",
            // Find download buttons/icons
            hasDoc: !!tr.querySelector('img[src*="doc"], a:has-text("DOC")'),
            hasOdt: !!tr.querySelector('img[src*="odt"], a:has-text("ODT")'),
            hasXls: !!tr.querySelector('img[src*="xls"], a:has-text("XLS")'),
            hasPdf: !!tr.querySelector('img[src*="pdf"], a:has-text("PDF")'),
          };
        });
      });

      return rows;
    } finally {
      await page.close();
    }
  }

  async batchDownload(items: { keyword?: string, code?: string, chapter?: string, formats: string[] }[]) {
    const results: { item: string, status: string, files: string[], error?: string }[] = [];
    const page = await this.getPage();

    try {
      for (const item of items) {
        const searchTerm = item.code || item.keyword || "";
        const itemIdentifier = item.code ? `Code: ${item.code}` : `Keyword: ${item.keyword}`;
        
        try {
          await page.goto(this.url, { waitUntil: "networkidle" });
          
          if (item.chapter) {
            const radio = page.locator(`input[type="radio"][value="${item.chapter}"]`);
            if (await radio.count() > 0) await radio.check();
          }
          
          await page.locator('input[type="text"]').first().fill(searchTerm);
          await page.locator('button:has-text("查詢")').click();
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(500);

          // Find the best matching row
          // If code is provided, try to match tds[1], else match by text in row
          let rowSelector = item.code ? `tr:has(td:text-is("${item.code}"))` : `tr:has-text("${item.keyword}")`;
          const row = page.locator(rowSelector).first();

          if (await row.count() === 0) {
            results.push({ item: itemIdentifier, status: "Failed", files: [], error: "Not found" });
            continue;
          }

          const downloadedFiles: string[] = [];
          for (const format of item.formats) {
            let selector = "";
            switch (format.toLowerCase()) {
              case "doc": selector = 'img[src*="doc"], a:has-text("DOC")'; break;
              case "odt": selector = 'img[src*="odt"], a:has-text("ODT")'; break;
              case "xls": selector = 'img[src*="xls"], a:has-text("XLS")'; break;
              case "pdf": selector = 'img[src*="pdf"], a:has-text("PDF")'; break;
            }

            const btn = row.locator(selector);
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
      await page.goto(this.url, { waitUntil: "networkidle" });

      if (chapter) {
        await page.locator(`input[type="radio"][value="${chapter}"]`).check();
      }
      await page.locator('input[type="text"]').first().fill(keyword);
      await page.locator('button:has-text("查詢")').click();
      await page.waitForLoadState("networkidle");

      // Find the specific row by name
      const row = page.locator(`tr:has-text("${targetName}")`).first();
      if (await row.count() === 0) {
        throw new Error(`Could not find specification named: ${targetName}`);
      }

      // Find the download button for the format
      let selector = "";
      switch (format.toLowerCase()) {
        case "doc": selector = 'img[src*="doc"], a:has-text("DOC")'; break;
        case "odt": selector = 'img[src*="odt"], a:has-text("ODT")'; break;
        case "xls": selector = 'img[src*="xls"], a:has-text("XLS")'; break;
        case "pdf": selector = 'img[src*="pdf"], a:has-text("PDF")'; break;
        default: throw new Error(`Unsupported format: ${format}`);
      }

      const downloadBtn = row.locator(selector);
      if (await downloadBtn.count() === 0) {
        throw new Error(`Format ${format} not available for ${targetName}`);
      }

      // Handle download event
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
        description: "Get the list of all available chapter categories (e.g., 03 Concrete, 09 Finishes)",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "search_specifications",
        description: "Search for construction specifications. If keyword is empty, lists all in the chapter.",
        inputSchema: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "Keyword or specification code (e.g. 09910). Can be empty." },
            chapter: { 
              type: "string", 
              description: "Chapter code (00-16, L, E).",
              enum: ["", "00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "L", "E"]
            },
          },
        },
      },
      {
        name: "batch_download_specifications",
        description: "Download multiple specifications in one tool call. Best for automation.",
        inputSchema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  code: { type: "string", description: "Specification code (e.g. 09910)" },
                  keyword: { type: "string", description: "Keyword (used if code is not available)" },
                  chapter: { type: "string", description: "Chapter code (00-16, L, E)" },
                  formats: { 
                    type: "array", 
                    items: { type: "string", enum: ["doc", "odt", "xls", "pdf"] },
                    description: "List of formats to download"
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
        description: "Download a specific construction specification file",
        inputSchema: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "Original keyword used for search" },
            chapter: { type: "string", description: "Chapter code used for search" },
            name: { type: "string", description: "Full name of the specification to download" },
            format: { 
              type: "string", 
              enum: ["doc", "odt", "xls", "pdf"],
              description: "File format to download"
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
        keyword: z.string(),
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
          text: `Successfully downloaded: ${result.fileName}\nPath: ${result.filePath}` 
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
  console.error("PCC Downloader MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
