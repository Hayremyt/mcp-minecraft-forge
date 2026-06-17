#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import https from 'https';
import os from 'os';

const APP_NAME = 'mcp-minecraft-forge';

function getDefaultDataDir() {
  if (process.env.FORGE_MCP_DATA_DIR) return process.env.FORGE_MCP_DATA_DIR;
  const platform = process.platform;
  if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, APP_NAME);
  }
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', APP_NAME);
  const xdgDataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(xdgDataHome, APP_NAME);
}

const dataDir = getDefaultDataDir();
const dbPath = path.join(dataDir, 'forge-docs.db');
const repoUrl = 'https://api.github.com/repos/Hayremyt/mcp-minecraft-forge/releases/latest';

console.log('=== MCP Minecraft Forge ===\n');

// Check if database already exists
if (fs.existsSync(dbPath)) {
  const size = fs.statSync(dbPath).size;
  console.log(`Database already exists (${(size / 1024 / 1024).toFixed(1)} MB)`);
  showConfig();
  process.exit(0);
}

console.log('Downloading Forge documentation database...\n');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const total = parseInt(response.headers['content-length'] || '0');
      let downloaded = 0;
      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0) {
          const progress = Math.round((downloaded / total) * 100);
          process.stdout.write(`\rProgress: ${progress}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
        }
      });
      response.pipe(file);
      file.on('finish', () => { file.close(); console.log('\nDownload complete!'); resolve(); });
    }).on('error', reject);
  });
}

async function main() {
  try {
    // Get latest release info from GitHub API
    const releaseInfo = await new Promise((resolve, reject) => {
      https.get(repoUrl, { headers: { 'User-Agent': 'forge-mcp-installer' } }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
        });
      }).on('error', reject);
    });

    // Find forge-docs.db asset
    const asset = releaseInfo.assets?.find(a => a.name === 'forge-docs.db');
    if (!asset) {
      console.log('Database not found in latest release.');
      console.log('Run locally: npm run index-docs');
      return;
    }

    console.log(`Found database: ${(asset.size / 1024 / 1024).toFixed(1)} MB`);
    console.log(`From release: ${releaseInfo.tag_name}\n`);

    // Download database
    await downloadFile(asset.browser_download_url, dbPath);

    const size = fs.statSync(dbPath).size;
    console.log(`\nDatabase installed: ${(size / 1024 / 1024).toFixed(1)} MB`);
    
  } catch (err) {
    console.error('\nDownload failed:', err.message);
    console.log('\nTo manually create the database:');
    console.log('  npm run index-docs');
  }
  
  showConfig();
}

function showConfig() {
  console.log('\n=== Configuration ===');
  console.log('Add to your opencode.jsonc:');
  console.log(JSON.stringify({
    mcp: {
      forge: {
        type: "local",
        command: ["mcp-minecraft-forge"],
        enabled: true
      }
    }
  }, null, 2));
}

main();
