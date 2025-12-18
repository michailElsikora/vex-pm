/**
 * Publish command - publishes package to registry
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { CommandContext } from '../index';
import { ConfigLoader } from '../../config';
import { logger } from '../../utils/logger';
import { Spinner } from '../../utils/progress';
import { sha1, generateIntegrity } from '../../utils/hash';
import { mkdirp, exists, readdir } from '../../utils/fs';

interface TarEntry {
  name: string;
  content: Buffer;
  mode: number;
}

export async function publishCommand(ctx: CommandContext): Promise<number> {
  const configLoader = new ConfigLoader({ cwd: ctx.cwd });
  const config = configLoader.load();
  const packageJson = configLoader.getPackageJson();

  if (!packageJson) {
    logger.error('No package.json found in current directory');
    return 1;
  }

  if (!packageJson.name) {
    logger.error('Package name is required in package.json');
    return 1;
  }

  if (!packageJson.version) {
    logger.error('Package version is required in package.json');
    return 1;
  }

  // Check for auth token
  const registry = config.registry || 'http://localhost:4873';
  const token = config.authToken || getStoredToken(registry);
  if (!token) {
    logger.error('Not logged in. Run "vex login" first.');
    return 1;
  }

  if (ctx.verbose) {
    logger.log(`Registry: ${registry}`);
    logger.log(`Package: ${packageJson.name}@${packageJson.version}`);
    logger.log(`Token: ${token.substring(0, 10)}...`);
  }

  const spinner = new Spinner(`Publishing ${packageJson.name}@${packageJson.version}...`, ctx.silent);
  spinner.start();

  try {
    // Create tarball
    if (ctx.verbose) logger.log('Creating tarball...');
    const tarball = await createTarball(ctx.cwd, packageJson);
    if (ctx.verbose) logger.log(`Tarball size: ${tarball.length} bytes`);
    
    // Calculate hashes
    const shasum = sha1(tarball);
    const integrity = generateIntegrity(tarball);
    if (ctx.verbose) logger.log(`Shasum: ${shasum}`);

    // Read README if exists
    let readme = '';
    const readmePath = findReadme(ctx.cwd);
    if (readmePath) {
      readme = fs.readFileSync(readmePath, 'utf-8');
    }

    // Build publish payload
    const payload = {
      _id: packageJson.name,
      name: packageJson.name,
      description: packageJson.description || '',
      'dist-tags': {
        latest: packageJson.version,
      },
      versions: {
        [packageJson.version]: {
          name: packageJson.name,
          version: packageJson.version,
          description: packageJson.description,
          main: packageJson.main,
          types: packageJson.types,
          scripts: packageJson.scripts,
          dependencies: packageJson.dependencies,
          devDependencies: packageJson.devDependencies,
          peerDependencies: packageJson.peerDependencies,
          optionalDependencies: packageJson.optionalDependencies,
          bin: packageJson.bin,
          engines: packageJson.engines,
          keywords: packageJson.keywords,
          author: packageJson.author,
          license: packageJson.license,
          repository: packageJson.repository,
          homepage: packageJson.homepage,
          bugs: packageJson.bugs,
          readme,
          dist: {
            shasum,
            integrity,
            tarball: '', // Will be set by server
          },
        },
      },
      readme,
      _attachments: {
        [`${packageJson.name}-${packageJson.version}.tgz`]: {
          content_type: 'application/octet-stream',
          data: tarball.toString('base64'),
          length: tarball.length,
        },
      },
    };

    // Publish to registry
    const url = `${registry}/${encodeURIComponent(packageJson.name)}`;
    if (ctx.verbose) logger.log(`PUT ${url}`);
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (ctx.verbose) logger.log(`Response status: ${response.status}`);
    
    if (!response.ok) {
      const responseText = await response.text();
      if (ctx.verbose) logger.log(`Response body: ${responseText.substring(0, 500)}`);
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = JSON.parse(responseText) as { error?: string; message?: string };
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        if (responseText) {
          errorMessage = responseText.substring(0, 200);
        }
      }
      throw new Error(errorMessage);
    }

    spinner.success(`Published ${packageJson.name}@${packageJson.version}`);
    
    logger.newline();
    logger.log(`  Registry: ${registry}`);
    logger.log(`  Size: ${(tarball.length / 1024).toFixed(2)} KB`);
    logger.log(`  Shasum: ${shasum}`);
    
    return 0;
  } catch (error) {
    spinner.fail(`Publish failed`);
    if (error instanceof Error) {
      logger.error(error.message);
      if (ctx.verbose && error.stack) {
        logger.log(error.stack);
      }
    } else {
      logger.error(String(error));
    }
    return 1;
  }
}

/**
 * Create tarball from package directory
 */
async function createTarball(cwd: string, packageJson: { name: string; version: string; files?: string[] }): Promise<Buffer> {
  const entries: TarEntry[] = [];
  const prefix = 'package';
  
  // Always include package.json
  const pkgJsonContent = fs.readFileSync(path.join(cwd, 'package.json'));
  entries.push({
    name: `${prefix}/package.json`,
    content: pkgJsonContent,
    mode: 0o644,
  });

  // Collect files to include
  const filesToInclude = new Set<string>();
  
  // Add files from "files" field in package.json
  if (packageJson.files && Array.isArray(packageJson.files)) {
    for (const pattern of packageJson.files) {
      collectFiles(cwd, pattern, filesToInclude);
    }
  } else {
    // Default: include all files except node_modules, .git, etc
    collectAllFiles(cwd, filesToInclude);
  }

  // Always include certain files
  const alwaysInclude = ['README.md', 'README', 'readme.md', 'LICENSE', 'LICENSE.md', 'CHANGELOG.md'];
  for (const file of alwaysInclude) {
    const filePath = path.join(cwd, file);
    if (exists(filePath)) {
      filesToInclude.add(file);
    }
  }

  // Remove package.json (already added)
  filesToInclude.delete('package.json');

  // Add all files
  for (const relativePath of filesToInclude) {
    const fullPath = path.join(cwd, relativePath);
    if (!exists(fullPath)) continue;
    
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      // Add directory entry
      entries.push({
        name: `${prefix}/${relativePath}/`,
        content: Buffer.alloc(0),
        mode: 0o755,
      });
    } else {
      entries.push({
        name: `${prefix}/${relativePath}`,
        content: fs.readFileSync(fullPath),
        mode: stat.mode & 0o777,
      });
    }
  }

  // Create tar
  const tar = createTar(entries);
  
  // Gzip compress
  return new Promise((resolve, reject) => {
    zlib.gzip(tar, { level: 9 }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

/**
 * Create tar buffer from entries
 */
function createTar(entries: TarEntry[]): Buffer {
  const blocks: Buffer[] = [];

  for (const entry of entries) {
    // Create header
    const header = Buffer.alloc(512);
    
    // Name (first 100 bytes)
    header.write(entry.name.slice(0, 100), 0);
    
    // Mode (octal string, 8 bytes starting at 100)
    header.write(entry.mode.toString(8).padStart(7, '0'), 100, 7);
    header[107] = 0;
    
    // UID (8 bytes at 108)
    header.write('0000000', 108, 7);
    header[115] = 0;
    
    // GID (8 bytes at 116)
    header.write('0000000', 116, 7);
    header[123] = 0;
    
    // Size (12 bytes octal at 124)
    header.write(entry.content.length.toString(8).padStart(11, '0'), 124, 11);
    header[135] = 0;
    
    // Mtime (12 bytes octal at 136)
    const mtime = Math.floor(Date.now() / 1000);
    header.write(mtime.toString(8).padStart(11, '0'), 136, 11);
    header[147] = 0;
    
    // Checksum placeholder (8 spaces at 148)
    header.fill(0x20, 148, 156);
    
    // Type flag (at 156)
    header[156] = entry.name.endsWith('/') ? 53 : 48; // '5' for dir, '0' for file
    
    // Linkname (100 bytes at 157) - empty
    
    // Magic (at 257)
    header.write('ustar', 257, 5);
    header[262] = 0;
    
    // Version (at 263)
    header.write('00', 263, 2);
    
    // Calculate checksum
    let checksum = 0;
    for (let i = 0; i < 512; i++) {
      checksum += header[i];
    }
    header.write(checksum.toString(8).padStart(6, '0'), 148, 6);
    header[154] = 0;
    header[155] = 0x20;

    blocks.push(header);

    // Add content (padded to 512 bytes)
    if (entry.content.length > 0) {
      blocks.push(entry.content);
      const padding = 512 - (entry.content.length % 512);
      if (padding < 512) {
        blocks.push(Buffer.alloc(padding));
      }
    }
  }

  // Add two empty blocks at end
  blocks.push(Buffer.alloc(1024));

  return Buffer.concat(blocks);
}

/**
 * Collect files matching pattern
 */
function collectFiles(cwd: string, pattern: string, files: Set<string>): void {
  const fullPath = path.join(cwd, pattern);
  
  if (exists(fullPath)) {
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      collectAllFiles(fullPath, files, pattern);
    } else {
      files.add(pattern);
    }
  }
}

/**
 * Collect all files recursively
 */
function collectAllFiles(dir: string, files: Set<string>, prefix = ''): void {
  const ignorePatterns = [
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    '.DS_Store',
    'npm-debug.log',
    '.npmrc',
    '.gitignore',
    '.npmignore',
    'vex_modules',
    'vex-lock.json',
  ];

  const entries = readdir(dir);
  
  for (const entry of entries) {
    if (ignorePatterns.includes(entry)) continue;
    if (entry.startsWith('.')) continue;
    
    const relativePath = prefix ? `${prefix}/${entry}` : entry;
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      collectAllFiles(fullPath, files, relativePath);
    } else {
      files.add(relativePath);
    }
  }
}

/**
 * Find README file
 */
function findReadme(cwd: string): string | null {
  const names = ['README.md', 'readme.md', 'README', 'readme', 'README.txt'];
  for (const name of names) {
    const filePath = path.join(cwd, name);
    if (exists(filePath)) {
      return filePath;
    }
  }
  return null;
}

/**
 * Get stored auth token
 */
function getStoredToken(registry: string): string | null {
  const configPath = path.join(process.env.HOME || '', '.vexrc');
  if (!exists(configPath)) {
    return null;
  }
  
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config.tokens?.[registry] || config.token || null;
  } catch {
    return null;
  }
}

