/**
 * vex - Fast, disk-efficient package manager for Node.js
 * Library exports
 */

// Core
export { Resolver, ResolutionResult, DependencyNode } from './core/resolver';
export { Fetcher, FetchResult, FetcherOptions } from './core/fetcher';
export { Linker, LinkResult, LinkerOptions } from './core/linker';
export { LockfileManager } from './core/lockfile';
export * as semver from './core/semver';

// Registry
export { RegistryClient, RegistryClientOptions } from './registry/client';
export { MetadataCache } from './registry/cache';

// Store
export { Store, StoredPackage } from './store';

// Config
export { ConfigLoader, ConfigLoaderOptions } from './config';

// Types
export * from './types';

// Utils
export { logger } from './utils/logger';
export { ProgressTracker, Spinner } from './utils/progress';

