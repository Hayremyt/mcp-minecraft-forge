import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { initSqlJs } = require("fts5-sql-bundle");
const DB_PATH = path.resolve(process.cwd(), "data/forge-docs.db");
export class DatabaseService {
    SQL = null;
    db = null;
    async initialize() {
        const dbDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dbDir))
            fs.mkdirSync(dbDir, { recursive: true });
        this.SQL = await initSqlJs();
        if (fs.existsSync(DB_PATH)) {
            const buffer = fs.readFileSync(DB_PATH);
            this.db = new this.SQL.Database(new Uint8Array(buffer));
        }
        else {
            this.db = new this.SQL.Database();
            this.createTables();
            this.save();
        }
    }
    save() {
        if (!this.db)
            return;
        const data = this.db.export();
        fs.writeFileSync(DB_PATH, Buffer.from(data));
    }
    createTables() {
        if (!this.db)
            return;
        this.db.run(`CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      minecraft_version TEXT NOT NULL,
      hash TEXT NOT NULL
    );`);
        this.db.run(`CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      document_id INTEGER NOT NULL,
      chunk_type TEXT NOT NULL,
      content TEXT NOT NULL,
      section_heading TEXT,
      code_language TEXT,
      word_count INTEGER,
      has_code INTEGER DEFAULT 0
    );`);
        this.db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(title, content, content='documents', content_rowid='id');`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_documents_version ON documents(minecraft_version);`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);`);
        // Triggers to keep FTS5 in sync
        this.db.run(`CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
      INSERT INTO documents_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
    END;`);
        this.db.run(`CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
    END;`);
        this.db.run(`CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
      INSERT INTO documents_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
    END;`);
    }
    searchDocs(query, category, version) {
        if (!this.db)
            return [];
        let sql = `SELECT d.* FROM documents d JOIN documents_fts fts ON d.id = fts.rowid WHERE documents_fts MATCH ?`;
        const params = [query];
        if (category) {
            sql += " AND d.category = ?";
            params.push(category);
        }
        if (version) {
            sql += " AND d.minecraft_version = ?";
            params.push(version);
        }
        sql += " ORDER BY fts.rank LIMIT 20";
        const results = [];
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        while (stmt.step()) {
            const row = stmt.getAsObject();
            results.push({
                id: row.id,
                url: row.url,
                title: row.title,
                content: row.content,
                category: row.category,
                minecraft_version: row.minecraft_version,
                hash: row.hash,
            });
        }
        stmt.free();
        return results;
    }
    getVersions() {
        if (!this.db)
            return [];
        const results = this.db.exec("SELECT DISTINCT minecraft_version FROM documents ORDER BY minecraft_version DESC");
        if (results.length === 0)
            return [];
        return results[0].values.map((row) => row[0]);
    }
    getVersionStats() {
        if (!this.db)
            return [];
        const results = this.db.exec("SELECT minecraft_version, COUNT(*) as count FROM documents GROUP BY minecraft_version ORDER BY minecraft_version DESC");
        if (results.length === 0)
            return [];
        return results[0].values.map((row) => ({
            version: row[0],
            count: row[1],
        }));
    }
    insertDocument(doc) {
        if (!this.db)
            return;
        this.db.run("INSERT OR REPLACE INTO documents (url, title, content, category, minecraft_version, hash) VALUES (?, ?, ?, ?, ?, ?)", [doc.url, doc.title, doc.content, doc.category, doc.minecraft_version, doc.hash]);
        this.save();
    }
    insertChunk(chunk) {
        if (!this.db)
            return;
        this.db.run("INSERT OR REPLACE INTO chunks (id, document_id, chunk_type, content, section_heading, code_language, word_count, has_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [chunk.id, chunk.document_id, chunk.chunk_type, chunk.content, chunk.section_heading, chunk.code_language, chunk.word_count, chunk.has_code]);
        this.save();
    }
}
