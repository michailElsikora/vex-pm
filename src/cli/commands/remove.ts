/**
 * Remove command - removes packages from dependencies
 */

import * as path from 'path';
import { CommandContext } from '../index';
import { ConfigLoader } from '../../config';
import { Resolver } from '../../core/resolver';
import { Fetcher } from '../../core/fetcher';
import { Linker } from '../../core/linker';
import { LockfileManager } from '../../core/lockfile';
import { DependencyType } from '../../types/package';
import { logger } from '../../utils/logger';
import { rmrf, exists } from '../../utils/fs';
import { ProgressTracker } from '../../utils/progress';

export async function removeCommand(ctx: CommandContext): Promise<number> {
  if (ctx.positionals.length === 0) {
    logger.error('No packages specified');
    logger.log('Usage: vex remove <packages...>');
    return 1;
  }

  const configLoader = new ConfigLoader({ cwd: ctx.cwd, configPath: ctx.configPath });
  const config = configLoader.load();

  // Load package.json
  let packageJson = configLoader.getPackageJson();
  if (!packageJson) {
    logger.error('No package.json found');
    return 1;
  }

  logger.info(`Removing ${ctx.positionals.length} package(s)...`);
  const timer = logger.timer();

  const removed: string[] = [];
  const notFound: string[] = [];
  packageJson = { ...packageJson };

  // Remove from all dependency types
  const depTypes: DependencyType[] = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ];

  for (const pkgName of ctx.positionals) {
    let found = false;

    for (const depType of depTypes) {
      if (packageJson[depType]?.[pkgName]) {
        delete packageJson[depType]![pkgName];
        
        // Remove empty objects
        if (Object.keys(packageJson[depType]!).length === 0) {
          delete packageJson[depType];
        }
        
        found = true;
        logger.debug(`Removed ${pkgName} from ${depType}`);
      }
    }

    if (found) {
      removed.push(pkgName);
    } else {
      notFound.push(pkgName);
    }
  }

  if (notFound.length > 0) {
    for (const pkg of notFound) {
      logger.warn(`Package ${pkg} not found in dependencies`);
    }
  }

  if (removed.length === 0) {
    logger.warn('No packages were removed');
    return 0;
  }

  // Save package.json
  configLoader.savePackageJson(packageJson);
  logger.success('Updated package.json');

  // Remove from node_modules directly for immediate cleanup
  const nodeModulesDir = path.join(ctx.cwd, 'node_modules');
  for (const pkgName of removed) {
    const pkgPath = path.join(nodeModulesDir, pkgName);
    if (exists(pkgPath)) {
      rmrf(pkgPath);
    }
  }

  // Re-resolve and relink to clean up orphaned dependencies
  const hasDeps = packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0;
  const hasDevDeps = packageJson.devDependencies && Object.keys(packageJson.devDependencies).length > 0;

  if (hasDeps || hasDevDeps) {
    logger.newline();
    logger.info('Updating dependencies...');

    const resolver = new Resolver({
      registry: config.registry,
      token: config.authToken,
      production: false,
      preferOffline: config.preferOffline,
      autoInstallPeers: config.autoInstallPeers,
    });

    try {
      const result = await resolver.resolve(packageJson);
      
      if (result.errors.length > 0) {
        for (const error of result.errors) {
          logger.error(error);
        }
        return 1;
      }

      // Fetch (most should be cached)
      const fetcher = new Fetcher({
        registry: config.registry,
        token: config.authToken,
        storeDir: config.storeDir,
        cacheDir: config.cacheDir,
        concurrency: config.concurrency,
      });

      const progress = new ProgressTracker(ctx.silent);
      const packages = Array.from(result.flat.values());
      const fetchResults = await fetcher.fetchAll(packages, progress);
      progress.finish();

      // Relink
      const linker = new Linker(ctx.cwd);
      await linker.link(result.flat, fetchResults);

      // Update lockfile
      const lockfileManager = new LockfileManager({ cwd: ctx.cwd });
      lockfileManager.write(result.flat, packageJson);

    } catch (error) {
      logger.error(`Failed to update dependencies: ${error}`);
      return 1;
    }
  } else {
    // No dependencies left, clean node_modules
    if (exists(nodeModulesDir)) {
      rmrf(nodeModulesDir);
    }

    // Remove lockfile
    const lockfileManager = new LockfileManager({ cwd: ctx.cwd });
    lockfileManager.delete();
  }

  // Summary
  logger.newline();
  const elapsed = timer();
  logger.success(`Removed ${removed.length} package(s) in ${elapsed}`);
  
  for (const pkg of removed) {
    logger.log(`  - ${logger.packageName(pkg)}`);
  }

  return 0;
}

