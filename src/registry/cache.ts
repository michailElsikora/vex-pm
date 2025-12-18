/**
 * Registry metadata cache
 */

import * as path from 'path';
import { AbbreviatedPackage, RegistryPackage } from '../types/registry';
import { getCacheDir } from '../utils/platform';
import { exists, mkdirp, readJson, writeJson, readdir, rmrf, stat } from '../utils/fs';
import { sha256 } from '../utils/hash';
import { logger } from '../utils/logger';

export interface CacheOptions {
  cacheDir?: string;
  maxAge?: number; // milliseconds
  maxSize?: number; // bytes
}

export class MetadataCache {
  private cacheDir: string;
  private maxAge: number;
  private maxSize: number;

  constructor(options: CacheOptions = {}) {
    this.cacheDir = options.cacheDir || path.join(getCacheDir(), 'metadata');
    this.maxAge = options.maxAge || 5 * 60 * 1000; // 5 minutes default
    this.maxSize = options.maxSize || 100 * 1024 * 1024; // 100MB default
  }

  /**
   * Get cached package metadata
   */
  get<T extends RegistryPackage | AbbreviatedPackage>(name: string, abbreviated = true): T | null {
    const filePath = this.getCachePath(name, abbreviated);
    
    if (!exists(filePath)) {
      return null;
    }

    const stats = stat(filePath);
    if (!stats) {
      return null;
    }

    // Check if cache is still valid
    const age = Date.now() - stats.mtimeMs;
    if (age > this.maxAge) {
      logger.debug(`Cache expired for ${name}`);
      return null;
    }

    try {
      return readJson<T>(filePath);
    } catch (error) {
      logger.debug(`Failed to read cache for ${name}: ${error}`);
      return null;
    }
  }

  /**
   * Set cached package metadata
   */
  set<T extends RegistryPackage | AbbreviatedPackage>(name: string, data: T, abbreviated = true): void {
    const filePath = this.getCachePath(name, abbreviated);
    const dir = path.dirname(filePath);

    try {
      mkdirp(dir);
      writeJson(filePath, data, false); // Compact JSON for cache
    } catch (error) {
      logger.debug(`Failed to write cache for ${name}: ${error}`);
    }
  }

  /**
   * Check if package is cached and valid
   */
  has(name: string, abbreviated = true): boolean {
    return this.get(name, abbreviated) !== null;
  }

  /**
   * Invalidate cache for a package
   */
  invalidate(name: string): void {
    const abbrevPath = this.getCachePath(name, true);
    const fullPath = this.getCachePath(name, false);
    
    if (exists(abbrevPath)) {
      rmrf(abbrevPath);
    }
    if (exists(fullPath)) {
      rmrf(fullPath);
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    if (exists(this.cacheDir)) {
      rmrf(this.cacheDir);
      mkdirp(this.cacheDir);
    }
  }

  /**
   * Get cache size in bytes
   */
  getSize(): number {
    if (!exists(this.cacheDir)) {
      return 0;
    }

    let size = 0;
    const files = this.getAllCacheFiles();
    
    for (const file of files) {
      const stats = stat(file);
      if (stats) {
        size += stats.size;
      }
    }

    return size;
  }

  /**
   * Prune old entries if cache exceeds max size
   */
  prune(): number {
    const currentSize = this.getSize();
    
    if (currentSize <= this.maxSize) {
      return 0;
    }

    const files = this.getAllCacheFiles();
    const fileStats = files.map(file => ({
      path: file,
      stats: stat(file)!,
    })).filter(f => f.stats);

    // Sort by modification time (oldest first)
    fileStats.sort((a, b) => a.stats.mtimeMs - b.stats.mtimeMs);

    let freedSize = 0;
    let pruned = 0;
    const targetSize = this.maxSize * 0.8; // Prune to 80% of max

    for (const file of fileStats) {
      if (currentSize - freedSize <= targetSize) {
        break;
      }

      rmrf(file.path);
      freedSize += file.stats.size;
      pruned++;
    }

    logger.debug(`Pruned ${pruned} cache entries, freed ${(freedSize / 1024 / 1024).toFixed(2)}MB`);
    return pruned;
  }

  private getCachePath(name: string, abbreviated: boolean): string {
    // Use hash for scoped packages to avoid path issues
    const hash = sha256(name).substring(0, 8);
    const safeName = name.replace(/[@/]/g, '_');
    const suffix = abbreviated ? 'abbrev' : 'full';
    return path.join(this.cacheDir, `${safeName}_${hash}_${suffix}.json`);
  }

  private getAllCacheFiles(): string[] {
    if (!exists(this.cacheDir)) {
      return [];
    }

    const files: string[] = [];
    const entries = readdir(this.cacheDir);
    
    for (const entry of entries) {
      const fullPath = path.join(this.cacheDir, entry);
      const stats = stat(fullPath);
      if (stats?.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  }
}

// Singleton instance
let defaultCache: MetadataCache | null = null;

export function getMetadataCache(options?: CacheOptions): MetadataCache {
  if (!defaultCache) {
    defaultCache = new MetadataCache(options);
  }
  return defaultCache;
}

