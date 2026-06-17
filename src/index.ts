#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { DatabaseService } from "./services/database.js";
import { SearchService } from "./services/search.js";

const server = new Server(
  { name: "forge-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

const dbService = new DatabaseService();
const searchService = new SearchService(dbService);

const TOOLS: Tool[] = [
  {
    name: "search_forge_docs",
    description: "Search Forge Minecraft modding documentation with FTS5 full-text search.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        category: { type: "string", description: "Filter by category" },
        minecraft_version: { type: "string", description: "Filter by version" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_example",
    description: "Get code examples for Forge modding topics.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic" },
        language: { type: "string", description: "Language", default: "java" },
        minecraft_version: { type: "string", description: "Version" },
      },
      required: ["topic"],
    },
  },
  {
    name: "explain_forge_concept",
    description: "Get detailed explanation of Forge concepts.",
    inputSchema: {
      type: "object",
      properties: {
        concept: { type: "string", description: "Concept to explain" },
      },
      required: ["concept"],
    },
  },
  {
    name: "list_forge_versions",
    description: "List all available Forge versions.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_database_stats",
    description: "Get database statistics.",
    inputSchema: { type: "object", properties: {} },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "search_forge_docs": {
        const query = args?.query as string;
        const category = args?.category as string | undefined;
        const version = args?.minecraft_version as string | undefined;
        const results = await searchService.searchDocs(query, category, version);
        if (results.results.length === 0) {
          return { content: [{ type: "text", text: `No results for "${query}".` }] };
        }
        const formatted = results.results.map((r, i) =>
          `## ${i + 1}. ${r.title} (${r.minecraft_version})\n**Category:** ${r.category}\n**URL:** ${r.url}\n\n${r.content}\n`
        ).join("\n---\n\n");
        return { content: [{ type: "text", text: `Found ${results.total} results:\n\n${formatted}` }] };
      }

      case "get_example": {
        const topic = args?.topic as string;
        const language = (args?.language as string) || "java";
        const version = args?.minecraft_version as string | undefined;
        const results = await searchService.getExamples(topic, language, version);
        if (results.examples.length === 0) {
          return { content: [{ type: "text", text: `No examples for "${topic}".` }] };
        }
        const formatted = results.examples.map((ex, i) =>
          `## ${i + 1}. ${ex.title}\n\`\`\`${ex.language}\n${ex.code}\n\`\`\`\n`
        ).join("\n---\n\n");
        return { content: [{ type: "text", text: `Found ${results.examples.length} examples:\n\n${formatted}` }] };
      }

      case "explain_forge_concept": {
        const concept = args?.concept as string;
        const version = args?.minecraft_version as string | undefined;
        const results = await searchService.explainConcept(concept, version);
        if (!results) {
          return { content: [{ type: "text", text: `Concept "${concept}" not found.` }] };
        }
        return { content: [{ type: "text", text: `# ${results.concept}\n\n${results.explanation}\n\n## Key Points\n${results.key_points.map(p => `- ${p}`).join("\n")}` }] };
      }

      case "list_forge_versions": {
        const versions = await dbService.getVersions();
        return { content: [{ type: "text", text: `Available versions:\n${versions.map(v => `- ${v}`).join("\n")}` }] };
      }

      case "get_database_stats": {
        const stats = await dbService.getVersionStats();
        return { content: [{ type: "text", text: stats.map(s => `${s.version}: ${s.count} documents`).join("\n") }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
});

async function main() {
  await dbService.initialize();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Forge MCP Server v0.1.0 running on stdio");
}

main().catch(console.error);
