import { resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import os from 'os';

const PLUGINS_FILE = resolve(os.homedir(), '.toolforge', 'plugins.json');

export function loadPlugins() {
  if (!existsSync(PLUGINS_FILE)) {
    return [];
  }
  try {
    return JSON.parse(readFileSync(PLUGINS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

export function savePlugins(plugins) {
  const dir = resolve(os.homedir(), '.toolforge');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(PLUGINS_FILE, JSON.stringify(plugins, null, 2), 'utf8');
}

export default {
  command: 'plugins <action> [path]',
  describe: 'Manage Toolforge plugins',
  builder: (yargs) =>
    yargs
      .positional('action', {
        describe: 'Action to perform (add, list, remove)',
        type: 'string',
        choices: ['add', 'list', 'remove']
      })
      .positional('path', {
        describe: 'Path to plugin directory (required for add) or plugin ID (required for remove)',
        type: 'string'
      }),
  handler: async (argv) => {
    const { action, path } = argv;
    if (action === 'add') {
      if (!path) {
        console.error('✗ Path is required for add action');
        process.exit(1);
      }
      const requestedPath = resolve(path);
      if (!existsSync(requestedPath) || !statSync(requestedPath).isDirectory()) {
        console.error(`✗ Plugin directory not found: ${requestedPath}`);
        process.exit(1);
      }
      const pluginPath = realpathSync(requestedPath);
      const manifestPath = resolve(pluginPath, 'manifest.json');
      if (!existsSync(manifestPath)) {
        console.error(`✗ manifest.json not found at ${pluginPath}`);
        process.exit(1);
      }
      let manifest;
      try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      } catch (e) {
        console.error(`✗ Failed to parse manifest.json: ${e.message}`);
        process.exit(1);
      }
      if (!manifest.id || !manifest.name || !manifest.version || (!manifest.entrypoint && !manifest.main)) {
        console.error('✗ Invalid manifest.json: missing required fields (id, name, version, entrypoint/main)');
        process.exit(1);
      }

      const plugins = loadPlugins();
      const existingIndex = plugins.findIndex(p => p.id === manifest.id);
      const pluginEntry = {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        path: pluginPath,
        manifest
      };
      if (existingIndex >= 0) {
        plugins[existingIndex] = pluginEntry;
      } else {
        plugins.push(pluginEntry);
      }
      savePlugins(plugins);
      console.log(`✓ Successfully registered plugin ${manifest.name} (${manifest.id}) v${manifest.version}`);
    } else if (action === 'list') {
      const plugins = loadPlugins();
      if (plugins.length === 0) {
        console.log('No plugins registered.');
      } else {
        console.log('Registered Plugins:');
        plugins.forEach(p => {
          console.log(`- ${p.name} (${p.id}) v${p.version} at ${p.path}`);
        });
      }
    } else if (action === 'remove') {
      if (!path) {
        console.error('✗ Plugin ID is required to remove');
        process.exit(1);
      }
      let plugins = loadPlugins();
      const initialLength = plugins.length;
      plugins = plugins.filter(p => p.id !== path);
      if (plugins.length === initialLength) {
        console.error(`✗ Plugin ${path} not found`);
        process.exit(1);
      }
      savePlugins(plugins);
      console.log(`✓ Successfully removed plugin ${path}`);
    }
  }
};
