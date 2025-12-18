/**
 * Tarball parser (zero dependencies)
 * Extracts .tgz files downloaded from npm registry
 */

import * as zlib from 'zlib';
import * as fs from 'fs';
import * as path from 'path';
import { mkdirp } from '../utils/fs';

interface TarHeader {
  name: string;
  mode: number;
  uid: number;
  gid: number;
  size: number;
  mtime: number;
  type: string;
  linkname: string;
}

/**
 * Extract tarball buffer to directory
 */
export async function extractTarball(tarballBuffer: Buffer, destDir: string): Promise<void> {
  // Decompress gzip
  const tarBuffer = await decompress(tarballBuffer);
  
  // Parse and extract tar
  await extractTar(tarBuffer, destDir);
}

/**
 * Decompress gzip buffer
 */
function decompress(buffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.gunzip(buffer, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

/**
 * Extract tar buffer to directory
 */
async function extractTar(buffer: Buffer, destDir: string): Promise<void> {
  // First pass: collect all file names to find common prefix
  const entries: Array<{ header: TarHeader; content: Buffer }> = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (isZeroBlock(buffer, offset)) {
      break;
    }

    const header = parseHeader(buffer, offset);
    if (!header) {
      break;
    }

    offset += 512;
    const content = buffer.subarray(offset, offset + header.size);
    const paddedSize = Math.ceil(header.size / 512) * 512;
    offset += paddedSize;

    // Skip pax headers and empty names
    if (header.name && header.type !== 'g' && header.type !== 'x') {
      entries.push({ header, content });
    }
  }

  // Find common prefix (npm packages have package/ or some-name/ prefix)
  let commonPrefix = '';
  if (entries.length > 0) {
    // Find first file entry (skip directories)
    const firstFile = entries.find(e => e.header.type === '0' || e.header.type === '');
    const checkName = firstFile ? firstFile.header.name : entries[0].header.name;
    
    const firstSlash = checkName.indexOf('/');
    if (firstSlash > 0) {
      const potentialPrefix = checkName.substring(0, firstSlash + 1);
      const allHavePrefix = entries.every(e => 
        e.header.name.startsWith(potentialPrefix) || e.header.name === potentialPrefix.slice(0, -1)
      );
      if (allHavePrefix) {
        commonPrefix = potentialPrefix;
      }
    }
  }

  // Second pass: extract files
  for (const { header, content } of entries) {
    // Remove common prefix
    let fileName = header.name;
    if (commonPrefix && fileName.startsWith(commonPrefix)) {
      fileName = fileName.slice(commonPrefix.length);
    }

    // Skip empty names
    if (!fileName) {
      continue;
    }

    const destPath = path.join(destDir, fileName);

    switch (header.type) {
      case '0': // Regular file
      case '': // Regular file (old format)
        await writeFile(destPath, content, header.mode);
        break;
      case '5': // Directory
        mkdirp(destPath);
        break;
      case '2': // Symlink
        await createSymlink(header.linkname, destPath);
        break;
      // Skip other types (hard links, etc.)
    }
  }
}

/**
 * Parse tar header
 */
function parseHeader(buffer: Buffer, offset: number): TarHeader | null {
  const header = buffer.subarray(offset, offset + 512);
  
  // Check for empty header
  if (isZeroBlock(buffer, offset)) {
    return null;
  }

  // Parse name (first 100 bytes, null-terminated)
  let name = parseString(header, 0, 100);
  
  // Check for UStar extended name
  const prefix = parseString(header, 345, 155);
  if (prefix) {
    name = prefix + '/' + name;
  }

  const mode = parseOctal(header, 100, 8);
  const uid = parseOctal(header, 108, 8);
  const gid = parseOctal(header, 116, 8);
  const size = parseOctal(header, 124, 12);
  const mtime = parseOctal(header, 136, 12);
  const type = String.fromCharCode(header[156]) || '0';
  const linkname = parseString(header, 157, 100);

  return { name, mode, uid, gid, size, mtime, type, linkname };
}

/**
 * Parse null-terminated string from buffer
 */
function parseString(buffer: Buffer, offset: number, length: number): string {
  let end = offset;
  while (end < offset + length && buffer[end] !== 0) {
    end++;
  }
  return buffer.subarray(offset, end).toString('utf-8');
}

/**
 * Parse octal number from buffer
 */
function parseOctal(buffer: Buffer, offset: number, length: number): number {
  const str = parseString(buffer, offset, length).trim();
  return parseInt(str, 8) || 0;
}

/**
 * Check if block is all zeros
 */
function isZeroBlock(buffer: Buffer, offset: number): boolean {
  for (let i = 0; i < 512; i++) {
    if (buffer[offset + i] !== 0) {
      return false;
    }
  }
  return true;
}

/**
 * Write file with directory creation
 */
async function writeFile(filePath: string, content: Buffer, mode: number): Promise<void> {
  const dir = path.dirname(filePath);
  mkdirp(dir);
  
  fs.writeFileSync(filePath, content);
  
  // Set file mode (executable, etc.)
  if (mode) {
    try {
      fs.chmodSync(filePath, mode);
    } catch {
      // Ignore chmod errors on Windows
    }
  }
}

/**
 * Create symlink
 */
async function createSymlink(target: string, linkPath: string): Promise<void> {
  const dir = path.dirname(linkPath);
  mkdirp(dir);
  
  try {
    if (fs.existsSync(linkPath)) {
      fs.unlinkSync(linkPath);
    }
    fs.symlinkSync(target, linkPath);
  } catch {
    // Ignore symlink errors (may require admin on Windows)
  }
}

