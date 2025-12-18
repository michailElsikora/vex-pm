/**
 * NPM Registry API types
 */

export interface RegistryPackage {
  _id: string;
  _rev: string;
  name: string;
  description?: string;
  'dist-tags': Record<string, string>;
  versions: Record<string, RegistryPackageVersion>;
  time: Record<string, string>;
  maintainers: RegistryPerson[];
  author?: RegistryPerson;
  repository?: {
    type: string;
    url: string;
  };
  readme?: string;
  readmeFilename?: string;
  homepage?: string;
  keywords?: string[];
  bugs?: {
    url?: string;
    email?: string;
  };
  license?: string;
}

export interface RegistryPackageVersion {
  name: string;
  version: string;
  description?: string;
  main?: string;
  module?: string;
  types?: string;
  browser?: string | Record<string, string | false>;
  bin?: string | Record<string, string>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  optionalDependencies?: Record<string, string>;
  bundleDependencies?: string[];
  engines?: Record<string, string>;
  os?: string[];
  cpu?: string[];
  deprecated?: string;
  dist: RegistryDist;
  _id: string;
  _nodeVersion?: string;
  _npmVersion?: string;
  _npmUser?: RegistryPerson;
  maintainers?: RegistryPerson[];
  repository?: {
    type: string;
    url: string;
    directory?: string;
  };
  homepage?: string;
  keywords?: string[];
  author?: RegistryPerson | string;
  license?: string;
  gitHead?: string;
  _hasShrinkwrap?: boolean;
}

export interface RegistryDist {
  tarball: string;
  shasum: string;
  integrity?: string;
  fileCount?: number;
  unpackedSize?: number;
  signatures?: Array<{
    keyid: string;
    sig: string;
  }>;
}

export interface RegistryPerson {
  name: string;
  email?: string;
  url?: string;
}

export interface RegistrySearchResult {
  objects: Array<{
    package: {
      name: string;
      version: string;
      description?: string;
      keywords?: string[];
      date: string;
      links: {
        npm?: string;
        homepage?: string;
        repository?: string;
        bugs?: string;
      };
      author?: RegistryPerson;
      publisher: RegistryPerson;
      maintainers: RegistryPerson[];
    };
    score: {
      final: number;
      detail: {
        quality: number;
        popularity: number;
        maintenance: number;
      };
    };
    searchScore: number;
  }>;
  total: number;
  time: string;
}

export interface AbbreviatedPackage {
  name: string;
  modified: string;
  'dist-tags': Record<string, string>;
  versions: Record<string, AbbreviatedVersion>;
}

export interface AbbreviatedVersion {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  optionalDependencies?: Record<string, string>;
  bin?: string | Record<string, string>;
  directories?: Record<string, string>;
  dist: RegistryDist;
  engines?: Record<string, string>;
  deprecated?: string;
  _hasShrinkwrap?: boolean;
}

