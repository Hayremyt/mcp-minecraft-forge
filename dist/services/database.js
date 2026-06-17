import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
const DB_PATH = path.resolve(process.cwd(), "data/forge-docs.db");
export class DatabaseService {
    db = null;
    async initialize() {
        const dbDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dbDir))
            fs.mkdirSync(dbDir, { recursive: true });
        this.db = new Database(DB_PATH);
        this.db.pragma("journal_mode = WAL");
        this.createTables();
    }
    createTables() {
        if (!this.db)
            return;
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        minecraft_version TEXT NOT NULL,
        hash TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id INTEGER NOT NULL,
        chunk_type TEXT NOT NULL,
        content TEXT NOT NULL,
        section_heading TEXT,
        code_language TEXT,
        word_count INTEGER,
        has_code INTEGER DEFAULT 0
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(title, content, content='documents', content_rowid='id');
      CREATE INDEX IF NOT EXISTS idx_documents_version ON documents(minecraft_version);
      CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
    `);
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
        return this.db.prepare(sql).all(...params);
    }
    async getVersions() {
        if (!this.db)
            return [];
        const result = this.db.prepare("SELECT DISTINCT minecraft_version FROM documents ORDER BY minecraft_version DESC").all();
        return result.map(r => r.minecraft_version);
    }
    async getVersionStats() {
        if (!this.db)
            return [];
        return this.db.prepare("SELECT minecraft_version, COUNT(*) as count FROM documents GROUP BY minecraft_version ORDER BY minecraft_version DESC").all();
    }
    insertDocument(doc) {
        if (!this.db)
            return;
        this.db.prepare("INSERT OR REPLACE INTO documents (url, title, content, category, minecraft_version, hash) VALUES (?, ?, ?, ?, ?, ?)")
            .run(doc.url, doc.title, doc.content, doc.category, doc.minecraft_version, doc.hash);
    }
    insertChunk(chunk) {
        if (!this.db)
            return;
        this.db.prepare("INSERT OR REPLACE INTO chunks (id, document_id, chunk_type, content, section_heading, code_language, word_count, has_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            .run(chunk.id, chunk.document_id, chunk.chunk_type, chunk.content, chunk.section_heading, chunk.code_language, chunk.word_count, chunk.has_code);
    }
}
