/**
 * Dependency resolver
 * Builds complete dependency graph from package.json
 */

import { RegistryClient, getRegistryClient } from '../registry/client';
import { MetadataCache, getMetadataCache } from '../registry/cache';
import { AbbreviatedPackage, AbbreviatedVersion } from '../types/registry';
import { PackageJson } from '../types/package';
import { ResolvedPackage } from '../types/lockfile';
import * as semver from './semver';
import { logger } from '../utils/logger';
import { ProgressTracker } from '../utils/progress';

export interface ResolverOptions {
  registry?: string;
  token?: string;
  production?: boolean;
  preferOffline?: boolean;
  autoInstallPeers?: boolean;
  strictPeerDependencies?: boolean;
}

export interface DependencyNode {
  name: string;
  version: string;
  resolved: string;
  integrity: string;
  dependencies: Map<string, DependencyNode>;
  dev: boolean;
  optional: boolean;
  peer: boolean;
}

export interface ResolutionResult {
  root: Map<string, DependencyNode>;
  flat: Map<string, ResolvedPackage>;
  errors: string[];
  warnings: string[];
}

export class Resolver {
  private client: RegistryClient;
  private cache: MetadataCache;
  private options: ResolverOptions;
  private metadataCache: Map<string, AbbreviatedPackage> = new Map();
  private resolving: Map<string, Promise<AbbreviatedPackage | null>> = new Map();
  private resolved: Map<string, ResolvedPackage> = new Map();
  private errors: string[] = [];
  private warnings: string[] = [];
  private progress?: ProgressTracker;
  private resolvedCount: number = 0;

  constructor(options: ResolverOptions = {}) {
    this.options = options;
    this.client = getRegistryClient({
      registry: options.registry,
      token: options.token,
    });
    this.cache = getMetadataCache();
  }

  /**
   * Resolve all dependencies from package.json
   */
  async resolve(packageJson: PackageJson, progress?: ProgressTracker): Promise<ResolutionResult> {
    const root = new Map<string, DependencyNode>();
    this.errors = [];
    this.warnings = [];
    this.resolved.clear();
    this.progress = progress;
    this.resolvedCount = 0;

    // Collect all direct dependencies
    const directDeps: Array<{ name: string; range: string; dev: boolean; optional: boolean }> = [];

    if (packageJson.dependencies) {
      for (const [name, range] of Object.entries(packageJson.dependencies)) {
        directDeps.push({ name, range, dev: false, optional: false });
      }
    }

    if (!this.options.production && packageJson.devDependencies) {
      for (const [name, range] of Object.entries(packageJson.devDependencies)) {
        directDeps.push({ name, range, dev: true, optional: false });
      }
    }

    if (packageJson.optionalDependencies) {
      for (const [name, range] of Object.entries(packageJson.optionalDependencies)) {
        directDeps.push({ name, range, dev: false, optional: true });
      }
    }

    // Resolve direct dependencies
    await Promise.all(
      directDeps.map(async (dep) => {
        try {
          const node = await this.resolveDependency(dep.name, dep.range, dep.dev, dep.optional, false, new Set());
          if (node) {
            root.set(dep.name, node);
          }
        } catch (error) {
          if (dep.optional) {
            this.warnings.push(`Optional dependency ${dep.name} could not be resolved: ${error}`);
          } else {
            this.errors.push(`Failed to resolve ${dep.name}: ${error}`);
          }
        }
      })
    );

    return {
      root,
      flat: this.resolved,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  /**
   * Parse npm alias syntax (npm:package-name@version)
   * Returns { actualName, actualRange } or null if not an alias
   */
  private parseNpmAlias(range: string): { actualName: string; actualRange: string } | null {
    if (!range.startsWith('npm:')) {
      return null;
    }
    
    // Format: npm:package-name@version or npm:@scope/package@version
    const aliasValue = range.slice(4); // Remove 'npm:'
    
    // Handle scoped packages
    if (aliasValue.startsWith('@')) {
      const atIndex = aliasValue.indexOf('@', 1);
      if (atIndex !== -1) {
        return {
          actualName: aliasValue.slice(0, atIndex),
          actualRange: aliasValue.slice(atIndex + 1),
        };
      }
      return { actualName: aliasValue, actualRange: '*' };
    }
    
    // Handle non-scoped packages
    const atIndex = aliasValue.indexOf('@');
    if (atIndex !== -1) {
      return {
        actualName: aliasValue.slice(0, atIndex),
        actualRange: aliasValue.slice(atIndex + 1),
      };
    }
    
    return { actualName: aliasValue, actualRange: '*' };
  }

  /**
   * Resolve a single dependency and its transitive dependencies
   */
  private async resolveDependency(
    name: string,
    range: string,
    dev: boolean,
    optional: boolean,
    peer: boolean,
    seen: Set<string>
  ): Promise<DependencyNode | null> {
    // Handle npm alias syntax (npm:package-name@version)
    const alias = this.parseNpmAlias(range);
    let actualName = name;
    let actualRange = range;
    
    if (alias) {
      actualName = alias.actualName;
      actualRange = alias.actualRange;
      logger.debug(`Resolved alias ${name} -> ${actualName}@${actualRange}`);
    }

    // Cycle detection
    const key = `${actualName}@${actualRange}`;
    if (seen.has(key)) {
      return null;
    }
    seen = new Set(seen);
    seen.add(key);

    // Get package metadata
    const metadata = await this.getMetadata(actualName);
    if (!metadata) {
      throw new Error(`Package not found: ${actualName}`);
    }

    // Find best matching version
    const versions = Object.keys(metadata.versions);
    const bestVersion = semver.maxSatisfying(versions, actualRange);

    if (!bestVersion) {
      throw new Error(`No version of ${actualName} satisfies ${actualRange}`);
    }

    // Check if already resolved with same version
    // Use original name for alias support (the alias name should be used in node_modules)
    const resolvedKey = `${name}@${bestVersion}`;
    if (this.resolved.has(resolvedKey)) {
      const existing = this.resolved.get(resolvedKey)!;
      return this.nodeFromResolved(existing, dev, optional, peer);
    }

    const versionData = metadata.versions[bestVersion];
    if (!versionData) {
      throw new Error(`Version ${bestVersion} not found for ${actualName}`);
    }

    // Track progress - new package being resolved
    const taskId = `resolve-${resolvedKey}`;
    if (this.progress) {
      this.progress.addTask(taskId, `${name}@${bestVersion}`);
      this.progress.startTask(taskId);
    }

    // Check for deprecation
    if (versionData.deprecated) {
      this.warnings.push(`${actualName}@${bestVersion} is deprecated: ${versionData.deprecated}`);
    }

    // Create resolved package (resolvedDependencies will be filled after resolving transitive deps)
    const resolvedPkg: ResolvedPackage = {
      name,
      version: bestVersion,
      resolved: versionData.dist.tarball,
      integrity: versionData.dist.integrity || `sha1-${versionData.dist.shasum}`,
      dependencies: versionData.dependencies || {},
      resolvedDependencies: {},
      peerDependencies: versionData.peerDependencies || {},
      optionalDependencies: versionData.optionalDependencies || {},
      bin: this.normalizeBin(name, versionData.bin),
      optional,
      dev,
    };

    this.resolved.set(resolvedKey, resolvedPkg);

    // Create dependency node
    const node: DependencyNode = {
      name,
      version: bestVersion,
      resolved: versionData.dist.tarball,
      integrity: resolvedPkg.integrity,
      dependencies: new Map(),
      dev,
      optional,
      peer,
    };

    // Resolve transitive dependencies in parallel
    const transitiveDeps: Array<{ name: string; range: string; optional: boolean; peer: boolean }> = [];

    if (versionData.dependencies) {
      for (const [depName, depRange] of Object.entries(versionData.dependencies)) {
        transitiveDeps.push({ name: depName, range: depRange, optional: false, peer: false });
      }
    }

    if (versionData.optionalDependencies) {
      for (const [depName, depRange] of Object.entries(versionData.optionalDependencies)) {
        transitiveDeps.push({ name: depName, range: depRange, optional: true, peer: false });
      }
    }

    if (this.options.autoInstallPeers && versionData.peerDependencies) {
      const peerMeta = versionData.peerDependenciesMeta || {};
      for (const [depName, depRange] of Object.entries(versionData.peerDependencies)) {
        const isOptional = peerMeta[depName]?.optional === true;
        if (!isOptional || this.options.strictPeerDependencies) {
          transitiveDeps.push({ name: depName, range: depRange, optional: isOptional, peer: true });
        }
      }
    }

    await Promise.all(
      transitiveDeps.map(async (dep) => {
        try {
          const childNode = await this.resolveDependency(
            dep.name,
            dep.range,
            dev,
            dep.optional,
            dep.peer,
            seen
          );
          if (childNode) {
            node.dependencies.set(dep.name, childNode);
            // Store the actual resolved version
            resolvedPkg.resolvedDependencies[dep.name] = childNode.version;
          }
        } catch (error) {
          if (dep.optional) {
            this.warnings.push(`Optional dependency ${dep.name} of ${name} could not be resolved`);
          } else if (dep.peer && !this.options.strictPeerDependencies) {
            this.warnings.push(`Peer dependency ${dep.name} of ${name} could not be resolved`);
          } else {
            throw error;
          }
        }
      })
    );

    // Mark task as complete
    if (this.progress) {
      this.progress.completeTask(taskId);
    }

    return node;
  }

  /**
   * Get package metadata from cache or registry
   */
  private async getMetadata(name: string): Promise<AbbreviatedPackage | null> {
    // Check memory cache
    if (this.metadataCache.has(name)) {
      return this.metadataCache.get(name)!;
    }

    // Check if already fetching
    if (this.resolving.has(name)) {
      return this.resolving.get(name)!;
    }

    // Check disk cache if prefer offline
    if (this.options.preferOffline) {
      const cached = this.cache.get<AbbreviatedPackage>(name, true);
      if (cached) {
        this.metadataCache.set(name, cached);
        return cached;
      }
    }

    // Fetch from registry
    const promise = this.fetchMetadata(name);
    this.resolving.set(name, promise);

    try {
      const metadata = await promise;
      if (metadata) {
        this.metadataCache.set(name, metadata);
        this.cache.set(name, metadata, true);
      }
      return metadata;
    } finally {
      this.resolving.delete(name);
    }
  }

  private async fetchMetadata(name: string): Promise<AbbreviatedPackage | null> {
    try {
      logger.debug(`Fetching metadata for ${name}`);
      return await this.client.getAbbreviatedPackage(name);
    } catch (error) {
      logger.debug(`Failed to fetch ${name} from primary registry: ${error}`);
      
      // Fallback to npm registry if primary registry fails
      const primaryRegistry = this.options.registry || '';
      const npmRegistry = 'https://registry.npmjs.org';
      
      if (primaryRegistry && primaryRegistry !== npmRegistry) {
        logger.debug(`Trying npm fallback for ${name}`);
        try {
          const fallbackClient = getRegistryClient({ registry: npmRegistry });
          const metadata = await fallbackClient.getAbbreviatedPackage(name);
          if (metadata) {
            logger.debug(`Found ${name} in npm registry (fallback)`);
            return metadata;
          }
        } catch (fallbackError) {
          logger.debug(`Fallback to npm also failed for ${name}: ${fallbackError}`);
        }
      }
      
      return null;
    }
  }

  private normalizeBin(name: string, bin: string | Record<string, string> | undefined): Record<string, string> {
    if (!bin) return {};
    if (typeof bin === 'string') {
      // Single binary with package name
      const binName = name.startsWith('@') ? name.split('/')[1] : name;
      return { [binName]: bin };
    }
    return bin;
  }

  private nodeFromResolved(pkg: ResolvedPackage, dev: boolean, optional: boolean, peer: boolean): DependencyNode {
    return {
      name: pkg.name,
      version: pkg.version,
      resolved: pkg.resolved,
      integrity: pkg.integrity,
      dependencies: new Map(),
      dev: dev || pkg.dev,
      optional: optional || pkg.optional,
      peer,
    };
  }
}

/**
 * Flatten dependency tree to list
 */
export function flattenDependencies(root: Map<string, DependencyNode>): Map<string, ResolvedPackage> {
  const result = new Map<string, ResolvedPackage>();

  function walk(node: DependencyNode): void {
    const key = `${node.name}@${node.version}`;
    if (result.has(key)) return;

    // Build resolvedDependencies from child nodes
    const resolvedDeps: Record<string, string> = {};
    for (const [depName, child] of node.dependencies) {
      resolvedDeps[depName] = child.version;
    }

    result.set(key, {
      name: node.name,
      version: node.version,
      resolved: node.resolved,
      integrity: node.integrity,
      dependencies: {},
      resolvedDependencies: resolvedDeps,
      peerDependencies: {},
      optionalDependencies: {},
      bin: {},
      optional: node.optional,
      dev: node.dev,
    });

    for (const child of node.dependencies.values()) {
      walk(child);
    }
  }

  for (const node of root.values()) {
    walk(node);
  }

  return result;
}

