import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { chromium } from "playwright";
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
    browser = null;
    url = "https://pcic.pcc.gov.tw/pwc-web/service/tec0304";
    async init() {
        this.browser = await chromium.launch({ headless: true });
    }
    async close() {
        if (this.browser)
            await this.browser.close();
    }
    async getPage() {
        if (!this.browser)
            await this.init();
        const context = await this.browser.newContext();
        return await context.newPage();
    }
    async search(keyword, chapter) {
        const page = await this.getPage();
        try {
            await page.goto(this.url, { waitUntil: "networkidle" });
            // Handle chapter selection
            if (chapter) {
                // Find the radio button by value
                const radio = page.locator(`input[type="radio"][value="${chapter}"]`);
                if (await radio.count() > 0) {
                    await radio.check();
                }
            }
            // Handle keyword input
            // The keyword input is usually inside a div/label "關鍵字："
            const keywordInput = page.locator('input[type="text"]').first(); // Or more specific selector
            await keywordInput.fill(keyword);
            // Click search button
            const searchBtn = page.locator('button:has-text("查詢")');
            await searchBtn.click();
            // Wait for results table to update
            await page.waitForLoadState("networkidle");
            // Wait for the list table - usually it's a table with class or inside a certain div
            // Based on typical JHipster/PCCES structure
            await page.waitForSelector("table", { timeout: 10000 }).catch(() => null);
            // Extract table rows
            const rows = await page.evaluate(() => {
                const table = document.querySelector("table");
                if (!table)
                    return [];
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
        }
        finally {
            await page.close();
        }
    }
    async download(keyword, chapter, targetName, format) {
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
                case "doc":
                    selector = 'img[src*="doc"], a:has-text("DOC")';
                    break;
                case "odt":
                    selector = 'img[src*="odt"], a:has-text("ODT")';
                    break;
                case "xls":
                    selector = 'img[src*="xls"], a:has-text("XLS")';
                    break;
                case "pdf":
                    selector = 'img[src*="pdf"], a:has-text("PDF")';
                    break;
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
        }
        finally {
            await page.close();
        }
    }
}
const pcc = new PccDownloader();
const server = new Server({
    name: "pcc-downloader",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "search_specifications",
                description: "Search for construction specifications by keyword and chapter",
                inputSchema: {
                    type: "object",
                    properties: {
                        keyword: { type: "string", description: "Keyword to search for" },
                        chapter: {
                            type: "string",
                            description: "Chapter code (00-16, L, E). Leave empty for all.",
                            enum: ["", "00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "L", "E"]
                        },
                    },
                    required: ["keyword"],
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
    }
    catch (error) {
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
//# sourceMappingURL=index.js.map