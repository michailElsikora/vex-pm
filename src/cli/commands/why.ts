/**
 * Why command - shows why a package is installed
 */

import { CommandContext } from '../index';
import { ConfigLoader } from '../../config';
import { LockfileManager } from '../../core/lockfile';
import { logger, COLORS } from '../../utils/logger';

interface DependencyPath {
  path: string[];
  dev: boolean;
  optional: boolean;
}

export async function whyCommand(ctx: CommandContext): Promise<number> {
  if (ctx.positionals.length === 0) {
    logger.error('No package specified');
    logger.log('Usage: vex why <package>');
    return 1;
  }

  const packageName = ctx.positionals[0];
  const configLoader = new ConfigLoader({ cwd: ctx.cwd, configPath: ctx.configPath });

  // Load package.json
  const packageJson = configLoader.getPackageJson();
  if (!packageJson) {
    logger.error('No package.json found');
    return 1;
  }

  // Load lockfile
  const lockfileManager = new LockfileManager({ cwd: ctx.cwd });
  const lockfile = lockfileManager.read();

  if (!lockfile) {
    logger.error('No lockfile found. Run "vex install" first.');
    return 1;
  }

  // Find all paths to the package
  const paths = findDependencyPaths(packageName, packageJson, lockfile.packages);

  if (paths.length === 0) {
    logger.info(`Package "${packageName}" is not installed`);
    return 0;
  }

  logger.info(`Why is ${logger.packageName(packageName)} installed?`);
  logger.newline();

  // Check if it's a direct dependency
  const isDirect = 
    packageJson.dependencies?.[packageName] ||
    packageJson.devDependencies?.[packageName] ||
    packageJson.optionalDependencies?.[packageName] ||
    packageJson.peerDependencies?.[packageName];

  if (isDirect) {
    const depType = 
      packageJson.dependencies?.[packageName] ? 'dependencies' :
      packageJson.devDependencies?.[packageName] ? 'devDependencies' :
      packageJson.optionalDependencies?.[packageName] ? 'optionalDependencies' :
      'peerDependencies';
    
    const version = 
      packageJson.dependencies?.[packageName] ||
      packageJson.devDependencies?.[packageName] ||
      packageJson.optionalDependencies?.[packageName] ||
      packageJson.peerDependencies?.[packageName];

    console.log(`${COLORS.green}✓${COLORS.reset} Direct dependency in ${COLORS.cyan}${depType}${COLORS.reset}`);
    console.log(`  ${packageJson.name || 'project'} → ${packageName}@${version}`);
    logger.newline();
  }

  // Show dependency chains
  const indirectPaths = paths.filter(p => p.path.length > 2);
  
  if (indirectPaths.length > 0) {
    console.log(`${COLORS.cyan}Dependency chain(s):${COLORS.reset}`);
    logger.newline();

    // Deduplicate and limit paths
    const uniquePaths = deduplicatePaths(indirectPaths).slice(0, 10);

    for (const { path: depPath, dev, optional } of uniquePaths) {
      const tags: string[] = [];
      if (dev) tags.push('dev');
      if (optional) tags.push('optional');
      
      const tagStr = tags.length > 0 ? ` ${COLORS.dim}(${tags.join(', ')})${COLORS.reset}` : '';
      
      console.log(`  ${depPath.join(` ${COLORS.dim}→${COLORS.reset} `)}${tagStr}`);
    }

    if (paths.length > uniquePaths.length) {
      logger.newline();
      logger.log(`  ... and ${paths.length - uniquePaths.length} more paths`);
    }
  }

  // Show installed version
  logger.newline();
  const installedVersions = Object.entries(lockfile.packages)
    .filter(([key]) => key.startsWith(`${packageName}@`))
    .map(([key, pkg]) => pkg.version);

  if (installedVersions.length > 0) {
    console.log(`${COLORS.cyan}Installed version(s):${COLORS.reset} ${installedVersions.join(', ')}`);
  }

  return 0;
}

function findDependencyPaths(
  target: string,
  packageJson: { 
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  },
  packages: Record<string, { 
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    dev?: boolean;
    optional?: boolean;
  }>
): DependencyPath[] {
  const results: DependencyPath[] = [];
  const projectName = packageJson.name || 'project';

  // Build dependency graph
  const graph = new Map<string, Set<string>>();
  
  // Add direct dependencies
  const directDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.optionalDependencies,
  };

  graph.set(projectName, new Set(Object.keys(directDeps)));

  // Add transitive dependencies from lockfile
  for (const [key, pkg] of Object.entries(packages)) {
    const name = key.substring(0, key.lastIndexOf('@'));
    const deps = new Set([
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.optionalDependencies || {}),
    ]);
    
    if (!graph.has(name)) {
      graph.set(name, deps);
    } else {
      const existing = graph.get(name)!;
      deps.forEach(d => existing.add(d));
    }
  }

  // BFS to find paths
  const queue: Array<{ path: string[]; visited: Set<string> }> = [
    { path: [projectName], visited: new Set([projectName]) }
  ];

  while (queue.length > 0) {
    const { path: currentPath, visited } = queue.shift()!;
    const current = currentPath[currentPath.length - 1];
    const deps = graph.get(current);

    if (!deps) continue;

    for (const dep of deps) {
      if (visited.has(dep)) continue;

      const newPath = [...currentPath, dep];
      
      if (dep === target) {
        // Found target
        const isDev = packageJson.devDependencies?.[currentPath[1]] !== undefined;
        const isOptional = packageJson.optionalDependencies?.[currentPath[1]] !== undefined;
        
        results.push({
          path: newPath,
          dev: isDev,
          optional: isOptional,
        });
      } else {
        // Continue searching
        const newVisited = new Set(visited);
        newVisited.add(dep);
        queue.push({ path: newPath, visited: newVisited });
      }
    }
  }

  return results;
}

function deduplicatePaths(paths: DependencyPath[]): DependencyPath[] {
  const seen = new Set<string>();
  return paths.filter(p => {
    const key = p.path.join('->');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

