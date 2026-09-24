#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import installCmd from './commands/install.js';
import listCmd from './commands/list.js';
import searchCmd from './commands/search.js';
import pluginsCmd from './commands/plugins.js';
import execCmd from './commands/exec.js';

// Intercept dynamic plugin namespace commands
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import os from 'os';

const args = process.argv.slice(2);
const firstArg = args[0];
const builtInCommands = ['install', 'list', 'search', 'plugins', 'exec', '-h', '--help', '-v', '--verbose', '--version'];

if (firstArg && !builtInCommands.includes(firstArg) && !firstArg.startsWith('-')) {
  const namespace = firstArg;
  const commandName = args[1];
  const commandArgs = args.slice(2);
  const PLUGINS_FILE = resolve(os.homedir(), '.toolforge', 'plugins.json');

  let plugins = [];
  if (existsSync(PLUGINS_FILE)) {
    try {
      plugins = JSON.parse(readFileSync(PLUGINS_FILE, 'utf8'));
    } catch {
      // corrupt/missing plugins.json -> treat as no plugins installed
    }
  }

  const plugin = plugins.find(p => {
    const parts = p.id.split(/[-.]/);
    return parts.includes(namespace) || p.id === namespace;
  });

  // Dynamic command routing guard
  if (!plugin) {
    console.error(`✗ Unknown command or plugin namespace: '${namespace}'`);
    yargs(hideBin(process.argv))
      .command(installCmd)
      .command(listCmd)
      .command(searchCmd)
      .command(pluginsCmd)
      .command(execCmd)
      .showHelp();
    process.exit(1);
  }

  if (!commandName) {
    console.error(`✗ Command name missing for plugin namespace '${namespace}'`);
    process.exit(1);
  }

  try {
    const { executePluginCommand } = await import('./commands/exec.js');
    const result = await executePluginCommand(plugin, commandName, commandArgs);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(`✗ Execution failed: ${e.message}`);
    process.exit(1);
  }
}

yargs(hideBin(process.argv))
  .command(installCmd)
  .command(listCmd)
  .command(searchCmd)
  .command(pluginsCmd)
  .command(execCmd)
  .option('api-url', {
    describe: 'Marketplace API URL',
    default: 'http://localhost:3000',
    global: true,
  })
  .option('verbose', {
    describe: 'Enable verbose output',
    boolean: true,
    alias: 'v',
    global: true,
  })
  .demandCommand()
  .help()
  .alias('h', 'help')
  .parse();
