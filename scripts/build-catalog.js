#!/usr/bin/env node
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const __dirname = import.meta.dirname || require('path').dirname(require('url').fileURLToPath(import.meta.url));

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const marketplacePath = path.join(rootDir, '.claude-plugin', 'marketplace.json');
const targetDirs = [
  path.join(rootDir, 'ui', 'public', 'api'),
  path.join(rootDir, 'src', 'ui', 'public', 'api'),
];

console.log('==> Building static UI catalog from marketplace.json...');

if (!fs.existsSync(marketplacePath)) {
  console.error(`[ERROR] Marketplace manifest not found at: ${marketplacePath}`);
  process.exit(1);
}

const marketplaceRaw = fs.readFileSync(marketplacePath, 'utf8');
const marketplace = JSON.parse(marketplaceRaw);

const enrichedPlugins = marketplace.plugins.map((plugin) => {
  let manifest = {};
  let localPathExists = false;
  let estimatedFiles = [];

  if (typeof plugin.source === 'string' && plugin.source.startsWith('./')) {
    const targetDir = path.join(rootDir, plugin.source.replace('./', ''));
    const pluginJsonPath = path.join(targetDir, '.claude-plugin', 'plugin.json');

    if (fs.existsSync(pluginJsonPath)) {
      localPathExists = true;
      try {
        manifest = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
      } catch (err) {
        console.warn(`[WARN] Failed to parse ${pluginJsonPath}: ${err.message}`);
      }
    }

    if (fs.existsSync(targetDir)) {
      estimatedFiles = fs.readdirSync(targetDir, { recursive: true });
    }
  }

  return {
    name: plugin.name,
    description: plugin.description || manifest.description || '',
    version: manifest.version || '1.0.0',
    author: manifest.author || marketplace.owner,
    source: plugin.source,
    isLocal: localPathExists,
    installCommand: `claude plugin install ${plugin.name}@${marketplace.name}`,
    fileCount: estimatedFiles.length,
  };
});

const catalog = {
  marketplaceName: marketplace.name,
  description: marketplace.description,
  owner: marketplace.owner,
  generatedAt: new Date().toISOString(),
  totalPlugins: enrichedPlugins.length,
  plugins: enrichedPlugins,
};

for (const dir of targetDirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const outputPath = path.join(dir, 'plugins.json');
  fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2), 'utf8');
  console.log(`==> Catalog successfully written to: ${outputPath}`);
}
