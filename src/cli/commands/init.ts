/**
 * Init command - creates a new package.json
 */

import * as path from 'path';
import * as readline from 'readline';
import { CommandContext } from '../index';
import { PackageJson } from '../../types/package';
import { exists, writeJson } from '../../utils/fs';
import { logger } from '../../utils/logger';

export async function initCommand(ctx: CommandContext): Promise<number> {
  const packageJsonPath = path.join(ctx.cwd, 'package.json');

  // Check if package.json already exists
  if (exists(packageJsonPath)) {
    logger.error('package.json already exists');
    return 1;
  }

  const useDefaults = ctx.flags.yes || ctx.flags.y;
  const dirName = path.basename(ctx.cwd);

  let packageJson: PackageJson;

  if (useDefaults) {
    // Use defaults
    packageJson = createDefaultPackageJson(dirName);
  } else {
    // Interactive mode
    packageJson = await createInteractivePackageJson(dirName);
  }

  // Write package.json
  writeJson(packageJsonPath, packageJson);
  
  logger.success('Created package.json');
  logger.newline();
  
  // Show created content
  logger.log(JSON.stringify(packageJson, null, 2));

  return 0;
}

function createDefaultPackageJson(name: string): PackageJson {
  return {
    name: sanitizeName(name),
    version: '1.0.0',
    description: '',
    main: 'index.js',
    scripts: {
      test: 'echo "Error: no test specified" && exit 1',
    },
    keywords: [],
    author: '',
    license: 'ISC',
  };
}

async function createInteractivePackageJson(defaultName: string): Promise<PackageJson> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string, defaultValue?: string): Promise<string> => {
    return new Promise((resolve) => {
      const displayPrompt = defaultValue 
        ? `${prompt} (${defaultValue}): `
        : `${prompt}: `;
      
      rl.question(displayPrompt, (answer) => {
        resolve(answer.trim() || defaultValue || '');
      });
    });
  };

  logger.info('This utility will walk you through creating a package.json file.');
  logger.log('Press ^C at any time to quit.');
  logger.newline();

  try {
    const name = await question('package name', sanitizeName(defaultName));
    const version = await question('version', '1.0.0');
    const description = await question('description');
    const main = await question('entry point', 'index.js');
    const testCommand = await question('test command');
    const repository = await question('git repository');
    const keywords = await question('keywords');
    const author = await question('author');
    const license = await question('license', 'ISC');

    const packageJson: PackageJson = {
      name,
      version,
      description: description || undefined,
      main,
      scripts: {
        test: testCommand || 'echo "Error: no test specified" && exit 1',
      },
      keywords: keywords ? keywords.split(/[,\s]+/).filter(Boolean) : [],
      author: author || undefined,
      license,
    };

    if (repository) {
      packageJson.repository = {
        type: 'git',
        url: repository,
      };
    }

    // Remove undefined values
    const cleaned = JSON.parse(JSON.stringify(packageJson));

    logger.newline();
    logger.log('About to write to package.json:');
    logger.newline();
    logger.log(JSON.stringify(cleaned, null, 2));
    logger.newline();

    const confirm = await question('Is this OK?', 'yes');
    
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      logger.info('Aborted.');
      process.exit(0);
    }

    return cleaned;
  } finally {
    rl.close();
  }
}

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-._~]/g, '')
    .replace(/^[._]/, '')
    .replace(/[._]$/, '')
    .substring(0, 214);
}

