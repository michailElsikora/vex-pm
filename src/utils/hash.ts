/**
 * Hashing utilities using Node.js crypto
 */

import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * Calculate SHA512 hash of a string or buffer
 */
export function sha512(data: string | Buffer): string {
  return crypto.createHash('sha512').update(data).digest('hex');
}

/**
 * Calculate SHA256 hash of a string or buffer
 */
export function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Calculate SHA1 hash of a string or buffer
 */
export function sha1(data: string | Buffer): string {
  return crypto.createHash('sha1').update(data).digest('hex');
}

/**
 * Calculate MD5 hash of a string or buffer
 */
export function md5(data: string | Buffer): string {
  return crypto.createHash('md5').update(data).digest('hex');
}

/**
 * Calculate hash of a file
 */
export function hashFile(filePath: string, algorithm: 'sha512' | 'sha256' | 'sha1' | 'md5' = 'sha512'): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Calculate hash of a file synchronously
 */
export function hashFileSync(filePath: string, algorithm: 'sha512' | 'sha256' | 'sha1' | 'md5' = 'sha512'): string {
  const data = fs.readFileSync(filePath);
  return crypto.createHash(algorithm).update(data).digest('hex');
}

/**
 * Verify integrity string (format: algorithm-base64hash)
 * Example: sha512-abc123...
 */
export function verifyIntegrity(data: Buffer, integrity: string): boolean {
  const parts = integrity.split('-');
  if (parts.length !== 2) return false;
  
  const [algorithm, expectedHash] = parts;
  const supportedAlgorithms = ['sha512', 'sha256', 'sha1'];
  
  if (!supportedAlgorithms.includes(algorithm)) {
    return false;
  }
  
  const actualHash = crypto.createHash(algorithm).update(data).digest('base64');
  return actualHash === expectedHash;
}

/**
 * Generate integrity string from data
 */
export function generateIntegrity(data: Buffer, algorithm: 'sha512' | 'sha256' | 'sha1' = 'sha512'): string {
  const hash = crypto.createHash(algorithm).update(data).digest('base64');
  return `${algorithm}-${hash}`;
}

/**
 * Generate short hash for content addressing
 */
export function contentHash(data: string | Buffer): string {
  return sha512(data).substring(0, 32);
}

/**
 * Generate random ID
 */
export function randomId(length: number = 16): string {
  return crypto.randomBytes(length).toString('hex');
}

