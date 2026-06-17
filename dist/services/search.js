export class SearchService {
    db;
    constructor(db) {
        this.db = db;
    }
    async searchDocs(query, category, version) {
        const documents = this.db.searchDocs(query, category, version);
        const results = documents.map((doc, index) => ({
            title: doc.title,
            url: doc.url,
            content: doc.content.substring(0, 500) + "...",
            category: doc.category,
            minecraft_version: doc.minecraft_version,
            relevance: Math.max(100 - index * 5, 10),
        }));
        return { results, total: results.length, query };
    }
    async getExamples(topic, language, version) {
        const documents = this.db.searchDocs(`${topic} ${language}`, undefined, version);
        const examples = [];
        for (const doc of documents) {
            const codeBlocks = doc.content.match(/```[\s\S]*?```/g) || [];
            for (const code of codeBlocks) {
                const cleanCode = code.replace(/```\w*\n?/g, "").trim();
                if (cleanCode.length > 20) {
                    examples.push({
                        title: doc.title,
                        code: cleanCode,
                        language: language,
                        description: doc.content.substring(0, 200),
                        source_url: doc.url,
                        minecraft_version: doc.minecraft_version,
                    });
                }
            }
        }
        return { examples, topic };
    }
    async explainConcept(concept, version) {
        const documents = this.db.searchDocs(concept, undefined, version);
        if (documents.length === 0)
            return null;
        const mainDoc = documents[0];
        const key_points = [];
        const lines = mainDoc.content.split("\n");
        for (const line of lines) {
            const trimmed = line.trim();
            if ((trimmed.startsWith("- ") || trimmed.startsWith("* ")) && trimmed.length > 10) {
                key_points.push(trimmed.substring(2));
            }
        }
        return {
            concept,
            explanation: mainDoc.content.substring(0, 1000),
            key_points: key_points.slice(0, 10),
            related_topics: documents.slice(1, 5).map(d => d.title),
            sources: documents.slice(0, 3).map(d => ({ title: d.title, url: d.url })),
        };
    }
}
