/**
 * Content-addressable store manager
 */

import * as path from 'path';
import * as fs from 'fs';
import { getStoreDir } from '../utils/platform';
import { exists, mkdirp, rmrf, readdir, stat } from '../utils/fs';
import { contentHash } from '../utils/hash';
import { logger } from '../utils/logger';

export interface StoreOptions {
  storeDir?: string;
}

export interface StoredPackage {
  name: string;
  version: string;
  path: string;
  size: number;
  installedAt: string;
}

export class Store {
  private storeDir: string;

  constructor(options: StoreOptions = {}) {
    this.storeDir = options.storeDir || getStoreDir();
  }

  /**
   * Initialize store directory
   */
  init(): void {
    if (!exists(this.storeDir)) {
      mkdirp(this.storeDir);
      logger.debug(`Created store at ${this.storeDir}`);
    }
  }

  /**
   * Get path for a package in store
   */
  getPackagePath(name: string, version: string, integrity?: string): string {
    const hash = contentHash(integrity || `${name}@${version}`).substring(0, 8);
    const safeName = name.replace(/[@/]/g, '+');
    return path.join(this.storeDir, `${safeName}@${version}_${hash}`);
  }

  /**
   * Check if package exists in store
   */
  has(name: string, version: string, integrity?: string): boolean {
    const pkgPath = this.getPackagePath(name, version, integrity);
    return exists(pkgPath) && exists(path.join(pkgPath, 'package.json'));
  }

  /**
   * Get package from store
   */
  get(name: string, version: string, integrity?: string): StoredPackage | null {
    const pkgPath = this.getPackagePath(name, version, integrity);
    
    if (!exists(pkgPath)) {
      return null;
    }

    const metaPath = path.join(pkgPath, '.vex-meta.json');
    let installedAt = new Date().toISOString();
    
    if (exists(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        installedAt = meta.fetchedAt || installedAt;
      } catch {
        // Ignore parse errors
      }
    }

    const size = this.getDirectorySize(pkgPath);

    return {
      name,
      version,
      path: pkgPath,
      size,
      installedAt,
    };
  }

  /**
   * List all packages in store
   */
  list(): StoredPackage[] {
    if (!exists(this.storeDir)) {
      return [];
    }

    const packages: StoredPackage[] = [];
    const entries = readdir(this.storeDir);

    for (const entry of entries) {
      const entryPath = path.join(this.storeDir, entry);
      const s = stat(entryPath);
      
      if (!s?.isDirectory()) continue;

      // Parse name and version from directory name
      // Format: name@version_hash
      const match = entry.match(/^(.+)@([^_]+)_[a-f0-9]+$/);
      if (!match) continue;

      const [, safeName, version] = match;
      const name = safeName.replace(/\+/g, '/').replace(/^\+/, '@');

      const metaPath = path.join(entryPath, '.vex-meta.json');
      let installedAt = new Date().toISOString();

      if (exists(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          installedAt = meta.fetchedAt || installedAt;
        } catch {
          // Ignore
        }
      }

      packages.push({
        name,
        version,
        path: entryPath,
        size: this.getDirectorySize(entryPath),
        installedAt,
      });
    }

    return packages;
  }

  /**
   * Remove package from store
   */
  remove(name: string, version: string, integrity?: string): boolean {
    const pkgPath = this.getPackagePath(name, version, integrity);
    
    if (exists(pkgPath)) {
      rmrf(pkgPath);
      return true;
    }

    return false;
  }

  /**
   * Clear entire store
   */
  clear(): void {
    if (exists(this.storeDir)) {
      rmrf(this.storeDir);
      mkdirp(this.storeDir);
    }
  }

  /**
   * Get total store size in bytes
   */
  getSize(): number {
    if (!exists(this.storeDir)) {
      return 0;
    }

    return this.getDirectorySize(this.storeDir);
  }

  /**
   * Get store statistics
   */
  getStats(): { packages: number; size: number; path: string } {
    const packages = this.list();
    return {
      packages: packages.length,
      size: this.getSize(),
      path: this.storeDir,
    };
  }

  /**
   * Garbage collect - remove packages not referenced by any project
   * (This would need a reference counter, simplified version)
   */
  gc(): number {
    // For now, just return 0
    // Full implementation would track references
    return 0;
  }

  /**
   * Get store directory path
   */
  getPath(): string {
    return this.storeDir;
  }

  private getDirectorySize(dir: string): number {
    let size = 0;
    
    try {
      const s = stat(dir);
      if (!s) return 0;

      if (s.isDirectory()) {
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          size += this.getDirectorySize(path.join(dir, entry));
        }
      } else {
        size = s.size;
      }
    } catch {
      // Ignore errors
    }

    return size;
  }
}

// Singleton
let defaultStore: Store | null = null;

export function getStore(options?: StoreOptions): Store {
  if (!defaultStore) {
    defaultStore = new Store(options);
  }
  return defaultStore;
}

