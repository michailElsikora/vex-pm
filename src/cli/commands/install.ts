/**
 * Install command - installs all dependencies from package.json
 */

import { CommandContext } from '../index';
import { ConfigLoader } from '../../config';
import { Resolver } from '../../core/resolver';
import { Fetcher } from '../../core/fetcher';
import { Linker } from '../../core/linker';
import { LockfileManager } from '../../core/lockfile';
import { ResolvedPackage } from '../../types/lockfile';
import { logger } from '../../utils/logger';
import { ProgressTracker, Spinner } from '../../utils/progress';
import * as semver from '../../core/semver';

export async function installCommand(ctx: CommandContext): Promise<number> {
  const configLoader = new ConfigLoader({ cwd: ctx.cwd, configPath: ctx.configPath });
  const config = configLoader.load();

  // Load package.json
  const packageJson = configLoader.getPackageJson();
  if (!packageJson) {
    logger.error('No package.json found in current directory');
    return 1;
  }

  logger.info(`Installing dependencies for ${packageJson.name || 'project'}...`);
  const timer = logger.timer();

  // Options from flags
  const production = ctx.flags.production || ctx.flags.P || config.production;
  const frozen = ctx.flags.frozen || config.frozen;
  const preferOffline = ctx.flags['prefer-offline'] || config.preferOffline;
  const offline = ctx.flags.offline || config.offline;
  const ignoreScripts = ctx.flags['ignore-scripts'] || config.ignoreScripts;
  const strict = ctx.flags.strict || config.strictDependencies;

  // Initialize managers
  const lockfileManager = new LockfileManager({ cwd: ctx.cwd });
  let packages: Map<string, ResolvedPackage>;

  // Check for frozen mode
  if (frozen) {
    if (!lockfileManager.exists()) {
      logger.error('Lockfile not found. Cannot run in frozen mode.');
      return 1;
    }

    if (!lockfileManager.isUpToDate(packageJson)) {
      logger.error('Lockfile is out of date. Cannot run in frozen mode.');
      return 1;
    }

    // Use packages from lockfile
    const lockfile = lockfileManager.read()!;
    packages = lockfileManager.toResolvedPackages(lockfile);
    logger.info(`Using ${packages.size} packages from lockfile`);
  } else {
    // Resolve dependencies
    const spinner = new Spinner('Resolving dependencies...', ctx.silent);
    spinner.start();

    const resolver = new Resolver({
      registry: config.registry,
      token: config.authToken,
      production,
      preferOffline,
      autoInstallPeers: config.autoInstallPeers,
      strictPeerDependencies: config.strictPeerDependencies,
    });

    try {
      const result = await resolver.resolve(packageJson);
      
      if (result.errors.length > 0) {
        spinner.fail('Resolution failed');
        for (const error of result.errors) {
          logger.error(error);
        }
        return 1;
      }

      for (const warning of result.warnings) {
        logger.warn(warning);
      }

      packages = result.flat;
      spinner.success(`Resolved ${packages.size} packages`);
    } catch (error) {
      spinner.fail(`Resolution failed: ${error}`);
      return 1;
    }
  }

  // Fetch packages
  logger.newline();
  logger.info('Fetching packages...');
  
  const progress = new ProgressTracker(ctx.silent);
  const fetcher = new Fetcher({
    registry: config.registry,
    token: config.authToken,
    storeDir: config.storeDir,
    cacheDir: config.cacheDir,
    concurrency: config.concurrency,
    offline,
  });

  const packagesToFetch = Array.from(packages.values());
  const fetchResults = await fetcher.fetchAll(packagesToFetch, progress);
  progress.finish();

  // Show cache statistics
  const fromCache = Array.from(fetchResults.values()).filter(r => r.fromCache).length;
  const downloaded = fetchResults.size - fromCache;
  
  if (fromCache > 0 && downloaded > 0) {
    logger.success(`Fetched ${fetchResults.size} packages (${fromCache} from cache, ${downloaded} downloaded)`);
  } else if (fromCache > 0) {
    logger.success(`Fetched ${fetchResults.size} packages (all from cache)`);
  } else if (downloaded > 0) {
    logger.success(`Downloaded ${downloaded} packages`);
  }

  // Check for fetch errors
  const fetchErrors = progress.getErrors();
  if (fetchErrors.length > 0) {
    logger.error(`Failed to fetch ${fetchErrors.length} packages:`);
    for (const err of fetchErrors) {
      logger.error(`  ${err.name}: ${err.message}`);
    }
    
    // Continue if only optional packages failed
    const nonOptional = fetchErrors.filter((e: { id: string; name: string; message: string }) => {
      const pkg = packages.get(e.id);
      return pkg && !pkg.optional;
    });
    
    if (nonOptional.length > 0) {
      return 1;
    }
  }

  // Link packages
  logger.newline();
  const linkSpinner = new Spinner('Linking packages...', ctx.silent);
  linkSpinner.start();

  // Collect direct dependencies for priority linking
  // We need to find the resolved version for each direct dependency
  const directDependencies: Record<string, string> = {};
  const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  for (const [name, range] of Object.entries(allDeps)) {
    // Find the package that was resolved for this direct dependency
    for (const [, pkg] of packages) {
      if (pkg.name === name) {
        // Check if this version satisfies the range from package.json
        if (semver.satisfies(pkg.version, range)) {
          directDependencies[name] = pkg.version;
          break;
        }
      }
    }
  }

  const linker = new Linker(ctx.cwd, {
    useHardlinks: true,
    shamefullyHoist: config.shamefullyHoist,
    strictDependencies: strict,
    directDependencies,
  });

  try {
    const linkResult = await linker.link(packages, fetchResults);
    
    if (linkResult.errors.length > 0) {
      linkSpinner.fail('Linking completed with errors');
      for (const error of linkResult.errors) {
        logger.warn(error);
      }
    } else {
      linkSpinner.success(`Linked ${linkResult.linked} packages, ${linkResult.binaries} binaries`);
    }
  } catch (error) {
    linkSpinner.fail(`Linking failed: ${error}`);
    return 1;
  }

  // Write lockfile (unless frozen)
  if (!frozen) {
    lockfileManager.write(packages, packageJson);
    logger.debug('Wrote lockfile');
  }

  // Run postinstall scripts
  if (!ignoreScripts && packageJson.scripts?.postinstall) {
    logger.newline();
    logger.info('Running postinstall script...');
    // Script execution would go here
  }

  // Summary
  logger.newline();
  const elapsed = timer();
  const cacheHits = Array.from(fetchResults.values()).filter(r => r.fromCache).length;
  
  logger.success(`Done in ${elapsed}`);
  logger.log(`  Packages: ${packages.size}`);
  logger.log(`  From cache: ${cacheHits}`);
  logger.log(`  Downloaded: ${fetchResults.size - cacheHits}`);

  return 0;
}

