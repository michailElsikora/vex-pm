/**
 * File system utilities
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Check if path exists
 */
export function exists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if path is a directory
 */
export function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if path is a file
 */
export function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Create directory recursively
 */
export function mkdirp(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Remove directory recursively
 */
export function rmrf(p: string): void {
  if (!exists(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

/**
 * Read JSON file
 */
export function readJson<T = unknown>(filePath: string): T {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * Write JSON file
 */
export function writeJson(filePath: string, data: unknown, pretty = true): void {
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  fs.writeFileSync(filePath, content + '\n', 'utf-8');
}

/**
 * Read text file
 */
export function readText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Write text file
 */
export function writeText(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Copy file
 */
export function copyFile(src: string, dest: string): void {
  const destDir = path.dirname(dest);
  if (!exists(destDir)) {
    mkdirp(destDir);
  }
  fs.copyFileSync(src, dest);
}

/**
 * Create hardlink
 */
export function hardlink(src: string, dest: string): void {
  const destDir = path.dirname(dest);
  if (!exists(destDir)) {
    mkdirp(destDir);
  }
  if (exists(dest)) {
    fs.unlinkSync(dest);
  }
  fs.linkSync(src, dest);
}

/**
 * Create symlink
 */
export function symlink(target: string, linkPath: string, type: 'file' | 'dir' | 'junction' = 'file'): void {
  const linkDir = path.dirname(linkPath);
  if (!exists(linkDir)) {
    mkdirp(linkDir);
  }
  if (exists(linkPath)) {
    fs.unlinkSync(linkPath);
  }
  fs.symlinkSync(target, linkPath, type);
}

/**
 * List directory contents
 */
export function readdir(dir: string): string[] {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir);
}

/**
 * Walk directory recursively
 */
export function* walk(dir: string): Generator<string> {
  if (!exists(dir)) return;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else {
      yield fullPath;
    }
  }
}

/**
 * Get file stats
 */
export function stat(p: string): fs.Stats | null {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

/**
 * Get file size
 */
export function fileSize(p: string): number {
  const s = stat(p);
  return s ? s.size : 0;
}

/**
 * Find file up the directory tree
 */
export function findUp(filename: string, startDir: string = process.cwd()): string | null {
  let currentDir = startDir;
  
  while (true) {
    const filePath = path.join(currentDir, filename);
    if (exists(filePath)) {
      return filePath;
    }
    
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

/**
 * Ensure parent directory exists
 */
export function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!exists(dir)) {
    mkdirp(dir);
  }
}

/**
 * Atomic write (write to temp file then rename)
 */
export function atomicWrite(filePath: string, content: string | Buffer): void {
  const tempPath = filePath + '.tmp.' + Date.now();
  ensureDir(filePath);
  fs.writeFileSync(tempPath, content);
  fs.renameSync(tempPath, filePath);
}

