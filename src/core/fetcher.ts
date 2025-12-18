/**
 * Package fetcher
 * Downloads and extracts packages from registry
 */

import * as path from 'path';
import * as fs from 'fs';
import { RegistryClient, getRegistryClient } from '../registry/client';
import { ResolvedPackage } from '../types/lockfile';
import { extractTarball } from './tarball';
import { getStoreDir, getCacheDir } from '../utils/platform';
import { exists, mkdirp, rmrf, readdir } from '../utils/fs';
import { verifyIntegrity, contentHash } from '../utils/hash';
import { logger } from '../utils/logger';
import { ProgressTracker } from '../utils/progress';

export interface FetcherOptions {
  registry?: string;
  token?: string;
  storeDir?: string;
  cacheDir?: string;
  concurrency?: number;
  offline?: boolean;
}

export interface FetchResult {
  name: string;
  version: string;
  path: string;
  fromCache: boolean;
}

export class Fetcher {
  private client: RegistryClient;
  private storeDir: string;
  private cacheDir: string;
  private concurrency: number;
  private offline: boolean;

  constructor(options: FetcherOptions = {}) {
    this.client = getRegistryClient({
      registry: options.registry,
      token: options.token,
    });
    this.storeDir = options.storeDir || getStoreDir();
    this.cacheDir = options.cacheDir || path.join(getCacheDir(), 'tarballs');
    this.concurrency = options.concurrency || 16;
    this.offline = options.offline || false;
  }

  /**
   * Fetch multiple packages in parallel
   */
  async fetchAll(
    packages: ResolvedPackage[],
    progress?: ProgressTracker
  ): Promise<Map<string, FetchResult>> {
    const results = new Map<string, FetchResult>();
    
    // Create batches for concurrency control
    const batches = this.createBatches(packages, this.concurrency);

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(pkg => this.fetchPackage(pkg, progress))
      );

      for (const result of batchResults) {
        if (result) {
          const key = `${result.name}@${result.version}`;
          results.set(key, result);
        }
      }
    }

    return results;
  }

  /**
   * Fetch a single package
   */
  async fetchPackage(pkg: ResolvedPackage, progress?: ProgressTracker): Promise<FetchResult | null> {
    const taskId = `${pkg.name}@${pkg.version}`;
    progress?.addTask(taskId, pkg.name);
    progress?.startTask(taskId);

    try {
      // Check if already in store
      const storePath = this.getStorePath(pkg);
      if (exists(storePath) && this.verifyPackage(storePath)) {
        progress?.completeTask(taskId);
        return {
          name: pkg.name,
          version: pkg.version,
          path: storePath,
          fromCache: true,
        };
      }

      // Check tarball cache
      const tarballPath = this.getTarballPath(pkg);
      let tarball: Buffer;

      if (exists(tarballPath)) {
        tarball = fs.readFileSync(tarballPath);
        logger.debug(`Using cached tarball for ${taskId}`);
      } else {
        if (this.offline) {
          throw new Error(`Package ${taskId} not in cache and offline mode is enabled`);
        }

        // Download tarball
        logger.debug(`Downloading ${taskId}`);
        tarball = await this.client.downloadTarball(pkg.resolved);

        // Verify integrity
        if (pkg.integrity && !verifyIntegrity(tarball, pkg.integrity)) {
          throw new Error(`Integrity check failed for ${taskId}`);
        }

        // Cache tarball
        mkdirp(path.dirname(tarballPath));
        fs.writeFileSync(tarballPath, tarball);
      }

      // Extract to store
      rmrf(storePath);
      mkdirp(storePath);
      await extractTarball(tarball, storePath);

      // Write metadata
      this.writeMetadata(storePath, pkg);

      progress?.completeTask(taskId);
      return {
        name: pkg.name,
        version: pkg.version,
        path: storePath,
        fromCache: false,
      };
    } catch (error) {
      progress?.failTask(taskId, String(error));
      logger.error(`Failed to fetch ${taskId}: ${error}`);
      
      if (pkg.optional) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get store path for a package
   */
  getStorePath(pkg: ResolvedPackage): string {
    // Use content-addressable path based on integrity
    const hash = contentHash(pkg.integrity || `${pkg.name}@${pkg.version}`);
    const safeName = pkg.name.replace(/[@/]/g, '+');
    return path.join(this.storeDir, `${safeName}@${pkg.version}_${hash.substring(0, 8)}`);
  }

  /**
   * Get tarball cache path
   */
  private getTarballPath(pkg: ResolvedPackage): string {
    const safeName = pkg.name.replace(/[@/]/g, '+');
    return path.join(this.cacheDir, `${safeName}-${pkg.version}.tgz`);
  }

  /**
   * Verify package in store is valid
   */
  private verifyPackage(storePath: string): boolean {
    const metaPath = path.join(storePath, '.vex-meta.json');
    if (!exists(metaPath)) {
      return false;
    }

    // Check if package.json exists
    const pkgJsonPath = path.join(storePath, 'package.json');
    return exists(pkgJsonPath);
  }

  /**
   * Write package metadata
   */
  private writeMetadata(storePath: string, pkg: ResolvedPackage): void {
    const metaPath = path.join(storePath, '.vex-meta.json');
    const meta = {
      name: pkg.name,
      version: pkg.version,
      integrity: pkg.integrity,
      resolved: pkg.resolved,
      fetchedAt: new Date().toISOString(),
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }

  /**
   * Create batches for parallel processing
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Get store directory
   */
  getStoreDirectory(): string {
    return this.storeDir;
  }

  /**
   * Get cache directory
   */
  getCacheDirectory(): string {
    return this.cacheDir;
  }

  /**
   * Clear tarball cache
   */
  clearCache(): void {
    if (exists(this.cacheDir)) {
      rmrf(this.cacheDir);
    }
  }

  /**
   * Clear store (dangerous!)
   */
  clearStore(): void {
    if (exists(this.storeDir)) {
      rmrf(this.storeDir);
    }
  }

  /**
   * Get store size in bytes
   */
  getStoreSize(): number {
    if (!exists(this.storeDir)) {
      return 0;
    }

    let size = 0;
    const entries = readdir(this.storeDir);
    
    for (const entry of entries) {
      const entryPath = path.join(this.storeDir, entry);
      size += this.getDirSize(entryPath);
    }

    return size;
  }

  private getDirSize(dir: string): number {
    let size = 0;
    const stat = fs.statSync(dir);
    
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        size += this.getDirSize(path.join(dir, entry));
      }
    } else {
      size = stat.size;
    }

    return size;
  }
}

