import * as cheerio from "cheerio";
import Database from "better-sqlite3";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const FORGE_DOCS_BASE_URL = "https://docs.minecraftforge.net";
const DATA_DIR = "./data";
const DB_PATH = path.join(DATA_DIR, "forge-docs.db");

const FORGE_VERSIONS = [
  "1.21.x", "1.20.1", "1.20.x", "1.19.2", "1.19.x", "1.18.x",
  "1.17.x", "1.16.x", "1.15.x", "1.14.x", "1.13.x", "1.12.x",
];

async function fetchPage(url: string): Promise<string | null> {
  const domains = [
    url,
    url.replace("mcforge.readthedocs.io", "docs.minecraftforge.net"),
    url.replace("docs.minecraftforge.net", "mcforge.readthedocs.io")
  ];
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "curl/7.68.0"
  ];
  
  let attempt = 0;
  while (true) {
    attempt++;
    const domainUrl = domains[(attempt - 1) % domains.length];
    const ua = userAgents[(attempt - 1) % userAgents.length];
    
    try {
      const response = await fetch(domainUrl, { 
        headers: { "User-Agent": ua, "Accept": "text/html,*/*" },
        signal: AbortSignal.timeout(15000)
      });
      if (response.ok) {
        if (attempt > 1) console.log(`  ✓ Success on attempt ${attempt}`);
        return await response.text();
      }
      console.log(`  ✗ Attempt ${attempt}: HTTP ${response.status} (domain: ${new URL(domainUrl).host})`);
    } catch (err) {
      console.log(`  ✗ Attempt ${attempt}: ${err instanceof Error ? err.message : 'error'}`);
    }
    
    // Exponential backoff: 1s, 2s, 4s, 8s, max 10s
    const delay = Math.min(1000 * Math.pow(2, Math.floor(attempt / domains.length) - 1), 10000);
    console.log(`  ⏳ Retrying in ${delay}ms...`);
    await new Promise(r => setTimeout(r, delay));
  }
}

async function fetchSitemap(version: string): Promise<string[]> {
  const url = `${FORGE_DOCS_BASE_URL}/en/${version}/sitemap.xml`;
  const html = await fetchPage(url);
  if (!html) return [];
  const $ = cheerio.load(html, { xmlMode: true });
  const urls: string[] = [];
  $("loc").each((_, el) => { const u = $(el).text().trim(); if (u) urls.push(u); });
  return urls;
}

function categorize(url: string): string {
  const m = url.match(/en\/[\d.]+\/([^/]+)\//);
  const seg = m ? m[1] : "";
  const map: Record<string, string> = { networking: "networking", blocks: "blocks", items: "items", blockentities: "blockentities", entities: "entities", rendering: "rendering", events: "events", concepts: "concepts", resources: "resources", datagen: "datagen", datastorage: "datastorage", gui: "gui", gameeffects: "gameeffects", gettingstarted: "gettingstarted", misc: "misc", advanced: "advanced", legacy: "legacy" };
  return map[seg] || "general";
}

function parsePage(html: string, url: string, version: string) {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, .sidebar, .toc, .breadcrumb").remove();
  const title = $("h1").first().text().trim() || "Untitled";
  const category = categorize(url);
  const description = $("h1").next("p").text().trim() || "";
  const sections: { heading: string; content: string; code: string[] }[] = [];
  const allCode: string[] = [];
  $("h2").each((_, el) => {
    const heading = $(el).text().trim();
    if (!heading || heading === "Navigation" || heading === "Version:") return;
    let content = ""; const code: string[] = [];
    let next = $(el).next();
    while (next.length && next[0].tagName !== "h2") {
      if (next.is("pre") || next.find("pre").length > 0) { next.find("pre code").each((_, ce) => { const c = $(ce).text().trim(); if (c.length > 10) { code.push(c); allCode.push(c); } }); }
      const t = next.text().trim(); if (t && t.length > 20) content += t + "\n\n";
      next = next.next();
    }
    if (content.trim() || code.length > 0) sections.push({ heading, content: content.trim(), code });
  });
  if (sections.length === 0) { let c = $("article, main, .content").text().trim(); if (!c || c.length < 100) c = $("body").text().trim(); if (c.length > 100) sections.push({ heading: "Overview", content: c.substring(0, 5000), code: allCode }); }
  return { url, title, category, description, sections, codeBlocks: allCode };
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  const db = new Database(DB_PATH);
  db.exec(`CREATE TABLE documents (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT UNIQUE NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, category TEXT NOT NULL, minecraft_version TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE chunks (id TEXT PRIMARY KEY, document_id INTEGER NOT NULL, chunk_type TEXT NOT NULL, content TEXT NOT NULL, section_heading TEXT, code_language TEXT, word_count INTEGER, has_code INTEGER DEFAULT 0);
    CREATE VIRTUAL TABLE documents_fts USING fts5(title, content, content='documents', content_rowid='id');
    CREATE INDEX idx_doc_version ON documents(minecraft_version);
    CREATE INDEX idx_doc_category ON documents(category);`);
  const insertDoc = db.prepare("INSERT OR REPLACE INTO documents (url, title, content, category, minecraft_version, hash) VALUES (?, ?, ?, ?, ?, ?)");
  const insertChunk = db.prepare("INSERT OR REPLACE INTO chunks (id, document_id, chunk_type, content, section_heading, code_language, word_count, has_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  let totalDocs = 0, totalFailed = 0, totalSections = 0, totalCode = 0;
  const stats: { v: string; f: number; i: number; fa: number }[] = [];
  for (const version of FORGE_VERSIONS) {
    console.log(`\n=== ${version} ===`);
    const urls = await fetchSitemap(version);
    console.log(`Found ${urls.length} URLs`);
    let vd = 0, vf = 0;
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`[${i + 1}/${urls.length}] ${url}`);
      const html = await fetchPage(url);
      if (!html) { console.log("  FAIL"); vf++; totalFailed++; continue; }
      const p = parsePage(html, url, version);
      if (!p || p.sections.length === 0) { console.log("  NO CONTENT"); vf++; totalFailed++; continue; }
      const content = [p.description, ...p.sections.map(s => `## ${s.heading}\n${s.content}`)].join("\n\n");
      const hash = crypto.createHash("sha256").update(content).digest("hex");
      insertDoc.run(url, p.title, content.substring(0, 10000), p.category, version, hash);
      const docId = db.prepare("SELECT id FROM documents WHERE url = ?").get(url).id;
      insertChunk.run(docId + "-t", docId, "title", p.title, p.title, null, 0, 0);
      if (p.description) insertChunk.run(docId + "-d", docId, "description", p.description, "Description", null, 0, 0);
      for (const s of p.sections) {
        if (s.content.trim()) { insertChunk.run(docId + "-s" + totalSections, docId, "section", s.content.substring(0, 3000), s.heading, null, 0, 0); totalSections++; }
        for (const c of s.code) { insertChunk.run(docId + "-c" + totalCode, docId, "code", c.substring(0, 3000), p.title + " - " + s.heading, "java", c.split(/\s+/).length, 1); totalCode++; }
      }
      vd++; totalDocs++;
      console.log(`  OK: ${p.sections.length} sections, ${p.codeBlocks.length} code`);
    }
    stats.push({ v: version, f: urls.length, i: vd, fa: vf });
    console.log(`${version}: ${vd} OK, ${vf} failed`);
  }
  db.close();
  console.log(`\n=== DONE ===`);
  console.log("Version         Found  Indexed  Failed");
  console.log("-".repeat(45));
  stats.forEach(s => console.log(`${s.v.padEnd(15)}${String(s.f).padStart(6)}${String(s.i).padStart(8)}${String(s.fa).padStart(7)}`));
  const tf = stats.reduce((a, s) => a + s.f, 0);
  console.log("-".repeat(45));
  console.log(`TOTAL           ${String(tf).padStart(6)}${String(totalDocs).padStart(8)}${String(totalFailed).padStart(7)}`);
  console.log(`Chunks: ${totalSections} sections, ${totalCode} code`);
}
main().catch(console.error);
