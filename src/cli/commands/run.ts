/**
 * Run command - runs scripts from package.json
 */

import * as path from 'path';
import { spawn } from 'child_process';
import { CommandContext } from '../index';
import { ConfigLoader } from '../../config';
import { getShellCommand, isWindows } from '../../utils/platform';
import { exists } from '../../utils/fs';
import { logger, COLORS } from '../../utils/logger';

export async function runCommand(ctx: CommandContext): Promise<number> {
  const configLoader = new ConfigLoader({ cwd: ctx.cwd, configPath: ctx.configPath });
  
  // Load package.json
  const packageJson = configLoader.getPackageJson();
  if (!packageJson) {
    logger.error('No package.json found');
    return 1;
  }

  const scripts = packageJson.scripts || {};

  // No script specified - list available scripts
  if (ctx.positionals.length === 0) {
    if (Object.keys(scripts).length === 0) {
      logger.info('No scripts defined in package.json');
      return 0;
    }

    logger.info('Available scripts:');
    logger.newline();
    
    for (const [name, command] of Object.entries(scripts)) {
      console.log(`  ${COLORS.cyan}${name}${COLORS.reset}`);
      console.log(`    ${COLORS.dim}${command}${COLORS.reset}`);
    }
    
    return 0;
  }

  // Check for parallel flag
  const parallel = ctx.flags.parallel || ctx.flags.p;
  const scriptNames = ctx.positionals;

  // Validate scripts exist
  const missingScripts = scriptNames.filter(name => !scripts[name]);
  if (missingScripts.length > 0) {
    for (const name of missingScripts) {
      // Check if it's a binary in node_modules/.bin
      const binPath = path.join(ctx.cwd, 'node_modules', '.bin', name);
      if (!exists(binPath) && !exists(binPath + '.cmd')) {
        logger.error(`Script "${name}" not found`);
      }
    }
    
    if (missingScripts.every(name => {
      const binPath = path.join(ctx.cwd, 'node_modules', '.bin', name);
      return !exists(binPath) && !exists(binPath + '.cmd') && !scripts[name];
    })) {
      return 1;
    }
  }

  // Run scripts
  if (parallel && scriptNames.length > 1) {
    return runParallel(ctx, scriptNames, scripts);
  } else {
    return runSequential(ctx, scriptNames, scripts);
  }
}

async function runSequential(
  ctx: CommandContext,
  scriptNames: string[],
  scripts: Record<string, string>
): Promise<number> {
  for (const name of scriptNames) {
    const command = scripts[name];
    
    if (command) {
      logger.info(`Running script: ${name}`);
      logger.log(`${COLORS.dim}$ ${command}${COLORS.reset}`);
      logger.newline();
      
      const exitCode = await executeCommand(command, ctx.cwd);
      
      if (exitCode !== 0) {
        logger.error(`Script "${name}" exited with code ${exitCode}`);
        return exitCode;
      }
      
      logger.newline();
    } else {
      // Try running as binary
      const exitCode = await executeBinary(name, ctx);
      if (exitCode !== 0) {
        return exitCode;
      }
    }
  }

  return 0;
}

async function runParallel(
  ctx: CommandContext,
  scriptNames: string[],
  scripts: Record<string, string>
): Promise<number> {
  logger.info(`Running ${scriptNames.length} scripts in parallel...`);
  logger.newline();

  const promises = scriptNames.map(async (name) => {
    const command = scripts[name];
    
    if (command) {
      logger.log(`${COLORS.cyan}[${name}]${COLORS.reset} Starting...`);
      const exitCode = await executeCommand(command, ctx.cwd, name);
      
      if (exitCode !== 0) {
        logger.log(`${COLORS.red}[${name}]${COLORS.reset} Failed with code ${exitCode}`);
      } else {
        logger.log(`${COLORS.green}[${name}]${COLORS.reset} Completed`);
      }
      
      return { name, exitCode };
    } else {
      // Try running as binary
      const exitCode = await executeBinary(name, ctx, name);
      return { name, exitCode };
    }
  });

  const results = await Promise.all(promises);
  const failed = results.filter(r => r.exitCode !== 0);

  logger.newline();
  
  if (failed.length > 0) {
    logger.error(`${failed.length} script(s) failed:`);
    for (const { name, exitCode } of failed) {
      logger.log(`  ${name}: exit code ${exitCode}`);
    }
    return 1;
  }

  logger.success(`All ${scriptNames.length} scripts completed successfully`);
  return 0;
}

function executeCommand(
  command: string,
  cwd: string,
  prefix?: string
): Promise<number> {
  return new Promise((resolve) => {
    const { shell, flag } = getShellCommand();
    
    // Add node_modules/.bin to PATH
    const binPath = path.join(cwd, 'node_modules', '.bin');
    const env = {
      ...process.env,
      PATH: binPath + path.delimiter + process.env.PATH,
    };

    const proc = spawn(shell, [flag, command], {
      cwd,
      env,
      stdio: prefix ? 'pipe' : 'inherit',
    });

    if (prefix && proc.stdout && proc.stderr) {
      proc.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            console.log(`${COLORS.dim}[${prefix}]${COLORS.reset} ${line}`);
          }
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            console.error(`${COLORS.dim}[${prefix}]${COLORS.reset} ${line}`);
          }
        }
      });
    }

    proc.on('error', (error) => {
      logger.error(`Failed to execute command: ${error.message}`);
      resolve(1);
    });

    proc.on('close', (code) => {
      resolve(code ?? 0);
    });
  });
}

async function executeBinary(
  name: string,
  ctx: CommandContext,
  prefix?: string
): Promise<number> {
  const binDir = path.join(ctx.cwd, 'node_modules', '.bin');
  let binPath = path.join(binDir, name);
  
  if (isWindows()) {
    if (exists(binPath + '.cmd')) {
      binPath = binPath + '.cmd';
    } else if (exists(binPath + '.ps1')) {
      binPath = binPath + '.ps1';
    }
  }

  if (!exists(binPath)) {
    logger.error(`Binary "${name}" not found in node_modules/.bin`);
    return 1;
  }

  logger.info(`Running binary: ${name}`);
  return executeCommand(binPath, ctx.cwd, prefix);
}

