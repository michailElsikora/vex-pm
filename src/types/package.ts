/**
 * Package.json types
 */

export interface PackageJson {
  name: string;
  version: string;
  description?: string;
  main?: string;
  module?: string;
  types?: string;
  typings?: string;
  browser?: string | Record<string, string | false>;
  bin?: string | Record<string, string>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  optionalDependencies?: Record<string, string>;
  bundleDependencies?: string[];
  bundledDependencies?: string[];
  engines?: Record<string, string>;
  os?: string[];
  cpu?: string[];
  private?: boolean;
  publishConfig?: {
    access?: 'public' | 'restricted';
    registry?: string;
    tag?: string;
  };
  workspaces?: string[] | { packages: string[] };
  repository?: string | {
    type: string;
    url: string;
    directory?: string;
  };
  bugs?: string | {
    url?: string;
    email?: string;
  };
  homepage?: string;
  keywords?: string[];
  author?: string | {
    name: string;
    email?: string;
    url?: string;
  };
  contributors?: Array<string | {
    name: string;
    email?: string;
    url?: string;
  }>;
  license?: string;
  files?: string[];
  sideEffects?: boolean | string[];
  exports?: string | Record<string, unknown>;
  imports?: Record<string, unknown>;
  type?: 'module' | 'commonjs';
  overrides?: Record<string, string | Record<string, string>>;
  resolutions?: Record<string, string>;
}

export interface PackageMeta {
  name: string;
  version: string;
  resolved: string;
  integrity: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  bin?: string | Record<string, string>;
  os?: string[];
  cpu?: string[];
  engines?: Record<string, string>;
}

export type DependencyType = 
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies';

export interface DependencySpec {
  name: string;
  version: string;
  type: DependencyType;
  alias?: string;
}

