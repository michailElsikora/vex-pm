/**
 * Platform detection and OS-specific utilities
 */

import * as os from 'os';
import * as path from 'path';

export type Platform = 'darwin' | 'linux' | 'win32';

/**
 * Get current platform
 */
export function getPlatform(): Platform {
  return os.platform() as Platform;
}

/**
 * Check if running on Windows
 */
export function isWindows(): boolean {
  return os.platform() === 'win32';
}

/**
 * Check if running on macOS
 */
export function isMac(): boolean {
  return os.platform() === 'darwin';
}

/**
 * Check if running on Linux
 */
export function isLinux(): boolean {
  return os.platform() === 'linux';
}

/**
 * Get home directory
 */
export function getHomeDir(): string {
  return os.homedir();
}

/**
 * Get vex global store directory
 */
export function getStoreDir(): string {
  const home = getHomeDir();
  
  if (isWindows()) {
    return path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'vex-store');
  }
  
  return path.join(home, '.vex-store');
}

/**
 * Get vex cache directory
 */
export function getCacheDir(): string {
  const home = getHomeDir();
  
  if (isWindows()) {
    return path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'vex-cache');
  }
  
  if (isMac()) {
    return path.join(home, 'Library', 'Caches', 'vex');
  }
  
  return path.join(process.env.XDG_CACHE_HOME || path.join(home, '.cache'), 'vex');
}

/**
 * Get vex config directory
 */
export function getConfigDir(): string {
  const home = getHomeDir();
  
  if (isWindows()) {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'vex');
  }
  
  if (isMac()) {
    return path.join(home, '.config', 'vex');
  }
  
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'vex');
}

/**
 * Get temporary directory
 */
export function getTempDir(): string {
  return os.tmpdir();
}

/**
 * Get number of CPUs for parallel operations
 */
export function getCpuCount(): number {
  return os.cpus().length;
}

/**
 * Get available memory in bytes
 */
export function getAvailableMemory(): number {
  return os.freemem();
}

/**
 * Get path separator
 */
export function getPathSeparator(): string {
  return path.sep;
}

/**
 * Normalize path for current platform
 */
export function normalizePath(p: string): string {
  return path.normalize(p);
}

/**
 * Get shell command for current platform
 */
export function getShellCommand(): { shell: string; flag: string } {
  if (isWindows()) {
    return { shell: process.env.COMSPEC || 'cmd.exe', flag: '/c' };
  }
  return { shell: process.env.SHELL || '/bin/sh', flag: '-c' };
}

/**
 * Get executable extension for current platform
 */
export function getExecutableExtension(): string {
  return isWindows() ? '.exe' : '';
}

/**
 * Get script extensions for current platform
 */
export function getScriptExtensions(): string[] {
  if (isWindows()) {
    return ['.cmd', '.bat', '.ps1', '.exe'];
  }
  return ['', '.sh'];
}

