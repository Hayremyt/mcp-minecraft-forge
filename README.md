# mcp-minecraft-forge

MCP server for Forge Minecraft modding documentation. Gives AI assistants direct access to Forge docs with structured search results.

## Features

- **Documentation Search**: Full-text search across all Forge versions (1.12.x - 1.21.x)
- **Structured Results**: Returns title, category, URL, and content preview
- **Code Examples**: Extracts code blocks separately for easy access
- **Multi-Version**: Supports 12 Forge versions
- **Auto-Indexed**: Documentation is automatically re-indexed weekly via GitHub Actions
- **Offline**: Works completely offline after initial indexing

## Database Stats

- **731 documents** across 12 Forge versions (1.12.x - 1.21.x)
- **4,536 searchable chunks** (titles, sections, code blocks)
- **1,750 code examples**
- **Database size**: ~12 MB

## Installation

### From NPM

```bash
npm install -g @hayrem_/mcp-minecraft-forge
```

### From GitHub

```bash
git clone https://github.com/Hayremyt/mcp-minecraft-forge.git
cd mcp-minecraft-forge
npm install -g
```

## Configure Your AI Client

Add to your MCP client configuration:

```json
{
  "mcp": {
    "forge": {
      "type": "local",
      "command": ["mcp-minecraft-forge"],
      "enabled": true
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `search_forge_docs` | Search Forge documentation with optional category and version filters |
| `get_example` | Get code examples for specific topics |
| `explain_forge_concept` | Get detailed explanation of Forge concepts |
| `list_forge_versions` | List all available Forge versions |
| `get_database_stats` | Get database statistics |

## Auto-Indexing

Documentation is automatically re-indexed every Sunday at 00:00 UTC via GitHub Actions.

Or locally:
```bash
npm run index-docs
```

## Project Structure

```
mcp-minecraft-forge/
├── .github/workflows/index-docs.yml  # Weekly auto-indexing
├── data/
│   └── forge-docs.db                 # SQLite database (10 MB)
├── dist/                             # Compiled JavaScript
├── src/
│   ├── index.ts                      # MCP server entry
│   ├── services/
│   │   ├── database.ts               # SQLite operations
│   │   └── search-service.ts         # Search logic
│   └── tools/                        # MCP tool handlers
├── scripts/
│   ├── index-docs.ts                 # Documentation indexer
│   └── postinstall.js                # Post-install script
└── package.json
```

## License

MIT
