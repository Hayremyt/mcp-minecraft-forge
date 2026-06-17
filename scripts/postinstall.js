#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import https from 'https';
import os from 'os';
import { createRequire } from 'module';

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

const dataDir = getDefaultDataDir();
const dbPath = path.join(dataDir, 'forge-docs.db');

console.log('=== MCP Minecraft Forge ===\n');

// Check if database already exists and has content
if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 1000) {
  const size = fs.statSync(dbPath).size;
  console.log(`Database already exists (${(size / 1024 / 1024).toFixed(1)} MB)`);
  showConfig();
  process.exit(0);
}

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// 1. Try to copy from package
try {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve('@hayrem_/mcp-minecraft-forge/package.json');
  const sourceDb = path.join(path.dirname(pkgPath), 'data', 'forge-docs.db');

  if (fs.existsSync(sourceDb) && fs.statSync(sourceDb).size > 1000) {
    fs.copyFileSync(sourceDb, dbPath);
    const size = fs.statSync(dbPath).size;
    console.log(`Database installed from package (${(size / 1024 / 1024).toFixed(1)} MB)`);
  }
} catch {}

// 2. Try to download from GitHub release (might be newer)
if (fs.existsSync(dbPath)) {
  console.log('Checking for newer version in GitHub release...');
}

try {
  const apiUrl = 'https://api.github.com/repos/Hayremyt/mcp-minecraft-forge/releases/latest';
  const releaseInfo = await new Promise((resolve, reject) => {
    https.get(apiUrl, { headers: { 'User-Agent': 'forge-mcp-installer' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });

  const asset = releaseInfo.assets?.find((a) => a.name === 'forge-docs.db');
  if (asset) {
    console.log(`Found in release: ${(asset.size / 1024 / 1024).toFixed(1)} MB (${releaseInfo.tag_name})`);
    await downloadFile(asset.browser_download_url, dbPath);
    console.log(`Database updated (${(fs.statSync(dbPath).size / 1024 / 1024).toFixed(1)} MB)`);
  } else {
    console.log('No database in release, using package version.');
  }
} catch (err) {
  console.log('Could not check release, using package version.');
}

showConfig();
