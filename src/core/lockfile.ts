/**
 * Lockfile manager
 * Handles vex-lock.json reading and writing
 */

import * as path from 'path';
import { Lockfile, LockfilePackage, ResolvedPackage } from '../types/lockfile';
import { PackageJson } from '../types/package';
import { exists, readJson, atomicWrite } from '../utils/fs';
import { sha256 } from '../utils/hash';
import { logger } from '../utils/logger';

const LOCKFILE_VERSION = 1;
const LOCKFILE_NAME = 'vex-lock.json';

export interface LockfileManagerOptions {
  cwd?: string;
}

export class LockfileManager {
  private lockfilePath: string;
  private cwd: string;

  constructor(options: LockfileManagerOptions = {}) {
    this.cwd = options.cwd || process.cwd();
    this.lockfilePath = path.join(this.cwd, LOCKFILE_NAME);
  }

  /**
   * Check if lockfile exists
   */
  exists(): boolean {
    return exists(this.lockfilePath);
  }

  /**
   * Read lockfile
   */
  read(): Lockfile | null {
    if (!this.exists()) {
      return null;
    }

    try {
      const content = readJson<Lockfile>(this.lockfilePath);
      
      if (!content.version || content.version !== LOCKFILE_VERSION) {
        logger.warn('Lockfile version mismatch, will regenerate');
        return null;
      }

      return content;
    } catch (error) {
      logger.warn(`Failed to read lockfile: ${error}`);
      return null;
    }
  }

  /**
   * Write lockfile
   */
  write(packages: Map<string, ResolvedPackage>, packageJson: PackageJson): void {
    const lockfile: Lockfile = {
      version: LOCKFILE_VERSION,
      packages: {},
      dependencies: packageJson.dependencies || {},
      devDependencies: packageJson.devDependencies,
    };

    // Sort packages by name for deterministic output
    const sortedEntries = Array.from(packages.entries()).sort(([a], [b]) => a.localeCompare(b));

    for (const [key, pkg] of sortedEntries) {
      const lockPkg: LockfilePackage = {
        version: pkg.version,
        resolved: pkg.resolved,
        integrity: pkg.integrity,
      };

      if (Object.keys(pkg.dependencies).length > 0) {
        lockPkg.dependencies = pkg.dependencies;
      }
      if (Object.keys(pkg.peerDependencies).length > 0) {
        lockPkg.peerDependencies = pkg.peerDependencies;
      }
      if (Object.keys(pkg.optionalDependencies).length > 0) {
        lockPkg.optionalDependencies = pkg.optionalDependencies;
      }
      if (Object.keys(pkg.bin).length > 0) {
        lockPkg.bin = pkg.bin;
      }
      if (pkg.optional) {
        lockPkg.optional = true;
      }
      if (pkg.dev) {
        lockPkg.dev = true;
      }

      lockfile.packages[key] = lockPkg;
    }

    const content = JSON.stringify(lockfile, null, 2) + '\n';
    atomicWrite(this.lockfilePath, content);
    logger.debug(`Wrote lockfile with ${packages.size} packages`);
  }

  /**
   * Convert lockfile packages to resolved packages
   */
  toResolvedPackages(lockfile: Lockfile): Map<string, ResolvedPackage> {
    const result = new Map<string, ResolvedPackage>();

    for (const [key, pkg] of Object.entries(lockfile.packages)) {
      // Extract name from key (format: name@version)
      const atIndex = key.lastIndexOf('@');
      const name = atIndex > 0 ? key.substring(0, atIndex) : key;

      result.set(key, {
        name,
        version: pkg.version,
        resolved: pkg.resolved,
        integrity: pkg.integrity,
        dependencies: pkg.dependencies || {},
        peerDependencies: pkg.peerDependencies || {},
        optionalDependencies: pkg.optionalDependencies || {},
        bin: typeof pkg.bin === 'string' 
          ? { [name.split('/').pop()!]: pkg.bin }
          : pkg.bin || {},
        optional: pkg.optional || false,
        dev: pkg.dev || false,
      });
    }

    return result;
  }

  /**
   * Check if lockfile is up to date with package.json
   */
  isUpToDate(packageJson: PackageJson): boolean {
    const lockfile = this.read();
    if (!lockfile) {
      return false;
    }

    // Compare dependencies
    const currentDeps = { ...packageJson.dependencies };
    const currentDevDeps = { ...packageJson.devDependencies };
    const lockDeps = lockfile.dependencies || {};
    const lockDevDeps = lockfile.devDependencies || {};

    // Check if all deps in package.json are in lockfile
    for (const [name, range] of Object.entries(currentDeps)) {
      if (lockDeps[name] !== range) {
        return false;
      }
    }

    for (const [name, range] of Object.entries(currentDevDeps)) {
      if (lockDevDeps[name] !== range) {
        return false;
      }
    }

    // Check if lockfile has extra deps not in package.json
    for (const name of Object.keys(lockDeps)) {
      if (!currentDeps[name]) {
        return false;
      }
    }

    for (const name of Object.keys(lockDevDeps)) {
      if (!currentDevDeps[name]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get lockfile hash for cache invalidation
   */
  getHash(): string | null {
    if (!this.exists()) {
      return null;
    }

    try {
      const content = require('fs').readFileSync(this.lockfilePath, 'utf-8');
      return sha256(content).substring(0, 16);
    } catch {
      return null;
    }
  }

  /**
   * Get lockfile path
   */
  getPath(): string {
    return this.lockfilePath;
  }

  /**
   * Delete lockfile
   */
  delete(): void {
    if (exists(this.lockfilePath)) {
      require('fs').unlinkSync(this.lockfilePath);
    }
  }
}

