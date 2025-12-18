/**
 * Help text generation
 */

import { COLORS } from '../utils/logger';

const VERSION = '1.0.2';

interface CommandHelp {
  name: string;
  description: string;
  usage: string;
  options?: Array<{
    flags: string;
    description: string;
  }>;
  examples?: Array<{
    command: string;
    description: string;
  }>;
}

const COMMANDS: CommandHelp[] = [
  {
    name: 'install',
    description: 'Install all dependencies from package.json',
    usage: 'vex install [options]',
    options: [
      { flags: '-P, --production', description: 'Skip devDependencies' },
      { flags: '-D, --dev', description: 'Install only devDependencies' },
      { flags: '--frozen', description: 'Fail if lockfile needs update' },
      { flags: '--prefer-offline', description: 'Use cached packages when possible' },
      { flags: '--offline', description: 'Fail if network requests needed' },
      { flags: '--ignore-scripts', description: 'Skip lifecycle scripts' },
    ],
    examples: [
      { command: 'vex install', description: 'Install all dependencies' },
      { command: 'vex install --production', description: 'Install only production deps' },
      { command: 'vex install --frozen', description: 'CI mode, fail if lockfile outdated' },
    ],
  },
  {
    name: 'add',
    description: 'Add packages to dependencies',
    usage: 'vex add <packages...> [options]',
    options: [
      { flags: '-D, --dev', description: 'Add to devDependencies' },
      { flags: '-P, --peer', description: 'Add to peerDependencies' },
      { flags: '-O, --optional', description: 'Add to optionalDependencies' },
      { flags: '-E, --exact', description: 'Save exact version (default)' },
      { flags: '-T, --tilde', description: 'Save with ~ prefix' },
      { flags: '-C, --caret', description: 'Save with ^ prefix' },
    ],
    examples: [
      { command: 'vex add lodash', description: 'Add lodash to dependencies' },
      { command: 'vex add -D typescript', description: 'Add typescript to devDependencies' },
      { command: 'vex add express@4.18.0', description: 'Add specific version' },
    ],
  },
  {
    name: 'remove',
    description: 'Remove packages from dependencies',
    usage: 'vex remove <packages...>',
    examples: [
      { command: 'vex remove lodash', description: 'Remove lodash' },
      { command: 'vex remove lodash express', description: 'Remove multiple packages' },
    ],
  },
  {
    name: 'run',
    description: 'Run scripts from package.json',
    usage: 'vex run <script> [args...]',
    options: [
      { flags: '-p, --parallel', description: 'Run multiple scripts in parallel' },
      { flags: '-s, --sequential', description: 'Run multiple scripts sequentially' },
    ],
    examples: [
      { command: 'vex run build', description: 'Run build script' },
      { command: 'vex run test -- --watch', description: 'Run test with arguments' },
      { command: 'vex run build test lint', description: 'Run multiple scripts' },
    ],
  },
  {
    name: 'init',
    description: 'Initialize a new package.json',
    usage: 'vex init [options]',
    options: [
      { flags: '-y, --yes', description: 'Accept all defaults' },
    ],
  },
  {
    name: 'why',
    description: 'Show why a package is installed',
    usage: 'vex why <package>',
    examples: [
      { command: 'vex why lodash', description: 'Show dependency chain for lodash' },
    ],
  },
  {
    name: 'list',
    description: 'List installed packages',
    usage: 'vex list [options]',
    options: [
      { flags: '--depth <n>', description: 'Limit tree depth' },
      { flags: '--prod', description: 'Show only production deps' },
      { flags: '--dev', description: 'Show only dev deps' },
      { flags: '--json', description: 'Output as JSON' },
    ],
  },
  {
    name: 'link',
    description: 'Link local package globally or link global package locally',
    usage: 'vex link [package]',
    examples: [
      { command: 'vex link', description: 'Link current package globally' },
      { command: 'vex link my-lib', description: 'Link global my-lib to local node_modules' },
    ],
  },
  {
    name: 'unlink',
    description: 'Remove package link',
    usage: 'vex unlink [package]',
    examples: [
      { command: 'vex unlink', description: 'Unlink current package from global' },
      { command: 'vex unlink my-lib', description: 'Unlink my-lib from local node_modules' },
    ],
  },
  {
    name: 'links',
    description: 'List all globally linked packages',
    usage: 'vex links',
  },
  {
    name: 'publish',
    description: 'Publish package to registry',
    usage: 'vex publish [options]',
    options: [
      { flags: '--registry <url>', description: 'Registry URL' },
      { flags: '--tag <tag>', description: 'Publish with specific tag' },
      { flags: '--access <public|restricted>', description: 'Package access level' },
      { flags: '--dry-run', description: 'Report what would be published' },
    ],
    examples: [
      { command: 'vex publish', description: 'Publish to default registry' },
      { command: 'vex publish --registry http://localhost:4873', description: 'Publish to local registry' },
    ],
  },
  {
    name: 'login',
    description: 'Authenticate with registry',
    usage: 'vex login [options]',
    options: [
      { flags: '--registry <url>', description: 'Registry URL' },
    ],
    examples: [
      { command: 'vex login', description: 'Login to default registry' },
      { command: 'vex login --registry http://localhost:4873', description: 'Login to local registry' },
    ],
  },
  {
    name: 'logout',
    description: 'Remove registry authentication',
    usage: 'vex logout [options]',
    options: [
      { flags: '--registry <url>', description: 'Registry URL' },
    ],
  },
  {
    name: 'whoami',
    description: 'Show current logged in user',
    usage: 'vex whoami [options]',
    options: [
      { flags: '--registry <url>', description: 'Registry URL' },
    ],
  },
  {
    name: 'config',
    description: 'Manage configuration',
    usage: 'vex config <get|set|delete|list> [key] [value]',
    examples: [
      { command: 'vex config list', description: 'Show all config' },
      { command: 'vex config set registry http://localhost:4873', description: 'Set registry' },
      { command: 'vex config get registry', description: 'Get registry' },
      { command: 'vex config delete registry', description: 'Delete registry setting' },
    ],
  },
  {
    name: 'outdated',
    description: 'Check for outdated packages',
    usage: 'vex outdated [options]',
    options: [
      { flags: '--json', description: 'Output as JSON' },
    ],
  },
  {
    name: 'update',
    description: 'Update packages to latest versions',
    usage: 'vex update [packages...] [options]',
    options: [
      { flags: '--latest', description: 'Ignore version ranges, update to latest' },
    ],
  },
  {
    name: 'cache',
    description: 'Manage package cache',
    usage: 'vex cache <command>',
    examples: [
      { command: 'vex cache list', description: 'List all cached packages' },
      { command: 'vex cache size', description: 'Show cache size' },
      { command: 'vex cache path', description: 'Show cache directories' },
      { command: 'vex cache clean', description: 'Clear tarball cache' },
      { command: 'vex cache clean all', description: 'Clear all caches' },
    ],
  },
  {
    name: 'self-update',
    description: 'Update vex to the latest version',
    usage: 'vex self-update',
    examples: [
      { command: 'vex self-update', description: 'Update to latest version' },
      { command: 'vex upgrade', description: 'Alias for self-update' },
    ],
  },
  {
    name: 'doctor',
    description: 'Diagnose common issues',
    usage: 'vex doctor',
  },
];

export function showMainHelp(): void {
  console.log(`
${COLORS.bold}vex${COLORS.reset} - Fast, disk-efficient package manager

${COLORS.bold}Usage:${COLORS.reset}
  vex <command> [options]

${COLORS.bold}Commands:${COLORS.reset}
${COMMANDS.map(cmd => `  ${COLORS.cyan}${cmd.name.padEnd(12)}${COLORS.reset} ${cmd.description}`).join('\n')}

${COLORS.bold}Global Options:${COLORS.reset}
  -h, --help        Show help
  -v, --version     Show version
  --verbose         Verbose output
  -s, --silent      Silent mode
  --no-color        Disable colors
  -C, --cwd <dir>   Set working directory
  -c, --config      Config file path

${COLORS.bold}Examples:${COLORS.reset}
  ${COLORS.dim}# Install all dependencies${COLORS.reset}
  vex install

  ${COLORS.dim}# Add a package${COLORS.reset}
  vex add lodash

  ${COLORS.dim}# Run a script${COLORS.reset}
  vex run build

Run ${COLORS.cyan}vex <command> --help${COLORS.reset} for detailed help on a command.
`);
}

export function showCommandHelp(commandName: string): void {
  const cmd = COMMANDS.find(c => c.name === commandName);
  
  if (!cmd) {
    console.log(`Unknown command: ${commandName}`);
    console.log(`Run ${COLORS.cyan}vex --help${COLORS.reset} for available commands.`);
    return;
  }

  console.log(`
${COLORS.bold}vex ${cmd.name}${COLORS.reset} - ${cmd.description}

${COLORS.bold}Usage:${COLORS.reset}
  ${cmd.usage}
`);

  if (cmd.options && cmd.options.length > 0) {
    console.log(`${COLORS.bold}Options:${COLORS.reset}`);
    for (const opt of cmd.options) {
      console.log(`  ${COLORS.cyan}${opt.flags.padEnd(24)}${COLORS.reset} ${opt.description}`);
    }
    console.log();
  }

  if (cmd.examples && cmd.examples.length > 0) {
    console.log(`${COLORS.bold}Examples:${COLORS.reset}`);
    for (const ex of cmd.examples) {
      console.log(`  ${COLORS.dim}# ${ex.description}${COLORS.reset}`);
      console.log(`  ${ex.command}`);
      console.log();
    }
  }
}

export function showVersion(): void {
  console.log(`vex ${VERSION}`);
}

export { VERSION };

