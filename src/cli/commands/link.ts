/**
 * Link command - links local package globally or links global package locally
 */

import * as path from 'path';
import * as fs from 'fs';
import { CommandContext } from '../index';
import { ConfigLoader } from '../../config';
import { exists, mkdirp, symlink, rmrf, readdir } from '../../utils/fs';
import { getStoreDir } from '../../utils/platform';
import { logger } from '../../utils/logger';

/**
 * Get global links directory
 */
function getLinksDir(): string {
  return path.join(getStoreDir(), 'links');
}

/**
 * Get global bin directory
 */
function getGlobalBinDir(): string {
  return path.join(getStoreDir(), 'bin');
}

/**
 * Link current package globally (vex link)
 * or link a global package locally (vex link <package>)
 */
export async function linkCommand(ctx: CommandContext): Promise<number> {
  const packageName = ctx.positionals[0];
  
  if (packageName) {
    // Link a global package to local node_modules
    return linkPackageLocally(ctx, packageName);
  } else {
    // Link current package globally
    return linkCurrentPackageGlobally(ctx);
  }
}

/**
 * Link current package to global links
 */
async function linkCurrentPackageGlobally(ctx: CommandContext): Promise<number> {
  const configLoader = new ConfigLoader({ cwd: ctx.cwd });
  const packageJson = configLoader.getPackageJson();
  
  if (!packageJson) {
    logger.error('No package.json found in current directory');
    return 1;
  }
  
  if (!packageJson.name) {
    logger.error('Package name is required in package.json');
    return 1;
  }
  
  const linksDir = getLinksDir();
  mkdirp(linksDir);
  
  // Handle scoped packages
  const linkPath = path.join(linksDir, packageJson.name);
  const linkParent = path.dirname(linkPath);
  
  if (linkParent !== linksDir) {
    mkdirp(linkParent);
  }
  
  // Remove existing link
  if (exists(linkPath)) {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      rmrf(linkPath);
    }
  }
  
  // Create symlink to current directory
  symlink(ctx.cwd, linkPath);
  
  // Link binaries globally
  if (packageJson.bin) {
    const globalBinDir = getGlobalBinDir();
    mkdirp(globalBinDir);
    
    const bins = typeof packageJson.bin === 'string'
      ? { [packageJson.name.split('/').pop()!]: packageJson.bin }
      : packageJson.bin;
    
    for (const [binName, binPath] of Object.entries(bins)) {
      const srcPath = path.join(ctx.cwd, binPath);
      const destPath = path.join(globalBinDir, binName);
      
      if (exists(destPath)) {
        fs.unlinkSync(destPath);
      }
      
      if (exists(srcPath)) {
        symlink(srcPath, destPath);
        try {
          fs.chmodSync(srcPath, 0o755);
        } catch {
          // Ignore chmod errors
        }
        logger.log(`  Binary: ${binName} -> ${srcPath}`);
      }
    }
    
    logger.newline();
    logger.log(`Add to your shell profile:`);
    logger.log(`  export PATH="${globalBinDir}:$PATH"`);
  }
  
  logger.success(`Linked ${packageJson.name} -> ${ctx.cwd}`);
  logger.log(`Use 'vex link ${packageJson.name}' in other projects to use this package`);
  
  return 0;
}

/**
 * Link a global package to local node_modules
 */
async function linkPackageLocally(ctx: CommandContext, packageName: string): Promise<number> {
  const linksDir = getLinksDir();
  const globalLinkPath = path.join(linksDir, packageName);
  
  if (!exists(globalLinkPath)) {
    logger.error(`Package ${packageName} is not linked globally`);
    logger.log(`Run 'vex link' in the package directory first`);
    return 1;
  }
  
  // Resolve the actual path
  const realPath = fs.realpathSync(globalLinkPath);
  
  // Create local node_modules symlink
  const nodeModulesDir = path.join(ctx.cwd, 'node_modules');
  mkdirp(nodeModulesDir);
  
  const localLinkPath = path.join(nodeModulesDir, packageName);
  const localLinkParent = path.dirname(localLinkPath);
  
  if (localLinkParent !== nodeModulesDir) {
    mkdirp(localLinkParent);
  }
  
  // Remove existing
  if (exists(localLinkPath)) {
    rmrf(localLinkPath);
  }
  
  // Create symlink
  symlink(realPath, localLinkPath);
  
  logger.success(`Linked ${packageName} -> ${realPath}`);
  
  return 0;
}

/**
 * Unlink command - removes link
 */
export async function unlinkCommand(ctx: CommandContext): Promise<number> {
  const packageName = ctx.positionals[0];
  
  if (packageName) {
    // Unlink from local node_modules
    const localLinkPath = path.join(ctx.cwd, 'node_modules', packageName);
    
    if (exists(localLinkPath)) {
      const stat = fs.lstatSync(localLinkPath);
      if (stat.isSymbolicLink()) {
        fs.unlinkSync(localLinkPath);
        logger.success(`Unlinked ${packageName} from node_modules`);
      } else {
        logger.warn(`${packageName} is not a symlink, skipping`);
      }
    } else {
      logger.warn(`${packageName} is not linked locally`);
    }
  } else {
    // Unlink current package from global
    const configLoader = new ConfigLoader({ cwd: ctx.cwd });
    const packageJson = configLoader.getPackageJson();
    
    if (!packageJson?.name) {
      logger.error('No package.json found or package name missing');
      return 1;
    }
    
    const linksDir = getLinksDir();
    const linkPath = path.join(linksDir, packageJson.name);
    
    if (exists(linkPath)) {
      rmrf(linkPath);
      logger.success(`Unlinked ${packageJson.name} from global links`);
    } else {
      logger.warn(`${packageJson.name} is not linked globally`);
    }
  }
  
  return 0;
}

/**
 * List all global links
 */
export async function linksCommand(ctx: CommandContext): Promise<number> {
  const linksDir = getLinksDir();
  
  if (!exists(linksDir)) {
    logger.log('No packages linked globally');
    return 0;
  }
  
  const links: Array<{ name: string; target: string }> = [];
  
  function scanDir(dir: string, prefix: string = ''): void {
    const entries = readdir(dir);
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const name = prefix ? `${prefix}/${entry}` : entry;
      
      try {
        const stat = fs.lstatSync(fullPath);
        
        if (stat.isSymbolicLink()) {
          const target = fs.realpathSync(fullPath);
          links.push({ name, target });
        } else if (stat.isDirectory() && entry.startsWith('@')) {
          // Scoped package directory
          scanDir(fullPath, entry);
        }
      } catch {
        // Ignore errors
      }
    }
  }
  
  scanDir(linksDir);
  
  if (links.length === 0) {
    logger.log('No packages linked globally');
    return 0;
  }
  
  logger.log('Globally linked packages:');
  for (const link of links) {
    logger.log(`  ${link.name} -> ${link.target}`);
  }
  
  return 0;
}

