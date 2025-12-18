/**
 * NPM Registry HTTP client (zero dependencies)
 */

import * as https from 'https';
import * as http from 'http';
import * as zlib from 'zlib';
import { URL } from 'url';
import { RegistryPackage, AbbreviatedPackage } from '../types/registry';
import { logger } from '../utils/logger';

export interface RegistryClientOptions {
  registry: string;
  token?: string;
  timeout?: number;
  retries?: number;
  userAgent?: string;
}

export interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeout?: number;
  compressed?: boolean;
}

interface HttpResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

export class RegistryClient {
  private registry: string;
  private token?: string;
  private timeout: number;
  private retries: number;
  private userAgent: string;

  constructor(options: RegistryClientOptions) {
    this.registry = options.registry.replace(/\/$/, '');
    this.token = options.token;
    this.timeout = options.timeout || 30000;
    this.retries = options.retries || 3;
    this.userAgent = options.userAgent || 'vex/1.0.0';
  }

  /**
   * Get full package metadata
   */
  async getPackage(name: string): Promise<RegistryPackage> {
    const url = this.getPackageUrl(name);
    const response = await this.fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });
    return JSON.parse(response.body.toString('utf-8'));
  }

  /**
   * Get abbreviated package metadata (faster, less data)
   */
  async getAbbreviatedPackage(name: string): Promise<AbbreviatedPackage> {
    const url = this.getPackageUrl(name);
    const response = await this.fetch(url, {
      headers: {
        'Accept': 'application/vnd.npm.install-v1+json',
      },
    });
    return JSON.parse(response.body.toString('utf-8'));
  }

  /**
   * Download tarball
   */
  async downloadTarball(url: string): Promise<Buffer> {
    const response = await this.fetch(url, {
      compressed: true,
    });
    return response.body;
  }

  /**
   * Check if package exists
   */
  async packageExists(name: string): Promise<boolean> {
    try {
      const url = this.getPackageUrl(name);
      const response = await this.fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      return response.statusCode === 200;
    } catch {
      return false;
    }
  }

  private getPackageUrl(name: string): string {
    // Handle scoped packages
    const encodedName = name.startsWith('@') 
      ? `@${encodeURIComponent(name.slice(1))}` 
      : encodeURIComponent(name);
    return `${this.registry}/${encodedName}`;
  }

  private async fetch(url: string, options: FetchOptions = {}): Promise<HttpResponse> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        return await this.doFetch(url, options);
      } catch (error) {
        lastError = error as Error;
        logger.debug(`Fetch attempt ${attempt + 1} failed: ${lastError.message}`);
        
        if (attempt < this.retries - 1) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError || new Error('Fetch failed');
  }

  private doFetch(url: string, options: FetchOptions): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const headers: Record<string, string> = {
        'User-Agent': this.userAgent,
        'Accept-Encoding': 'gzip, deflate',
        ...options.headers,
      };

      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const requestOptions: https.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers,
        timeout: options.timeout || this.timeout,
      };

      const req = httpModule.request(requestOptions, (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          let body = Buffer.concat(chunks);

          // Decompress if needed
          const encoding = res.headers['content-encoding'];
          if (encoding === 'gzip') {
            try {
              body = zlib.gunzipSync(body);
            } catch (e) {
              // May not be compressed despite header
            }
          } else if (encoding === 'deflate') {
            try {
              body = zlib.inflateSync(body);
            } catch (e) {
              // May not be compressed despite header
            }
          }

          const statusCode = res.statusCode || 0;

          if (statusCode >= 400) {
            const errorBody = body.toString('utf-8');
            let errorMessage = `HTTP ${statusCode}`;
            try {
              const parsed = JSON.parse(errorBody);
              errorMessage = parsed.error || parsed.message || errorMessage;
            } catch {
              // Not JSON
            }
            reject(new Error(`${errorMessage} (${url})`));
            return;
          }

          resolve({
            statusCode,
            headers: res.headers as Record<string, string | string[] | undefined>,
            body,
          });
        });

        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout: ${url}`));
      });

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let defaultClient: RegistryClient | null = null;

export function getRegistryClient(options?: Partial<RegistryClientOptions>): RegistryClient {
  if (!defaultClient || options) {
    defaultClient = new RegistryClient({
      registry: options?.registry || 'https://registry.npmjs.org',
      token: options?.token,
      timeout: options?.timeout,
      retries: options?.retries,
    });
  }
  return defaultClient;
}

