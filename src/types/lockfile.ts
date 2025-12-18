/**
 * Lockfile types
 */

export interface Lockfile {
  version: number;
  packages: Record<string, LockfilePackage>;
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface LockfilePackage {
  version: string;
  resolved: string;
  integrity: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  bin?: string | Record<string, string>;
  engines?: Record<string, string>;
  os?: string[];
  cpu?: string[];
  optional?: boolean;
  dev?: boolean;
  peer?: boolean;
}

export interface ResolvedPackage {
  name: string;
  version: string;
  resolved: string;
  integrity: string;
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
  bin: Record<string, string>;
  optional: boolean;
  dev: boolean;
}

