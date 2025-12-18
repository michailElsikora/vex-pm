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

    // Separate direct and transitive dependencies
    // Direct dependencies should be linked last to take priority
    const directPackages: Array<[string, ResolvedPackage]> = [];
    const transitivePackages: Array<[string, ResolvedPackage]> = [];

    for (const [key, pkg] of packages) {
      const directVersion = this.directDependencies[pkg.name];
      if (directVersion && pkg.version === directVersion) {
        directPackages.push([key, pkg]);
      } else {
        transitivePackages.push([key, pkg]);
      }
    }

    // Link transitive dependencies first
    for (const [key, pkg] of transitivePackages) {
      await this.linkSinglePackage(key, pkg, fetchResults, binDir, result);
    }

    // Link direct dependencies last (they override transitive)
    for (const [key, pkg] of directPackages) {
      await this.linkSinglePackage(key, pkg, fetchResults, binDir, result);
    }

    // Create .vex marker file
    this.writeMarker();

    return result;
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

