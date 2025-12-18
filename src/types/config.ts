/**
 * Configuration types
 */

export interface VexConfig {
  // Registry settings
  registry?: string;
  registries?: Record<string, string>;
  
  // Authentication
  authToken?: string;
  authTokens?: Record<string, string>;
  
  // Installation behavior
  saveExact?: boolean;
  saveDev?: boolean;
  production?: boolean;
  frozen?: boolean;
  preferOffline?: boolean;
  offline?: boolean;
  
  // Peer dependencies
  autoInstallPeers?: boolean;
  strictPeerDependencies?: boolean;
  
  // Performance
  concurrency?: number;
  networkTimeout?: number;
  retries?: number;
  
  // Store
  storeDir?: string;
  cacheDir?: string;
  
  // Node modules
  nodeLinker?: 'hoisted' | 'isolated' | 'pnp';
  shamefullyHoist?: boolean;
  strictDependencies?: boolean; // When true, each package gets all its deps in nested node_modules
  hoistPattern?: string[];
  publicHoistPattern?: string[];
  
  // Scripts
  enableScripts?: boolean;
  ignoreScripts?: boolean;
  shellEmulator?: boolean;
  
  // Output
  color?: boolean;
  progress?: boolean;
  loglevel?: 'silent' | 'error' | 'warn' | 'info' | 'verbose' | 'debug';
  
  // Workspace
  linkWorkspacePackages?: boolean;
  preferWorkspacePackages?: boolean;
  
  // Hooks
  hooks?: {
    preInstall?: string;
    postInstall?: string;
    preAdd?: string;
    postAdd?: string;
    preRemove?: string;
    postRemove?: string;
  };
  
  // Overrides
  overrides?: Record<string, string | Record<string, string>>;
  resolutions?: Record<string, string>;
}

export const DEFAULT_CONFIG: Required<Pick<VexConfig, 
  | 'registry'
  | 'saveExact'
  | 'saveDev'
  | 'production'
  | 'frozen'
  | 'preferOffline'
  | 'offline'
  | 'autoInstallPeers'
  | 'strictPeerDependencies'
  | 'concurrency'
  | 'networkTimeout'
  | 'retries'
  | 'nodeLinker'
  | 'shamefullyHoist'
  | 'enableScripts'
  | 'ignoreScripts'
  | 'color'
  | 'progress'
  | 'loglevel'
  | 'linkWorkspacePackages'
  | 'preferWorkspacePackages'
>> = {
  registry: 'https://registry.npmjs.org',
  saveExact: true,
  saveDev: false,
  production: false,
  frozen: false,
  preferOffline: false,
  offline: false,
  autoInstallPeers: true,
  strictPeerDependencies: false,
  concurrency: 16,
  networkTimeout: 30000,
  retries: 3,
  nodeLinker: 'isolated',
  shamefullyHoist: false,
  enableScripts: true,
  ignoreScripts: false,
  color: true,
  progress: true,
  loglevel: 'info',
  linkWorkspacePackages: true,
  preferWorkspacePackages: true,
};

