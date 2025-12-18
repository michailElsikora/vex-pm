/**
 * Config command - manage vex configuration
 */

import * as fs from 'fs';
import * as path from 'path';
import { CommandContext } from '../index';
import { logger } from '../../utils/logger';
import { exists, mkdirp } from '../../utils/fs';

interface VexConfig {
  registry?: string;
  tokens?: Record<string, string>;
  token?: string;
  [key: string]: unknown;
}

const VALID_KEYS = [
  'registry',
  'store-dir',
  'cache-dir',
  'concurrency',
  'offline',
  'prefer-offline',
  'auto-install-peers',
  'shamefully-hoist',
  'strict-peer-dependencies',
  'ignore-scripts',
];

export async function configCommand(ctx: CommandContext): Promise<number> {
  const subcommand = ctx.positionals[0];
  const key = ctx.positionals[1];
  const value = ctx.positionals[2];

  switch (subcommand) {
    case 'get':
      return configGet(key);
    case 'set':
      return configSet(key, value);
    case 'delete':
    case 'rm':
      return configDelete(key);
    case 'list':
    case 'ls':
      return configList();
    default:
      if (subcommand && !['get', 'set', 'delete', 'rm', 'list', 'ls'].includes(subcommand)) {
        // Treat as "get" shorthand: vex config registry
        return configGet(subcommand);
      }
      return configList();
  }
}

function configGet(key?: string): number {
  const config = loadConfig();
  
  if (!key) {
    logger.error('Usage: vex config get <key>');
    return 1;
  }

  const value = config[key];
  if (value !== undefined) {
    if (typeof value === 'object') {
      logger.log(JSON.stringify(value, null, 2));
    } else {
      logger.log(String(value));
    }
  }
  
  return 0;
}

function configSet(key?: string, value?: string): number {
  if (!key || value === undefined) {
    logger.error('Usage: vex config set <key> <value>');
    return 1;
  }

  const config = loadConfig();
  
  // Parse value
  let parsedValue: unknown = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (!isNaN(Number(value))) parsedValue = Number(value);
  
  config[key] = parsedValue;
  saveConfig(config);
  
  logger.success(`Set ${key} = ${value}`);
  return 0;
}

function configDelete(key?: string): number {
  if (!key) {
    logger.error('Usage: vex config delete <key>');
    return 1;
  }

  const config = loadConfig();
  
  if (config[key] !== undefined) {
    delete config[key];
    saveConfig(config);
    logger.success(`Deleted ${key}`);
  } else {
    logger.warn(`Key "${key}" not found`);
  }
  
  return 0;
}

function configList(): number {
  const config = loadConfig();
  const configPath = getConfigPath();
  
  logger.log(`Config: ${configPath}`);
  logger.newline();
  
  if (Object.keys(config).length === 0) {
    logger.log('No configuration set');
    return 0;
  }

  for (const [key, value] of Object.entries(config)) {
    if (key === 'tokens') {
      // Hide token values
      const tokens = value as Record<string, string>;
      for (const registry of Object.keys(tokens)) {
        logger.log(`tokens.${registry} = ****`);
      }
    } else if (typeof value === 'object') {
      logger.log(`${key} = ${JSON.stringify(value)}`);
    } else {
      logger.log(`${key} = ${value}`);
    }
  }

  return 0;
}

function loadConfig(): VexConfig {
  const configPath = getConfigPath();
  
  if (!exists(configPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

function saveConfig(config: VexConfig): void {
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);
  
  mkdirp(configDir);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function getConfigPath(): string {
  return path.join(process.env.HOME || '', '.vexrc');
}

