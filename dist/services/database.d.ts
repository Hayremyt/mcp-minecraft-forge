export interface Document {
    id: number;
    url: string;
    title: string;
    content: string;
    category: string;
    minecraft_version: string;
    hash: string;
}
export interface Chunk {
    id: string;
    document_id: number;
    chunk_type: string;
    content: string;
    section_heading: string;
    code_language: string | null;
    word_count: number;
    has_code: number;
}
export declare class DatabaseService {
    private SQL;
    private db;
    initialize(): Promise<void>;
    private save;
    private createTables;
    searchDocs(query: string, category?: string, version?: string): Document[];
    getVersions(): string[];
    getVersionStats(): {
        version: string;
        count: number;
    }[];
    insertDocument(doc: Omit<Document, "id">): void;
    insertChunk(chunk: Chunk): void;
}
