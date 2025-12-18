/**
 * Login command - authenticates with registry
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { CommandContext } from '../index';
import { ConfigLoader } from '../../config';
import { logger } from '../../utils/logger';
import { Spinner } from '../../utils/progress';
import { exists, mkdirp } from '../../utils/fs';

interface VexConfig {
  tokens?: Record<string, string>;
  token?: string;
  registry?: string;
}

export async function loginCommand(ctx: CommandContext): Promise<number> {
  const configLoader = new ConfigLoader({ cwd: ctx.cwd });
  const config = configLoader.load();
  const registry = ctx.options.registry || config.registry || 'http://localhost:4873';

  logger.log(`Logging in to ${registry}`);
  logger.newline();

  // Get credentials
  const username = await prompt('Username: ');
  const password = await promptPassword('Password: ');

  if (!username || !password) {
    logger.error('Username and password are required');
    return 1;
  }

  const spinner = new Spinner('Authenticating...', ctx.silent);
  spinner.start();

  try {
    // Authenticate with registry
    const response = await fetch(`${registry}/-/user/org.couchdb.user:${username}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        _id: `org.couchdb.user:${username}`,
        name: username,
        password,
        type: 'user',
      }),
    });

    // Also try the /api/auth/login endpoint for vex registry
    let token: string | null = null;
    
    if (response.ok) {
      const data = await response.json() as { token?: string };
      token = data.token || null;
    } else {
      // Try vex-specific login
      const vexResponse = await fetch(`${registry}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (vexResponse.ok) {
        const data = await vexResponse.json() as { token?: string };
        token = data.token || null;
      } else {
        const errorData = await vexResponse.json().catch(() => ({})) as { message?: string; error?: string };
        throw new Error(errorData.message || errorData.error || `Authentication failed`);
      }
    }

    if (!token) {
      throw new Error('No token received from server');
    }

    // Save token
    saveToken(registry, token);

    spinner.success(`Logged in as ${username}`);
    logger.log(`  Token saved to ~/.vexrc`);
    
    return 0;
  } catch (error) {
    spinner.fail(`Login failed: ${error}`);
    return 1;
  }
}

/**
 * Logout command
 */
export async function logoutCommand(ctx: CommandContext): Promise<number> {
  const configLoader = new ConfigLoader({ cwd: ctx.cwd });
  const config = configLoader.load();
  const registry = ctx.options.registry || config.registry || 'http://localhost:4873';

  const configPath = getConfigPath();
  if (!exists(configPath)) {
    logger.log('Not logged in');
    return 0;
  }

  try {
    const vexConfig: VexConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    if (vexConfig.tokens?.[registry]) {
      delete vexConfig.tokens[registry];
      fs.writeFileSync(configPath, JSON.stringify(vexConfig, null, 2));
    }

    logger.success(`Logged out from ${registry}`);
    return 0;
  } catch (error) {
    logger.error(`Logout failed: ${error}`);
    return 1;
  }
}

/**
 * Whoami command - show current user
 */
export async function whoamiCommand(ctx: CommandContext): Promise<number> {
  const configLoader = new ConfigLoader({ cwd: ctx.cwd });
  const config = configLoader.load();
  const registry = ctx.options.registry || config.registry || 'http://localhost:4873';
  
  const token = getStoredToken(registry);
  if (!token) {
    logger.error('Not logged in. Run "vex login" first.');
    return 1;
  }

  try {
    // Try vex-specific whoami
    const response = await fetch(`${registry}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Invalid token');
    }

    const data = await response.json() as { user?: { username?: string }; username?: string };
    logger.log(data.user?.username || data.username || 'Unknown user');
    return 0;
  } catch (error) {
    logger.error(`Failed to get user info: ${error}`);
    return 1;
  }
}

/**
 * Save token to config
 */
function saveToken(registry: string, token: string): void {
  const configPath = getConfigPath();
  let config: VexConfig = {};
  
  if (exists(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      // Start fresh
    }
  }

  if (!config.tokens) {
    config.tokens = {};
  }
  
  config.tokens[registry] = token;
  
  // Ensure directory exists
  const configDir = path.dirname(configPath);
  mkdirp(configDir);
  
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Get stored token
 */
function getStoredToken(registry: string): string | null {
  const configPath = getConfigPath();
  if (!exists(configPath)) {
    return null;
  }
  
  try {
    const config: VexConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config.tokens?.[registry] || config.token || null;
  } catch {
    return null;
  }
}

/**
 * Get config file path
 */
function getConfigPath(): string {
  return path.join(process.env.HOME || '', '.vexrc');
}

/**
 * Simple prompt
 */
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Password prompt (hidden input)
 */
function promptPassword(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    
    stdout.write(question);
    
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    
    let password = '';
    
    const onData = (char: string) => {
      const charCode = char.charCodeAt(0);
      
      if (charCode === 13 || charCode === 10) {
        // Enter
        stdin.setRawMode?.(false);
        stdin.removeListener('data', onData);
        stdout.write('\n');
        resolve(password);
      } else if (charCode === 127 || charCode === 8) {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
          stdout.clearLine?.(0);
          stdout.cursorTo?.(0);
          stdout.write(question + '*'.repeat(password.length));
        }
      } else if (charCode === 3) {
        // Ctrl+C
        stdin.setRawMode?.(false);
        process.exit(1);
      } else if (charCode >= 32) {
        // Printable character
        password += char;
        stdout.write('*');
      }
    };
    
    stdin.on('data', onData);
  });
}

