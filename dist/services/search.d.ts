import { DatabaseService } from "./database.js";
export interface SearchResult {
    title: string;
    url: string;
    content: string;
    category: string;
    minecraft_version: string;
    relevance: number;
}
export interface ExampleResult {
    title: string;
    code: string;
    language: string;
    description: string;
    source_url: string;
    minecraft_version: string;
}
export interface ConceptResult {
    concept: string;
    explanation: string;
    key_points: string[];
    related_topics: string[];
    sources: {
        title: string;
        url: string;
    }[];
}
export declare class SearchService {
    private db;
    constructor(db: DatabaseService);
    searchDocs(query: string, category?: string, version?: string): Promise<{
        results: SearchResult[];
        total: number;
        query: string;
    }>;
    getExamples(topic: string, language: string, version?: string): Promise<{
        examples: ExampleResult[];
        topic: string;
    }>;
    explainConcept(concept: string, version?: string): Promise<ConceptResult | null>;
}
