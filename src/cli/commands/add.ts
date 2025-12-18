/**
 * Add command - adds packages to dependencies
 */

import { CommandContext } from '../index';
import { ConfigLoader } from '../../config';
import { RegistryClient, getRegistryClient } from '../../registry/client';
import { Resolver } from '../../core/resolver';
import { Fetcher } from '../../core/fetcher';
import { Linker } from '../../core/linker';
import { LockfileManager } from '../../core/lockfile';
import * as semver from '../../core/semver';
import { PackageJson, DependencyType } from '../../types/package';
import { logger } from '../../utils/logger';
import { Spinner, ProgressTracker } from '../../utils/progress';

interface PackageSpec {
  name: string;
  version?: string;
  alias?: string;
}

export async function addCommand(ctx: CommandContext): Promise<number> {
  if (ctx.positionals.length === 0) {
    logger.error('No packages specified');
    logger.log('Usage: vex add <packages...> [options]');
    return 1;
  }

  const configLoader = new ConfigLoader({ cwd: ctx.cwd, configPath: ctx.configPath });
  const config = configLoader.load();

  // Load package.json
  let packageJson = configLoader.getPackageJson();
  if (!packageJson) {
    logger.error('No package.json found. Run "vex init" first.');
    return 1;
  }

  // Parse options
  const isDev = ctx.flags.dev || ctx.flags.D;
  const isPeer = ctx.flags.peer || ctx.flags.P;
  const isOptional = ctx.flags.optional || ctx.flags.O;
  const saveExact = ctx.flags.exact || ctx.flags.E || config.saveExact;
  const saveTilde = ctx.flags.tilde || ctx.flags.T;
  const saveCaret = ctx.flags.caret || ctx.flags.C;

  // Determine dependency type
  let depType: DependencyType = 'dependencies';
  if (isDev) depType = 'devDependencies';
  else if (isPeer) depType = 'peerDependencies';
  else if (isOptional) depType = 'optionalDependencies';

  // Parse package specs
  const specs = ctx.positionals.map(parsePackageSpec);
  
  logger.info(`Adding ${specs.length} package(s) to ${depType}...`);
  const timer = logger.timer();

  // Resolve versions
  const client = getRegistryClient({
    registry: config.registry,
    token: config.authToken,
  });

  const resolved: Array<{ name: string; version: string; spec: string }> = [];
  const spinner = new Spinner('Resolving versions...', ctx.silent);
  spinner.start();

  for (const spec of specs) {
    try {
      const metadata = await client.getAbbreviatedPackage(spec.name);
      const versions = Object.keys(metadata.versions);
      
      let targetVersion: string | null;
      
      if (spec.version) {
        // Specific version requested
        if (semver.valid(spec.version)) {
          targetVersion = spec.version;
        } else {
          // Range specified
          targetVersion = semver.maxSatisfying(versions, spec.version);
        }
      } else {
        // Get latest
        const distTags = metadata['dist-tags'];
        targetVersion = distTags.latest || semver.maxVersion(versions);
      }

      if (!targetVersion) {
        spinner.fail(`No matching version found for ${spec.name}`);
        return 1;
      }

      // Determine version spec to save
      let versionSpec: string;
      if (saveExact) {
        versionSpec = targetVersion;
      } else if (saveTilde) {
        versionSpec = `~${targetVersion}`;
      } else if (saveCaret) {
        versionSpec = `^${targetVersion}`;
      } else {
        // Default to exact (vex philosophy)
        versionSpec = targetVersion;
      }

      resolved.push({
        name: spec.alias || spec.name,
        version: targetVersion,
        spec: versionSpec,
      });

      logger.debug(`Resolved ${spec.name} to ${targetVersion}`);
    } catch (error) {
      spinner.fail(`Failed to resolve ${spec.name}: ${error}`);
      return 1;
    }
  }

  spinner.success(`Resolved ${resolved.length} packages`);

  // Update package.json
  packageJson = { ...packageJson };
  if (!packageJson[depType]) {
    packageJson[depType] = {};
  }

  for (const pkg of resolved) {
    packageJson[depType]![pkg.name] = pkg.spec;
  }

  // Sort dependencies alphabetically
  packageJson[depType] = sortObject(packageJson[depType]!);

  // Save package.json
  configLoader.savePackageJson(packageJson);
  logger.success('Updated package.json');

  // Install
  logger.newline();
  logger.info('Installing...');

  const resolver = new Resolver({
    registry: config.registry,
    token: config.authToken,
    production: false,
    preferOffline: config.preferOffline,
    autoInstallPeers: config.autoInstallPeers,
  });

  const progress = new ProgressTracker(ctx.silent);
  
  try {
    const result = await resolver.resolve(packageJson);
    
    if (result.errors.length > 0) {
      for (const error of result.errors) {
        logger.error(error);
      }
      return 1;
    }

    for (const warning of result.warnings) {
      logger.warn(warning);
    }

    // Fetch
    const fetcher = new Fetcher({
      registry: config.registry,
      token: config.authToken,
      storeDir: config.storeDir,
      cacheDir: config.cacheDir,
      concurrency: config.concurrency,
    });

    const packages = Array.from(result.flat.values());
    const fetchResults = await fetcher.fetchAll(packages, progress);
    progress.finish();

    // Link
    const linker = new Linker(ctx.cwd);
    await linker.link(result.flat, fetchResults);

    // Write lockfile
    const lockfileManager = new LockfileManager({ cwd: ctx.cwd });
    lockfileManager.write(result.flat, packageJson);

  } catch (error) {
    logger.error(`Installation failed: ${error}`);
    return 1;
  }

  // Summary
  logger.newline();
  const elapsed = timer();
  logger.success(`Added ${resolved.length} package(s) in ${elapsed}`);
  
  for (const pkg of resolved) {
    logger.log(`  + ${logger.packageName(pkg.name)} ${logger.version(pkg.version)}`);
  }

  return 0;
}

function parsePackageSpec(input: string): PackageSpec {
  // Handle alias: alias@npm:package@version
  if (input.includes('@npm:')) {
    const [alias, rest] = input.split('@npm:');
    const spec = parsePackageSpec(rest);
    return { ...spec, alias };
  }

  // Handle scoped packages: @scope/name@version
  if (input.startsWith('@')) {
    const slashIndex = input.indexOf('/');
    if (slashIndex === -1) {
      return { name: input };
    }

    const afterSlash = input.substring(slashIndex + 1);
    const atIndex = afterSlash.indexOf('@');
    
    if (atIndex === -1) {
      return { name: input };
    }

    return {
      name: input.substring(0, slashIndex + 1 + atIndex),
      version: afterSlash.substring(atIndex + 1),
    };
  }

  // Handle regular packages: name@version
  const atIndex = input.lastIndexOf('@');
  if (atIndex <= 0) {
    return { name: input };
  }

  return {
    name: input.substring(0, atIndex),
    version: input.substring(atIndex + 1),
  };
}

function sortObject<T>(obj: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  const keys = Object.keys(obj).sort();
  
  for (const key of keys) {
    sorted[key] = obj[key];
  }
  
  return sorted;
}

