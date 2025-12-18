/**
 * List command - lists installed packages
 */

import * as path from 'path';
import { CommandContext } from '../index';
import { ConfigLoader } from '../../config';
import { LockfileManager } from '../../core/lockfile';
import { exists, readJson } from '../../utils/fs';
import { logger, COLORS } from '../../utils/logger';

interface ListOptions {
  depth: number;
  prod: boolean;
  dev: boolean;
  json: boolean;
}

interface TreeNode {
  name: string;
  version: string;
  dependencies?: Record<string, TreeNode>;
  dev?: boolean;
  optional?: boolean;
}

export async function listCommand(ctx: CommandContext): Promise<number> {
  const configLoader = new ConfigLoader({ cwd: ctx.cwd, configPath: ctx.configPath });

  // Load package.json
  const packageJson = configLoader.getPackageJson();
  if (!packageJson) {
    logger.error('No package.json found');
    return 1;
  }

  // Parse options
  const options: ListOptions = {
    depth: parseInt(ctx.options.depth || '1', 10),
    prod: ctx.flags.prod || false,
    dev: ctx.flags.dev || false,
    json: ctx.flags.json || false,
  };

  // Check node_modules
  const nodeModulesPath = path.join(ctx.cwd, 'node_modules');
  if (!exists(nodeModulesPath)) {
    logger.info('No packages installed');
    return 0;
  }

  // Load lockfile
  const lockfileManager = new LockfileManager({ cwd: ctx.cwd });
  const lockfile = lockfileManager.read();

  // Build tree
  const tree: TreeNode = {
    name: packageJson.name || 'project',
    version: packageJson.version || '0.0.0',
    dependencies: {},
  };

  // Get direct dependencies
  const deps: Array<{ name: string; range: string; dev: boolean; optional: boolean }> = [];

  if (!options.dev && packageJson.dependencies) {
    for (const [name, range] of Object.entries(packageJson.dependencies)) {
      deps.push({ name, range, dev: false, optional: false });
    }
  }

  if (!options.prod && packageJson.devDependencies) {
    for (const [name, range] of Object.entries(packageJson.devDependencies)) {
      deps.push({ name, range, dev: true, optional: false });
    }
  }

  if (!options.dev && packageJson.optionalDependencies) {
    for (const [name, range] of Object.entries(packageJson.optionalDependencies)) {
      deps.push({ name, range, dev: false, optional: true });
    }
  }

  // Build dependency tree
  for (const dep of deps) {
    const node = buildNode(dep.name, nodeModulesPath, lockfile?.packages || {}, options.depth, new Set());
    if (node) {
      node.dev = dep.dev;
      node.optional = dep.optional;
      tree.dependencies![dep.name] = node;
    }
  }

  // Output
  if (options.json) {
    console.log(JSON.stringify(tree, null, 2));
  } else {
    printTree(tree, '', true);
  }

  // Summary
  const totalPackages = countPackages(tree);
  if (!options.json) {
    logger.newline();
    logger.log(`${totalPackages} packages`);
  }

  return 0;
}

function buildNode(
  name: string,
  nodeModulesPath: string,
  lockfilePackages: Record<string, { version: string; dependencies?: Record<string, string> }>,
  depth: number,
  visited: Set<string>
): TreeNode | null {
  // Prevent infinite loops
  if (visited.has(name)) {
    return null;
  }

  // Check package exists
  const pkgPath = path.join(nodeModulesPath, name, 'package.json');
  if (!exists(pkgPath)) {
    return null;
  }

  // Read version
  let version = '?';
  try {
    const pkgJson = readJson<{ version: string }>(pkgPath);
    version = pkgJson.version;
  } catch {
    // Use lockfile version if available
    for (const [key, pkg] of Object.entries(lockfilePackages)) {
      if (key.startsWith(`${name}@`)) {
        version = pkg.version;
        break;
      }
    }
  }

  const node: TreeNode = {
    name,
    version,
  };

  // Add children if depth allows
  if (depth > 0) {
    const newVisited = new Set(visited);
    newVisited.add(name);

    // Find dependencies from lockfile
    for (const [key, pkg] of Object.entries(lockfilePackages)) {
      if (key.startsWith(`${name}@`) && pkg.dependencies) {
        node.dependencies = {};
        
        for (const depName of Object.keys(pkg.dependencies)) {
          const child = buildNode(depName, nodeModulesPath, lockfilePackages, depth - 1, newVisited);
          if (child) {
            node.dependencies[depName] = child;
          }
        }
        
        break;
      }
    }
  }

  return node;
}

function printTree(node: TreeNode, prefix: string, isLast: boolean, isRoot = true): void {
  const connector = isRoot ? '' : (isLast ? '└── ' : '├── ');
  const nameColor = node.dev ? COLORS.yellow : (node.optional ? COLORS.gray : COLORS.cyan);
  
  let line = `${prefix}${connector}${nameColor}${node.name}${COLORS.reset}@${COLORS.green}${node.version}${COLORS.reset}`;
  
  const tags: string[] = [];
  if (node.dev) tags.push('dev');
  if (node.optional) tags.push('optional');
  if (tags.length > 0) {
    line += ` ${COLORS.dim}(${tags.join(', ')})${COLORS.reset}`;
  }
  
  console.log(line);

  if (node.dependencies) {
    const deps = Object.entries(node.dependencies);
    const newPrefix = isRoot ? '' : (prefix + (isLast ? '    ' : '│   '));
    
    deps.forEach(([, child], index) => {
      printTree(child, newPrefix, index === deps.length - 1, false);
    });
  }
}

function countPackages(node: TreeNode): number {
  let count = 1;
  
  if (node.dependencies) {
    for (const child of Object.values(node.dependencies)) {
      count += countPackages(child);
    }
  }
  
  return count;
}

