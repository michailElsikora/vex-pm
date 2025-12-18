/**
 * Configuration loader
 */

import * as path from 'path';
import * as fs from 'fs';
import { VexConfig, DEFAULT_CONFIG } from '../types/config';
import { PackageJson } from '../types/package';
import { exists, readJson, findUp } from '../utils/fs';
import { getConfigDir } from '../utils/platform';
import { logger } from '../utils/logger';

const CONFIG_FILES = [
  'vex.config.json',
  'vex.config.js',
  '.vexrc',
  '.vexrc.json',
];

export interface ConfigLoaderOptions {
  cwd?: string;
  configPath?: string;
}

export class ConfigLoader {
  private cwd: string;
  private configPath?: string;

  constructor(options: ConfigLoaderOptions = {}) {
    this.cwd = options.cwd || process.cwd();
    this.configPath = options.configPath;
  }

  /**
   * Load configuration from all sources
   */
  load(): VexConfig {
    let config: VexConfig = { ...DEFAULT_CONFIG };

    // 1. Load global config
    const globalConfig = this.loadGlobalConfig();
    if (globalConfig) {
      config = this.merge(config, globalConfig);
    }

    // 2. Load project config file
    const projectConfig = this.loadProjectConfig();
    if (projectConfig) {
      config = this.merge(config, projectConfig);
    }

    // 3. Load from package.json vex field
    const packageConfig = this.loadPackageConfig();
    if (packageConfig) {
      config = this.merge(config, packageConfig);
    }

    // 4. Load from environment variables
    const envConfig = this.loadEnvConfig();
    config = this.merge(config, envConfig);

    return config;
  }

  /**
   * Load global configuration
   */
  private loadGlobalConfig(): VexConfig | null {
    const globalConfigPath = path.join(getConfigDir(), 'config.json');
    
    if (exists(globalConfigPath)) {
      try {
        return readJson<VexConfig>(globalConfigPath);
      } catch (error) {
        logger.debug(`Failed to load global config: ${error}`);
      }
    }

    return null;
  }

  /**
   * Load project configuration file
   */
  private loadProjectConfig(): VexConfig | null {
    // Check explicit path first
    if (this.configPath) {
      const fullPath = path.isAbsolute(this.configPath) 
        ? this.configPath 
        : path.join(this.cwd, this.configPath);
      
      if (exists(fullPath)) {
        return this.loadConfigFile(fullPath);
      }
      
      logger.warn(`Config file not found: ${this.configPath}`);
      return null;
    }

    // Search for config files
    for (const filename of CONFIG_FILES) {
      const configPath = findUp(filename, this.cwd);
      if (configPath) {
        return this.loadConfigFile(configPath);
      }
    }

    return null;
  }

  /**
   * Load configuration from package.json
   */
  private loadPackageConfig(): VexConfig | null {
    const packageJsonPath = findUp('package.json', this.cwd);
    
    if (!packageJsonPath) {
      return null;
    }

    try {
      const packageJson = readJson<PackageJson & { vex?: VexConfig }>(packageJsonPath);
      return packageJson.vex || null;
    } catch {
      return null;
    }
  }

  /**
   * Load configuration from environment variables
   */
  private loadEnvConfig(): VexConfig {
    const config: VexConfig = {};

    // VEX_REGISTRY
    if (process.env.VEX_REGISTRY) {
      config.registry = process.env.VEX_REGISTRY;
    }

    // VEX_TOKEN
    if (process.env.VEX_TOKEN) {
      config.authToken = process.env.VEX_TOKEN;
    }

    // VEX_STORE_DIR
    if (process.env.VEX_STORE_DIR) {
      config.storeDir = process.env.VEX_STORE_DIR;
    }

    // VEX_CACHE_DIR
    if (process.env.VEX_CACHE_DIR) {
      config.cacheDir = process.env.VEX_CACHE_DIR;
    }

    // VEX_CONCURRENCY
    if (process.env.VEX_CONCURRENCY) {
      const concurrency = parseInt(process.env.VEX_CONCURRENCY, 10);
      if (!isNaN(concurrency)) {
        config.concurrency = concurrency;
      }
    }

    // VEX_OFFLINE
    if (process.env.VEX_OFFLINE === 'true') {
      config.offline = true;
    }

    // VEX_PREFER_OFFLINE
    if (process.env.VEX_PREFER_OFFLINE === 'true') {
      config.preferOffline = true;
    }

    // VEX_IGNORE_SCRIPTS
    if (process.env.VEX_IGNORE_SCRIPTS === 'true') {
      config.ignoreScripts = true;
    }

    return config;
  }

  /**
   * Load a config file
   */
  private loadConfigFile(filePath: string): VexConfig | null {
    try {
      const ext = path.extname(filePath);

      if (ext === '.js') {
        // JavaScript config
        delete require.cache[require.resolve(filePath)];
        const config = require(filePath);
        return config.default || config;
      }

      // JSON config
      return readJson<VexConfig>(filePath);
    } catch (error) {
      logger.warn(`Failed to load config ${filePath}: ${error}`);
      return null;
    }
  }

  /**
   * Merge configurations
   */
  private merge(base: VexConfig, override: VexConfig): VexConfig {
    const result = { ...base };

    for (const [key, value] of Object.entries(override)) {
      if (value !== undefined) {
        (result as Record<string, unknown>)[key] = value;
      }
    }

    return result;
  }

  /**
   * Save configuration to project file
   */
  saveProjectConfig(config: VexConfig): void {
    const configPath = path.join(this.cwd, 'vex.config.json');
    const content = JSON.stringify(config, null, 2) + '\n';
    fs.writeFileSync(configPath, content);
  }

  /**
   * Save configuration to global file
   */
  saveGlobalConfig(config: VexConfig): void {
    const configDir = getConfigDir();
    
    if (!exists(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const configPath = path.join(configDir, 'config.json');
    const content = JSON.stringify(config, null, 2) + '\n';
    fs.writeFileSync(configPath, content);
  }

  /**
   * Get package.json from cwd
   */
  getPackageJson(): PackageJson | null {
    const packageJsonPath = path.join(this.cwd, 'package.json');
    
    if (!exists(packageJsonPath)) {
      return null;
    }

    try {
      return readJson<PackageJson>(packageJsonPath);
    } catch {
      return null;
    }
  }

  /**
   * Save package.json
   */
  savePackageJson(packageJson: PackageJson): void {
    const packageJsonPath = path.join(this.cwd, 'package.json');
    const content = JSON.stringify(packageJson, null, 2) + '\n';
    fs.writeFileSync(packageJsonPath, content);
  }
}

