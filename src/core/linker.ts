/**
 * Linker - creates node_modules structure
 * Uses hardlinks from global store for disk efficiency
 */

import * as path from 'path';
import * as fs from 'fs';
import { ResolvedPackage } from '../types/lockfile';
import { FetchResult } from './fetcher';
import { exists, mkdirp, rmrf, symlink, readdir } from '../utils/fs';
import { isWindows } from '../utils/platform';
import { logger } from '../utils/logger';

export interface LinkerOptions {
  nodeModulesDir?: string;
  useHardlinks?: boolean;
  hoistPattern?: string[];
  shamefullyHoist?: boolean;
  directDependencies?: Record<string, string>; // name -> version from package.json
}

export interface LinkResult {
  linked: number;
  binaries: number;
  errors: string[];
}

export class Linker {
  private nodeModulesDir: string;
  private useHardlinks: boolean;
  private shamefullyHoist: boolean;
  private directDependencies: Record<string, string>;
  private hoistedVersions: Map<string, string> = new Map(); // name -> version in root node_modules

  constructor(cwd: string, options: LinkerOptions = {}) {
    this.nodeModulesDir = options.nodeModulesDir || path.join(cwd, 'node_modules');
    this.useHardlinks = options.useHardlinks !== false;
    this.shamefullyHoist = options.shamefullyHoist || false;
    this.directDependencies = options.directDependencies || {};
  }

  /**
   * Link all packages to node_modules
   */
  async link(
    packages: Map<string, ResolvedPackage>,
    fetchResults: Map<string, FetchResult>
  ): Promise<LinkResult> {
    const result: LinkResult = {
      linked: 0,
      binaries: 0,
      errors: [],
    };

    // Prepare node_modules
    if (exists(this.nodeModulesDir)) {
      // Clean existing node_modules but preserve .cache and similar
      const entries = readdir(this.nodeModulesDir);
      for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        rmrf(path.join(this.nodeModulesDir, entry));
      }
    }
    mkdirp(this.nodeModulesDir);

    // Create .bin directory
    const binDir = path.join(this.nodeModulesDir, '.bin');
    mkdirp(binDir);

    // Build version map: determine which version of each package should be hoisted
    // Priority: direct dependencies > most common version
    const versionCounts = new Map<string, Map<string, number>>(); // name -> version -> count
    const packagesByName = new Map<string, ResolvedPackage[]>(); // name -> all versions
    
    for (const [, pkg] of packages) {
      if (!versionCounts.has(pkg.name)) {
        versionCounts.set(pkg.name, new Map());
        packagesByName.set(pkg.name, []);
      }
      const counts = versionCounts.get(pkg.name)!;
      counts.set(pkg.version, (counts.get(pkg.version) || 0) + 1);
      packagesByName.get(pkg.name)!.push(pkg);
    }

    // Determine hoisted version for each package
    for (const [name, counts] of versionCounts) {
      // Check if it's a direct dependency first
      const directVersion = this.directDependencies[name];
      if (directVersion && counts.has(directVersion)) {
        this.hoistedVersions.set(name, directVersion);
        continue;
      }

      // Otherwise use most common version
      let maxCount = 0;
      let hoistedVersion = '';
      for (const [version, count] of counts) {
        if (count > maxCount) {
          maxCount = count;
          hoistedVersion = version;
        }
      }
      if (hoistedVersion) {
        this.hoistedVersions.set(name, hoistedVersion);
      }
    }

    // Link hoisted packages to root node_modules
    for (const [key, pkg] of packages) {
      const hoistedVersion = this.hoistedVersions.get(pkg.name);
      if (hoistedVersion === pkg.version) {
        await this.linkSinglePackage(key, pkg, fetchResults, binDir, result);
      }
    }

    // Link nested dependencies for packages that need different versions
    for (const [key, pkg] of packages) {
      await this.linkNestedDependencies(pkg, packages, fetchResults, result);
    }

    // Create .vex marker file
    this.writeMarker();

    return result;
  }

  /**
   * Link nested node_modules for packages that require different versions than hoisted
   */
  private async linkNestedDependencies(
    pkg: ResolvedPackage,
    allPackages: Map<string, ResolvedPackage>,
    fetchResults: Map<string, FetchResult>,
    result: LinkResult
  ): Promise<void> {
    // Get path to this package in node_modules
    const pkgPath = this.getPackagePath(pkg.name);
    if (!exists(pkgPath)) return;

    // Check each dependency
    const deps = { ...pkg.dependencies, ...pkg.peerDependencies };
    
    for (const [depName, depRange] of Object.entries(deps)) {
      const hoistedVersion = this.hoistedVersions.get(depName);
      if (!hoistedVersion) continue;

      // Find the version that was actually resolved for this dependency
      // Look through allPackages to find a version that satisfies depRange
      let neededVersion: string | null = null;
      for (const [, depPkg] of allPackages) {
        if (depPkg.name === depName) {
          // Simple check: if hoisted version doesn't match what we need, find the right one
          if (depPkg.version !== hoistedVersion) {
            neededVersion = depPkg.version;
            break;
          }
        }
      }

      // If we need a different version than what's hoisted, create nested node_modules
      if (neededVersion && neededVersion !== hoistedVersion) {
        const nestedNodeModules = path.join(pkgPath, 'node_modules');
        const nestedPkgPath = path.join(nestedNodeModules, depName);
        
        // Find the fetch result for the needed version
        const key = `${depName}@${neededVersion}`;
        const fetchResult = fetchResults.get(key);
        
        if (fetchResult) {
          mkdirp(nestedNodeModules);
          
          try {
            await this.linkPackage(fetchResult.path, nestedPkgPath);
            result.linked++;
            logger.debug(`Linked nested ${depName}@${neededVersion} in ${pkg.name}`);
          } catch (error) {
            result.errors.push(`Failed to link nested ${key} in ${pkg.name}: ${error}`);
          }
        }
      }
    }
  }

  /**
   * Link a single package
   */
  private async linkSinglePackage(
    key: string,
    pkg: ResolvedPackage,
    fetchResults: Map<string, FetchResult>,
    binDir: string,
    result: LinkResult
  ): Promise<void> {
    const fetchResult = fetchResults.get(key);
    if (!fetchResult) {
      result.errors.push(`No fetch result for ${key}`);
      return;
    }

    try {
      // Determine target path in node_modules
      const targetPath = this.getPackagePath(pkg.name);
      
      // Link package
      await this.linkPackage(fetchResult.path, targetPath);
      result.linked++;

      // Link binaries
      const binCount = await this.linkBinaries(pkg, targetPath, binDir);
      result.binaries += binCount;
    } catch (error) {
      result.errors.push(`Failed to link ${key}: ${error}`);
    }
  }

  /**
   * Link a single package from store to node_modules
   */
  private async linkPackage(storePath: string, targetPath: string): Promise<void> {
    // Create parent directories for scoped packages
    const parentDir = path.dirname(targetPath);
    if (!exists(parentDir)) {
      mkdirp(parentDir);
    }

    // Remove existing target
    if (exists(targetPath)) {
      rmrf(targetPath);
    }

    if (this.useHardlinks) {
      // Create directory and hardlink all files
      await this.hardlinkDir(storePath, targetPath);
    } else {
      // Use symlink (faster but less compatible)
      symlink(storePath, targetPath, 'junction');
    }
  }

  /**
   * Recursively hardlink directory contents
   */
  private async hardlinkDir(src: string, dest: string): Promise<void> {
    mkdirp(dest);

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.hardlinkDir(srcPath, destPath);
      } else if (entry.isFile()) {
        try {
          // Try hardlink first
          fs.linkSync(srcPath, destPath);
        } catch (error) {
          // Fall back to copy if hardlink fails (cross-device)
          fs.copyFileSync(srcPath, destPath);
        }
      } else if (entry.isSymbolicLink()) {
        const linkTarget = fs.readlinkSync(srcPath);
        symlink(linkTarget, destPath);
      }
    }
  }

  /**
   * Link binary executables
   */
  private async linkBinaries(
    pkg: ResolvedPackage,
    packagePath: string,
    binDir: string
  ): Promise<number> {
    if (!pkg.bin || Object.keys(pkg.bin).length === 0) {
      return 0;
    }

    let count = 0;

    for (const [binName, binPath] of Object.entries(pkg.bin)) {
      const srcPath = path.join(packagePath, binPath);
      const destPath = path.join(binDir, binName);

      if (!exists(srcPath)) {
        logger.debug(`Binary ${binName} not found at ${srcPath}`);
        continue;
      }

      try {
        // Remove existing
        if (exists(destPath)) {
          fs.unlinkSync(destPath);
        }

        if (isWindows()) {
          // Create cmd shim on Windows
          this.createCmdShim(srcPath, destPath);
        } else {
          // Create symlink on Unix
          const relativePath = path.relative(binDir, srcPath);
          symlink(relativePath, destPath);
          
          // Make executable
          try {
            fs.chmodSync(srcPath, 0o755);
          } catch {
            // Ignore chmod errors
          }
        }

        count++;
      } catch (error) {
        logger.debug(`Failed to create binary ${binName}: ${error}`);
      }
    }

    return count;
  }

  /**
   * Create Windows cmd shim
   */
  private createCmdShim(target: string, shimPath: string): void {
    const cmdContent = `@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n  SET PATHEXT=%PATHEXT:;.JS;=;%\r\n)\r\n\r\nENDLOCAL & GOTO #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "${target}" %*\r\n`;
    
    fs.writeFileSync(shimPath + '.cmd', cmdContent);

    // Also create PowerShell shim
    const ps1Content = `#!/usr/bin/env pwsh\r\n$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent\r\n\r\n$exe=""\r\nif ($PSVersionTable.PSVersion -lt "6.0" -or $IsWindows) {\r\n  $exe=".exe"\r\n}\r\n$ret=0\r\nif (Test-Path "$basedir/node$exe") {\r\n  if ($MyInvocation.ExpectingInput) {\r\n    $input | & "$basedir/node$exe"  "${target}" $args\r\n  } else {\r\n    & "$basedir/node$exe"  "${target}" $args\r\n  }\r\n  $ret=$LASTEXITCODE\r\n} else {\r\n  if ($MyInvocation.ExpectingInput) {\r\n    $input | & "node$exe"  "${target}" $args\r\n  } else {\r\n    & "node$exe"  "${target}" $args\r\n  }\r\n  $ret=$LASTEXITCODE\r\n}\r\nexit $ret\r\n`;
    
    fs.writeFileSync(shimPath + '.ps1', ps1Content);
  }

  /**
   * Get package path in node_modules
   */
  private getPackagePath(name: string): string {
    return path.join(this.nodeModulesDir, name);
  }

  /**
   * Write .vex marker file
   */
  private writeMarker(): void {
    const markerPath = path.join(this.nodeModulesDir, '.vex');
    const content = {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(markerPath, JSON.stringify(content, null, 2));
  }

  /**
   * Check if node_modules was created by vex
   */
  isVexManaged(): boolean {
    const markerPath = path.join(this.nodeModulesDir, '.vex');
    return exists(markerPath);
  }

  /**
   * Clean node_modules
   */
  clean(): void {
    if (exists(this.nodeModulesDir)) {
      rmrf(this.nodeModulesDir);
    }
  }

  /**
   * Get node_modules size
   */
  getSize(): number {
    if (!exists(this.nodeModulesDir)) {
      return 0;
    }

    return this.getDirectorySize(this.nodeModulesDir);
  }

  private getDirectorySize(dir: string): number {
    let size = 0;

    try {
      const stat = fs.statSync(dir);
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          size += this.getDirectorySize(path.join(dir, entry));
        }
      } else {
        size = stat.size;
      }
    } catch {
      // Ignore errors
    }

    return size;
  }
}

