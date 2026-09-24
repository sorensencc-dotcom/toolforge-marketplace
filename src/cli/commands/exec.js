import { resolve, relative, isAbsolute } from 'node:path';
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import os from 'os';
import { pathToFileURL } from 'node:url';

const PLUGINS_FILE = resolve(os.homedir(), '.toolforge', 'plugins.json');

function loadPlugins() {
  if (!existsSync(PLUGINS_FILE)) {
    return [];
  }
  try {
    return JSON.parse(readFileSync(PLUGINS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

export async function executePluginCommand(plugin, commandName, positionalArgs) {
  const manifest = plugin.manifest;
  if (!manifest.commands || !manifest.commands[commandName]) {
    throw new Error(`Command '${commandName}' not found in plugin '${plugin.id}'`);
  }
  const commandDef = manifest.commands[commandName];
  const argsObj = {};

  if (commandDef.argsSchema === 'v1' && commandDef.args) {
    commandDef.args.forEach((arg, index) => {
      if (positionalArgs[index] !== undefined) {
        argsObj[arg.name] = positionalArgs[index];
      } else if (arg.required) {
        throw new Error(`Missing required argument: ${arg.name} (${arg.description || ''})`);
      }
    });
  } else {
    argsObj._ = positionalArgs;
  }

  // Load entry point
  const entrypoint = manifest.entrypoint || manifest.main;
  if (!entrypoint) {
    throw new Error(`No entrypoint or main file defined in manifest for plugin '${plugin.id}'`);
  }
  const entryPath = resolve(plugin.path, entrypoint);
  if (!existsSync(entryPath)) {
    throw new Error(`Entry point file not found at ${entryPath}`);
  }
  const realPluginRoot = realpathSync(plugin.path);
  const realEntryPath = realpathSync(entryPath);
  const rel = relative(realPluginRoot, realEntryPath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Entry point ${entrypoint} escapes plugin directory ${plugin.path}`);
  }

  // Import the module dynamically using file:// URL for cross-platform Node ESM
  const moduleUrl = pathToFileURL(realEntryPath).href;
  const module = await import(moduleUrl);
  if (typeof module[commandName] !== 'function') {
    throw new Error(`Exported function '${commandName}' not found in entry point ${entrypoint}`);
  }

  return await module[commandName](argsObj);
}

export default {
  command: 'exec <plugin-id> <command-name> [args..]',
  describe: 'Execute a plugin command',
  builder: (yargs) =>
    yargs
      .positional('plugin-id', {
        describe: 'Plugin ID',
        type: 'string'
      })
      .positional('command-name', {
        describe: 'Command name to run',
        type: 'string'
      })
      .positional('args', {
        describe: 'Arguments for the command',
        type: 'string',
        array: true
      }),
  handler: async (argv) => {
    const { pluginId, commandName, args } = argv;
    const plugins = loadPlugins();
    const plugin = plugins.find(p => p.id === pluginId);
    if (!plugin) {
      console.error(`✗ Plugin '${pluginId}' not found`);
      process.exit(1);
    }
    try {
      const result = await executePluginCommand(plugin, commandName, args || []);
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error(`✗ Execution failed: ${e.message || e}`);
      if (e.stack) {
        console.error(e.stack);
      }
      process.exit(1);
    }
  }
};
