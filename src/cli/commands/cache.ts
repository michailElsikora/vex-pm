/**
 * Cache management commands
 */

import { CommandContext } from '../index';
import { Fetcher } from '../../core/fetcher';
import { ConfigLoader } from '../../config';
import { logger } from '../../utils/logger';
import { exists, readdir } from '../../utils/fs';
import * as path from 'path';
import * as fs from 'fs';

export async function cacheCommand(ctx: CommandContext): Promise<number> {
  const subcommand = ctx.args[0];
  const configLoader = new ConfigLoader({ cwd: ctx.cwd });
  const config = configLoader.load();

  const fetcher = new Fetcher({
    storeDir: config.storeDir,
    cacheDir: config.cacheDir,
  });

  switch (subcommand) {
    case 'list':
    case 'ls':
      return listCache(fetcher);

    case 'clean':
    case 'clear':
      return cleanCache(fetcher, ctx.args[1]);

    case 'path':
      return showPaths(fetcher);

    case 'size':
      return showSize(fetcher);

    default:
      return showHelp();
  }
}

function listCache(fetcher: Fetcher): number {
  const storeDir = fetcher.getStoreDirectory();
  
  if (!exists(storeDir)) {
    logger.info('Cache is empty');
    return 0;
  }

  const entries = readdir(storeDir);
  if (entries.length === 0) {
    logger.info('Cache is empty');
    return 0;
  }

  logger.info(`Cached packages (${entries.length}):\n`);

  // Group by package name
  const packages = new Map<string, string[]>();
  
  for (const entry of entries) {
    // Parse package name from entry (format: name@version_hash)
    const match = entry.match(/^(.+)@([^_]+)_/);
    if (match) {
      const name = match[1].replace(/\+/g, '/').replace(/^\+/, '@');
      const version = match[2];
      
      if (!packages.has(name)) {
        packages.set(name, []);
      }
      packages.get(name)!.push(version);
    }
  }

  // Sort and display
  const sortedNames = Array.from(packages.keys()).sort();
  for (const name of sortedNames) {
    const versions = packages.get(name)!.sort();
    logger.log(`  ${name}`);
    for (const version of versions) {
      logger.log(`    - ${version}`);
    }
  }

  logger.newline();
  logger.info(`Total: ${entries.length} package versions`);

  return 0;
}

function cleanCache(fetcher: Fetcher, target?: string): number {
  if (target === 'tarballs' || target === 'tar') {
    logger.info('Clearing tarball cache...');
    fetcher.clearCache();
    logger.success('Tarball cache cleared');
  } else if (target === 'store' || target === 'all') {
    logger.warn('This will remove all cached packages!');
    logger.info('Clearing store...');
    fetcher.clearStore();
    logger.info('Clearing tarball cache...');
    fetcher.clearCache();
    logger.success('All caches cleared');
  } else {
    logger.info('Clearing tarball cache...');
    fetcher.clearCache();
    logger.success('Tarball cache cleared');
    logger.info('Use "vex cache clean all" to also clear the store');
  }

  return 0;
}

function showPaths(fetcher: Fetcher): number {
  logger.info('Cache paths:\n');
  logger.log(`  Store:    ${fetcher.getStoreDirectory()}`);
  logger.log(`  Tarballs: ${fetcher.getCacheDirectory()}`);
  return 0;
}

function showSize(fetcher: Fetcher): number {
  const storeSize = fetcher.getStoreSize();
  const cacheDir = fetcher.getCacheDirectory();
  
  let tarballSize = 0;
  if (exists(cacheDir)) {
    tarballSize = getDirSize(cacheDir);
  }

  logger.info('Cache size:\n');
  logger.log(`  Store:    ${formatSize(storeSize)}`);
  logger.log(`  Tarballs: ${formatSize(tarballSize)}`);
  logger.log(`  Total:    ${formatSize(storeSize + tarballSize)}`);

  return 0;
}

function getDirSize(dir: string): number {
  let size = 0;
  
  try {
    const stat = fs.statSync(dir);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        size += getDirSize(path.join(dir, entry));
      }
    } else {
      size = stat.size;
    }
  } catch {
    // Ignore errors
  }

  return size;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function showHelp(): number {
  logger.log(`
Usage: vex cache <command>

Commands:
  list, ls      List all cached packages
  size          Show cache size
  path          Show cache directory paths
  clean         Clear tarball cache
  clean all     Clear all caches (store + tarballs)

Examples:
  vex cache list
  vex cache size
  vex cache clean
  vex cache clean all
`);
  return 0;
}

